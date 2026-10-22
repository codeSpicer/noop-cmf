/**
 * Gadgetbridge SQLite provider: parses real Gadgetbridge exports into
 * canonical @noop-cmf/types via sql.js (WASM).
 *
 * Real schema (verified against a live CMF Watch Pro 2 export):
 *   CMF_HEART_RATE_SAMPLE(TIMESTAMP ms, HEART_RATE)
 *   CMF_STRESS_SAMPLE(TIMESTAMP ms, STRESS)
 *   CMF_SPO2_SAMPLE(TIMESTAMP ms, SPO2)
 *   CMF_SLEEP_STAGE_SAMPLE(TIMESTAMP ms, DURATION s, STAGE 1=deep/2=light/3=rem)
 *   CMF_ACTIVITY_SAMPLE(TIMESTAMP s, STEPS, RAW_KIND bitmask, HEART_RATE, DISTANCE, CALORIES)
 *   CMF_WORKOUT_GPS_SAMPLE(TIMESTAMP, LATITUDE, LONGITUDE)
 *   BASE_ACTIVITY_SUMMARY(_id, NAME, START_TIME/END_TIME s, ACTIVITY_KIND, SUMMARY_DATA, RAW_SUMMARY_DATA)
 *
 * Sleep-stage mapping (from Gadgetbridge `CmfActivitySampleProvider`):
 * stage 1 → deep, 2 → light, 3 → rem, anything else → unknown (skipped).
 */
import initSqlJs, { type Database } from 'sql.js';
import {
  BpmSchema,
  EpochMsSchema,
  SpO2PercentSchema,
  StressScoreSchema,
  type EpochMs,
  type HrSample,
  type Logger,
  type RecoveryNotificationInput,
  type SleepSegment,
  type SleepStage,
  type Spo2Sample,
  type StepSample,
  type StressSample,
  type TimeRange,
  type WatchDataProvider,
  type WatchProviderError,
  type Workout,
  type Result,
} from '@noop-cmf/types';
import { err, ok } from '@noop-cmf/types';
import { noopLogger } from '@noop-cmf/types';

/** Machine identifier for the Gadgetbridge import path. */
export const GADGETBRIDGE_PROVIDER_ID = 'gadgetbridge';

/** Human-readable label for the Gadgetbridge import path. */
export const GADGETBRIDGE_PROVIDER_LABEL = 'Gadgetbridge Import';

/** CREATE TABLE statements for a synthetic fixture database. */
export const GADGETBRIDGE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS DEVICE (_id INTEGER PRIMARY KEY, NAME TEXT NOT NULL, MANUFACTURER TEXT NOT NULL, IDENTIFIER TEXT NOT NULL UNIQUE, TYPE INTEGER NOT NULL, TYPE_NAME TEXT NOT NULL, MODEL TEXT, ALIAS TEXT, PARENT_FOLDER TEXT);
CREATE TABLE IF NOT EXISTS CMF_HEART_RATE_SAMPLE (TIMESTAMP INTEGER NOT NULL, DEVICE_ID INTEGER NOT NULL, USER_ID INTEGER NOT NULL, HEART_RATE INTEGER NOT NULL, PRIMARY KEY (TIMESTAMP, DEVICE_ID) ON CONFLICT REPLACE) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS CMF_STRESS_SAMPLE (TIMESTAMP INTEGER NOT NULL, DEVICE_ID INTEGER NOT NULL, USER_ID INTEGER NOT NULL, STRESS INTEGER NOT NULL, PRIMARY KEY (TIMESTAMP, DEVICE_ID) ON CONFLICT REPLACE) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS CMF_SPO2_SAMPLE (TIMESTAMP INTEGER NOT NULL, DEVICE_ID INTEGER NOT NULL, USER_ID INTEGER NOT NULL, SPO2 INTEGER NOT NULL, PRIMARY KEY (TIMESTAMP, DEVICE_ID) ON CONFLICT REPLACE) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS CMF_SLEEP_STAGE_SAMPLE (TIMESTAMP INTEGER NOT NULL, DEVICE_ID INTEGER NOT NULL, USER_ID INTEGER NOT NULL, DURATION INTEGER NOT NULL, STAGE INTEGER NOT NULL, PRIMARY KEY (TIMESTAMP, DEVICE_ID) ON CONFLICT REPLACE) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS CMF_ACTIVITY_SAMPLE (TIMESTAMP INTEGER NOT NULL, DEVICE_ID INTEGER NOT NULL, USER_ID INTEGER NOT NULL, RAW_INTENSITY INTEGER NOT NULL, STEPS INTEGER NOT NULL, RAW_KIND INTEGER NOT NULL, HEART_RATE INTEGER NOT NULL, DISTANCE INTEGER, CALORIES INTEGER, PRIMARY KEY (TIMESTAMP, DEVICE_ID) ON CONFLICT REPLACE) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS BASE_ACTIVITY_SUMMARY (_id INTEGER PRIMARY KEY, NAME TEXT, START_TIME INTEGER NOT NULL, END_TIME INTEGER NOT NULL, OVERRIDE_ACTIVITY_KIND INTEGER NOT NULL, ACTIVITY_KIND INTEGER NOT NULL, BASE_LONGITUDE INTEGER, BASE_LATITUDE INTEGER, BASE_ALTITUDE INTEGER, GPX_TRACK TEXT, RAW_DETAILS_PATH TEXT, HEADER_PHOTO TEXT, DEVICE_ID INTEGER NOT NULL, USER_ID INTEGER NOT NULL, SUMMARY_DATA TEXT, RAW_SUMMARY_DATA BLOB);
`;

/** Seconds per minute, for the mixed ms/s schema. */
export const MS_PER_SECOND = 1000;

/** Milliseconds per minute. */
export const MS_PER_MINUTE = 60_000;

/** CMF sleep stage byte for deep sleep. */
export const CMF_STAGE_DEEP = 1;

/** CMF sleep stage byte for light sleep. */
export const CMF_STAGE_LIGHT = 2;

/** CMF sleep stage byte for REM sleep. */
export const CMF_STAGE_REM = 3;

/** One synthetic row used to build fixture databases for tests. */
export interface FixturePoint {
  readonly timestampMs: EpochMs;
  readonly bpm?: number | undefined;
  readonly stress?: number | undefined;
  readonly spo2?: number | undefined;
}

/** One synthetic sleep stage used to build fixture databases for tests. */
export interface FixtureSleepStage {
  readonly timestampMs: EpochMs;
  readonly durationSeconds: number;
  readonly stage: number;
}

/** One synthetic activity row used to build fixture databases for tests. */
export interface FixtureActivity {
  readonly timestampSeconds: number;
  readonly steps?: number | undefined;
  readonly rawKind?: number | undefined;
  readonly heartRate?: number | undefined;
  readonly distance?: number | undefined;
  readonly calories?: number | undefined;
}

/** One synthetic workout summary used to build fixture databases for tests. */
export interface FixtureWorkoutSummary {
  readonly name?: string | undefined;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly activityKind: number;
}

/** Options for building a fixture database. */
export interface FixtureOptions {
  readonly deviceName?: string | undefined;
  readonly points?: readonly FixturePoint[] | undefined;
  readonly sleepStages?: readonly FixtureSleepStage[] | undefined;
  readonly activities?: readonly FixtureActivity[] | undefined;
  readonly workoutSummaries?: readonly FixtureWorkoutSummary[] | undefined;
}

/** Result of parsing a Gadgetbridge export file. */
export interface ParsedGadgetbridge {
  readonly hrSamples: HrSample[];
  readonly stressSamples: StressSample[];
  readonly spo2Samples: Spo2Sample[];
  readonly sleepSegments: SleepSegment[];
  readonly workouts: Workout[];
  readonly steps: StepSample[];
}

/** Location of the sql.js WASM binary served from the web app. */
export const SQL_WASM_PATH = '/sql-wasm.wasm';

let cachedSql: Awaited<ReturnType<typeof initSqlJs>> | undefined;

/**
 * True when running under Node.js (including jsdom test environments).
 */
function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process as { versions?: { node?: string } }).versions?.node !== undefined
  );
}

/**
 * Load (and cache) the sql.js WASM module.
 *
 * `locateFile` points at the WASM served from the app root in real
 * browsers; in Node (unit tests, SSR) sql.js resolves its own dist file.
 */
export async function loadSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!cachedSql) {
    cachedSql = isNode()
      ? await initSqlJs({})
      : await initSqlJs({ locateFile: () => SQL_WASM_PATH });
  }
  return cachedSql;
}

function hasTable(db: Database, name: string): boolean {
  const statement = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
  try {
    statement.bind([name]);
    return statement.step();
  } finally {
    statement.free();
  }
}

/**
 * Build an in-memory Gadgetbridge database file using the real CMF schema.
 */
export async function buildGadgetbridgeFixture(options: FixtureOptions = {}): Promise<Uint8Array> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  try {
    db.run(GADGETBRIDGE_SCHEMA_SQL);
    db.run(
      'INSERT INTO DEVICE (_id, NAME, MANUFACTURER, IDENTIFIER, TYPE, TYPE_NAME) VALUES (1, ?, ?, ?, 0, ?)',
      [
        options.deviceName ?? 'CMF Watch Pro 2',
        'Nothing',
        '2C:BE:EB:E7:D7:0F',
        'NOTHING_CMF_WATCH_PRO_2',
      ],
    );
    const points = options.points ?? [];
    points.forEach((point) => {
      if (point.bpm !== undefined) {
        db.run(
          'INSERT INTO CMF_HEART_RATE_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, HEART_RATE) VALUES (?, 1, 1, ?)',
          [point.timestampMs, point.bpm],
        );
      }
      if (point.stress !== undefined) {
        db.run(
          'INSERT INTO CMF_STRESS_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, STRESS) VALUES (?, 1, 1, ?)',
          [point.timestampMs, point.stress],
        );
      }
      if (point.spo2 !== undefined) {
        db.run(
          'INSERT INTO CMF_SPO2_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, SPO2) VALUES (?, 1, 1, ?)',
          [point.timestampMs, point.spo2],
        );
      }
    });
    const stages = options.sleepStages ?? [];
    stages.forEach((stage) => {
      db.run(
        'INSERT INTO CMF_SLEEP_STAGE_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, DURATION, STAGE) VALUES (?, 1, 1, ?, ?)',
        [stage.timestampMs, stage.durationSeconds, stage.stage],
      );
    });
    const activities = options.activities ?? [];
    activities.forEach((activity) => {
      db.run(
        'INSERT INTO CMF_ACTIVITY_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, RAW_INTENSITY, STEPS, RAW_KIND, HEART_RATE, DISTANCE, CALORIES) VALUES (?, 1, 1, 0, ?, ?, ?, ?, ?)',
        [
          activity.timestampSeconds,
          activity.steps ?? 0,
          activity.rawKind ?? 0,
          activity.heartRate ?? 0,
          activity.distance ?? null,
          activity.calories ?? null,
        ],
      );
    });
    const summaries = options.workoutSummaries ?? [];
    summaries.forEach((summary, index) => {
      db.run(
        'INSERT INTO BASE_ACTIVITY_SUMMARY (_id, NAME, START_TIME, END_TIME, OVERRIDE_ACTIVITY_KIND, ACTIVITY_KIND, DEVICE_ID, USER_ID) VALUES (?, ?, ?, ?, ?, ?, 1, 1)',
        [
          index + 1,
          summary.name ?? null,
          summary.startSeconds,
          summary.endSeconds,
          summary.activityKind,
          summary.activityKind,
        ],
      );
    });
    return db.export();
  } finally {
    db.close();
  }
}

/**
 * Parse a real Gadgetbridge SQLite export into canonical samples.
 *
 * CMF sample tables store `TIMESTAMP` in milliseconds (except
 * CMF_ACTIVITY_SAMPLE and BASE_ACTIVITY_SUMMARY, which use seconds).
 * Rows failing Zod validation are skipped rather than aborting the import.
 */
export async function parseGadgetbridgeFile(file: Uint8Array): Promise<ParsedGadgetbridge> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database(file);
  try {
    const parsed: ParsedGadgetbridge = {
      hrSamples: [],
      stressSamples: [],
      spo2Samples: [],
      sleepSegments: [],
      workouts: [],
      steps: [],
    };
    if (hasTable(db, 'CMF_HEART_RATE_SAMPLE')) {
      collectRows(
        db,
        'SELECT TIMESTAMP, HEART_RATE FROM CMF_HEART_RATE_SAMPLE ORDER BY TIMESTAMP',
        (row) => {
          const timestamp = toEpochMs(row[0]);
          const bpm = BpmSchema.safeParse(row[1]);
          if (timestamp !== undefined && bpm.success) {
            parsed.hrSamples.push({ timestamp, bpm: bpm.data });
          }
        },
      );
    }
    if (hasTable(db, 'CMF_STRESS_SAMPLE')) {
      collectRows(
        db,
        'SELECT TIMESTAMP, STRESS FROM CMF_STRESS_SAMPLE ORDER BY TIMESTAMP',
        (row) => {
          const timestamp = toEpochMs(row[0]);
          const stress = StressScoreSchema.safeParse(row[1]);
          if (timestamp !== undefined && stress.success) {
            parsed.stressSamples.push({ timestamp, stress: stress.data });
          }
        },
      );
    }
    if (hasTable(db, 'CMF_SPO2_SAMPLE')) {
      collectRows(db, 'SELECT TIMESTAMP, SPO2 FROM CMF_SPO2_SAMPLE ORDER BY TIMESTAMP', (row) => {
        const timestamp = toEpochMs(row[0]);
        const spo2 = SpO2PercentSchema.safeParse(row[1]);
        if (timestamp !== undefined && spo2.success) {
          parsed.spo2Samples.push({ timestamp, spo2: spo2.data });
        }
      });
    }
    if (hasTable(db, 'CMF_SLEEP_STAGE_SAMPLE')) {
      collectRows(
        db,
        'SELECT TIMESTAMP, DURATION, STAGE FROM CMF_SLEEP_STAGE_SAMPLE ORDER BY TIMESTAMP',
        (row) => {
          const start = toEpochMs(row[0]);
          const durationSeconds = typeof row[1] === 'number' ? row[1] : Number.NaN;
          const stage = decodeCmfStage(row[2]);
          if (
            start === undefined ||
            !Number.isFinite(durationSeconds) ||
            durationSeconds <= 0 ||
            !stage
          ) {
            return;
          }
          const end = start + Math.round(durationSeconds) * MS_PER_SECOND;
          parsed.sleepSegments.push({ start, end: end as EpochMs, stage });
        },
      );
    }
    if (hasTable(db, 'CMF_ACTIVITY_SAMPLE')) {
      collectRows(
        db,
        'SELECT TIMESTAMP, STEPS, RAW_KIND, HEART_RATE FROM CMF_ACTIVITY_SAMPLE ORDER BY TIMESTAMP',
        (row) => {
          const timestamp = toEpochMsSeconds(row[0]);
          if (timestamp === undefined) {
            return;
          }
          if (typeof row[1] === 'number' && Number.isInteger(row[1]) && row[1] > 0) {
            parsed.steps.push({ timestamp, steps: row[1] });
          }
        },
      );
    }
    if (hasTable(db, 'BASE_ACTIVITY_SUMMARY')) {
      collectRows(
        db,
        'SELECT _id, NAME, START_TIME, END_TIME, ACTIVITY_KIND FROM BASE_ACTIVITY_SUMMARY ORDER BY START_TIME',
        (row) => {
          const start = toEpochMsSeconds(row[2]);
          const end = toEpochMsSeconds(row[3]);
          if (start === undefined || end === undefined || end <= start) {
            return;
          }
          const kind = typeof row[4] === 'number' ? row[4] : 0;
          parsed.workouts.push({
            id: `gadgetbridge-${typeof row[0] === 'number' ? String(row[0]) : 'row'}`,
            start,
            end,
            activityType: activityKindName(kind),
          });
        },
      );
    }
    return parsed;
  } finally {
    db.close();
  }
}

function collectRows(
  db: Database,
  sql: string,
  visit: (row: unknown[], index: number) => void,
): void {
  const statement = db.prepare(sql);
  try {
    let index = 0;
    while (statement.step()) {
      visit(statement.get(), index);
      index += 1;
    }
  } finally {
    statement.free();
  }
}

/** Millisecond timestamp column → {@link EpochMs}. */
function toEpochMs(value: unknown): EpochMs | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  const parsed = EpochMsSchema.safeParse(Math.round(value));
  return parsed.success ? parsed.data : undefined;
}

/** Second timestamp column → {@link EpochMs}. */
function toEpochMsSeconds(value: unknown): EpochMs | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return toEpochMs(Math.round(value) * MS_PER_SECOND);
}

/**
 * CMF sleep stage byte → canonical stage.
 * From Gadgetbridge `CmfActivitySampleProvider.sleepStageToActivityKind`:
 * 1 → deep, 2 → light, 3 → rem, everything else unknown.
 */
export function decodeCmfStage(value: unknown): SleepStage | undefined {
  if (value === CMF_STAGE_DEEP) {
    return 'deep';
  }
  if (value === CMF_STAGE_LIGHT) {
    return 'light';
  }
  if (value === CMF_STAGE_REM) {
    return 'rem';
  }
  return undefined;
}

/**
 * ActivityKind code → human label for the common workout kinds.
 */
export function activityKindName(kind: number): string {
  switch (kind) {
    case 0x00000010:
      return 'run';
    case 0x00000020:
      return 'walk';
    case 0x00000040:
      return 'swim';
    case 0x00000080:
      return 'cycling';
    case 0x00000100:
      return 'treadmill';
    case 0x00000200:
      return 'exercise';
    case 0x00004000:
      return 'yoga';
    case 0x00200000:
      return 'strength';
    case 0x04000010:
      return 'cardio';
    case 0x04000045:
      return 'hiit';
    default:
      return 'workout';
  }
}

/**
 * {@link WatchDataProvider} backed by one parsed Gadgetbridge export.
 */
export class GadgetbridgeSqliteProvider implements WatchDataProvider {
  readonly id = GADGETBRIDGE_PROVIDER_ID;
  readonly label = GADGETBRIDGE_PROVIDER_LABEL;

  private readonly logger: Logger;
  private dataset: ParsedGadgetbridge | undefined;

  constructor(options: { logger?: Logger | undefined } = {}) {
    this.logger = options.logger ?? noopLogger;
  }

  /**
   * Load and parse an exported `.db` file. Replaces any previous dataset.
   */
  async loadFile(file: Uint8Array): Promise<Result<void, WatchProviderError>> {
    try {
      this.dataset = await parseGadgetbridgeFile(file);
      this.logger.info('gadgetbridge file loaded', {
        hr: this.dataset.hrSamples.length,
        workouts: this.dataset.workouts.length,
      });
      return ok(undefined);
    } catch (error) {
      return err({
        code: 'DECODE_ERROR',
        message: error instanceof Error ? error.message : 'SQLite parse failed',
      });
    }
  }

  connect(): Promise<Result<void, WatchProviderError>> {
    return Promise.resolve(ok(undefined));
  }

  disconnect(): Promise<Result<void, WatchProviderError>> {
    return Promise.resolve(ok(undefined));
  }

  getHeartRateSamples(range: TimeRange): Promise<Result<HrSample[], WatchProviderError>> {
    return Promise.resolve(
      this.slice(this.dataset?.hrSamples ?? [], range, (sample) => sample.timestamp),
    );
  }

  getStressSamples(range: TimeRange): Promise<Result<StressSample[], WatchProviderError>> {
    return Promise.resolve(
      this.slice(this.dataset?.stressSamples ?? [], range, (sample) => sample.timestamp),
    );
  }

  getSpo2Samples(range: TimeRange): Promise<Result<Spo2Sample[], WatchProviderError>> {
    return Promise.resolve(
      this.slice(this.dataset?.spo2Samples ?? [], range, (sample) => sample.timestamp),
    );
  }

  getSleepSegments(range: TimeRange): Promise<Result<SleepSegment[], WatchProviderError>> {
    const parsed = rangeOk(range);
    if (!parsed.ok) {
      return Promise.resolve(parsed);
    }
    const { start, end } = parsed.value;
    return Promise.resolve(
      ok(
        (this.dataset?.sleepSegments ?? []).filter(
          (segment) => segment.start < end && segment.end > start,
        ),
      ),
    );
  }

  getWorkouts(range: TimeRange): Promise<Result<Workout[], WatchProviderError>> {
    const parsed = rangeOk(range);
    if (!parsed.ok) {
      return Promise.resolve(parsed);
    }
    const { start, end } = parsed.value;
    return Promise.resolve(
      ok(
        (this.dataset?.workouts ?? []).filter(
          (workout) => workout.start < end && workout.end > start,
        ),
      ),
    );
  }

  getStepSamples(range: TimeRange): Promise<Result<StepSample[], WatchProviderError>> {
    return Promise.resolve(
      this.slice(this.dataset?.steps ?? [], range, (sample) => sample.timestamp),
    );
  }

  pushRecoveryNotification(
    _input: RecoveryNotificationInput,
  ): Promise<Result<void, WatchProviderError>> {
    return Promise.resolve(
      err({
        code: 'NOT_SUPPORTED',
        message: 'Gadgetbridge imports cannot push to the watch',
      }),
    );
  }

  private slice<T>(
    samples: readonly T[],
    range: TimeRange,
    timestampOf: (sample: T) => number,
  ): Result<T[], WatchProviderError> {
    const parsed = rangeOk(range);
    if (!parsed.ok) {
      return parsed;
    }
    const { start, end } = parsed.value;
    return ok(
      samples.filter((sample) => {
        const timestamp = timestampOf(sample);
        return timestamp >= start && timestamp < end;
      }),
    );
  }
}

function rangeOk(range: TimeRange): Result<TimeRange, WatchProviderError> {
  if (
    typeof range.start !== 'number' ||
    typeof range.end !== 'number' ||
    !(range.end >= range.start)
  ) {
    return err({ code: 'DECODE_ERROR', message: 'Invalid time range' });
  }
  return ok(range);
}
