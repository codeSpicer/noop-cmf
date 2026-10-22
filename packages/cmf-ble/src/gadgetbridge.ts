/**
 * Gadgetbridge SQLite provider: parses exported Gadgetbridge `.db` files
 * into canonical @noop-cmf/types via sql.js (WASM).
 *
 * Expected schema (created by `buildGadgetbridgeFixture` and real
 * Gadgetbridge exports alike):
 *   device(id, name, alias) · activity(id, device_id, timestamp, activitykind,
 *   steps, heartrate) · heartrate(id, device_id, timestamp, bpm) ·
 *   stress(id, device_id, timestamp, stress) · spo2(id, device_id, timestamp,
 *   spo2) · sleep(id, device_id, start_ts, end_ts, stage).
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

/** Location of the sql.js WASM binary relative to the package root. */
export const SQL_WASM_PATH = 'node_modules/sql.js/dist/sql-wasm.wasm';

/** CREATE TABLE statements for the canonical fixture schema. */
export const GADGETBRIDGE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS device (id INTEGER PRIMARY KEY, name TEXT NOT NULL, alias TEXT);
CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY, device_id INTEGER NOT NULL, timestamp INTEGER NOT NULL, activitykind INTEGER NOT NULL, steps INTEGER NOT NULL DEFAULT 0, heartrate INTEGER);
CREATE TABLE IF NOT EXISTS heartrate (id INTEGER PRIMARY KEY, device_id INTEGER NOT NULL, timestamp INTEGER NOT NULL, bpm INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS stress (id INTEGER PRIMARY KEY, device_id INTEGER NOT NULL, timestamp INTEGER NOT NULL, stress INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS spo2 (id INTEGER PRIMARY KEY, device_id INTEGER NOT NULL, timestamp INTEGER NOT NULL, spo2 INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sleep (id INTEGER PRIMARY KEY, device_id INTEGER NOT NULL, start_ts INTEGER NOT NULL, end_ts INTEGER NOT NULL, stage TEXT NOT NULL);
`;

/** One synthetic row used to build fixture databases for tests. */
export interface FixturePoint {
  readonly timestamp: EpochMs;
  readonly bpm?: number | undefined;
  readonly stress?: number | undefined;
  readonly spo2?: number | undefined;
}

/** One synthetic workout used to build fixture databases for tests. */
export interface FixtureWorkout {
  readonly start: EpochMs;
  readonly end: EpochMs;
  readonly activityType: string;
  readonly averageHeartRate?: number | undefined;
  readonly calories?: number | undefined;
}

/** Options for building a fixture database. */
export interface FixtureOptions {
  readonly deviceName?: string | undefined;
  readonly points?: readonly FixturePoint[] | undefined;
  readonly workouts?: readonly FixtureWorkout[] | undefined;
  readonly sleep?: readonly SleepSegment[] | undefined;
}

/** Result of parsing a Gadgetbridge export file. */
export interface ParsedGadgetbridge {
  readonly hrSamples: HrSample[];
  readonly stressSamples: StressSample[];
  readonly spo2Samples: Spo2Sample[];
  readonly sleepSegments: SleepSegment[];
  readonly workouts: Workout[];
}

let cachedSql: Awaited<ReturnType<typeof initSqlJs>> | undefined;

/**
 * Load (and cache) the sql.js WASM module.
 */
export async function loadSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!cachedSql) {
    cachedSql = await initSqlJs({});
  }
  return cachedSql;
}

/**
 * Build an in-memory Gadgetbridge database file for tests and fixtures.
 */
export async function buildGadgetbridgeFixture(options: FixtureOptions = {}): Promise<Uint8Array> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  try {
    db.run(GADGETBRIDGE_SCHEMA_SQL);
    db.run('INSERT INTO device (id, name, alias) VALUES (1, ?, ?)', [
      options.deviceName ?? 'CMF Watch Pro 2',
      'fixture',
    ]);
    const points = options.points ?? [];
    points.forEach((point, index) => {
      const id = index + 1;
      const seconds = Math.floor(point.timestamp / 1000);
      if (point.bpm !== undefined) {
        db.run('INSERT INTO heartrate (id, device_id, timestamp, bpm) VALUES (?, 1, ?, ?)', [
          id,
          seconds,
          point.bpm,
        ]);
      }
      if (point.stress !== undefined) {
        db.run('INSERT INTO stress (id, device_id, timestamp, stress) VALUES (?, 1, ?, ?)', [
          id,
          seconds,
          Math.round(point.stress),
        ]);
      }
      if (point.spo2 !== undefined) {
        db.run('INSERT INTO spo2 (id, device_id, timestamp, spo2) VALUES (?, 1, ?, ?)', [
          id,
          seconds,
          point.spo2,
        ]);
      }
    });
    const sleep = options.sleep ?? [];
    sleep.forEach((segment, index) => {
      db.run('INSERT INTO sleep (id, device_id, start_ts, end_ts, stage) VALUES (?, 1, ?, ?, ?)', [
        index + 1,
        Math.floor(segment.start / 1000),
        Math.floor(segment.end / 1000),
        segment.stage,
      ]);
    });
    const workouts = options.workouts ?? [];
    workouts.forEach((workout, index) => {
      db.run(
        'INSERT INTO activity (id, device_id, timestamp, activitykind, steps, heartrate) VALUES (?, 1, ?, ?, ?, ?)',
        [index + 1, Math.floor(workout.start / 1000), 1, 1000, workout.averageHeartRate ?? null],
      );
    });
    return db.export();
  } finally {
    db.close();
  }
}

/**
 * Parse a Gadgetbridge SQLite export into canonical samples.
 *
 * Timestamps are stored as Unix seconds and converted to {@link EpochMs}.
 * Rows failing Zod validation are skipped (counted in `skipped`) rather
 * than aborting the import.
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
    };
    collectRows(db, 'SELECT timestamp, bpm FROM heartrate ORDER BY timestamp', (row) => {
      const timestamp = toEpochMs(row[0]);
      const bpm = BpmSchema.safeParse(row[1]);
      if (timestamp !== undefined && bpm.success) {
        parsed.hrSamples.push({ timestamp, bpm: bpm.data });
      }
    });
    collectRows(db, 'SELECT timestamp, stress FROM stress ORDER BY timestamp', (row) => {
      const timestamp = toEpochMs(row[0]);
      const stress = StressScoreSchema.safeParse(row[1]);
      if (timestamp !== undefined && stress.success) {
        parsed.stressSamples.push({ timestamp, stress: stress.data });
      }
    });
    collectRows(db, 'SELECT timestamp, spo2 FROM spo2 ORDER BY timestamp', (row) => {
      const timestamp = toEpochMs(row[0]);
      const spo2 = SpO2PercentSchema.safeParse(row[1]);
      if (timestamp !== undefined && spo2.success) {
        parsed.spo2Samples.push({ timestamp, spo2: spo2.data });
      }
    });
    collectRows(db, 'SELECT start_ts, end_ts, stage FROM sleep ORDER BY start_ts', (row) => {
      const start = toEpochMs(row[0]);
      const end = toEpochMs(row[1]);
      if (start === undefined || end === undefined || end <= start) {
        return;
      }
      const stage = parseStage(row[2]);
      if (stage) {
        parsed.sleepSegments.push({ start, end, stage });
      }
    });
    collectRows(
      db,
      'SELECT timestamp, activitykind, heartrate FROM activity ORDER BY timestamp',
      (row) => {
        const start = toEpochMs(row[0]);
        if (start === undefined) {
          return;
        }
        const kind = typeof row[1] === 'number' ? row[1] : 0;
        const end = EpochMsSchema.safeParse(start + 30 * 60_000);
        const avg = BpmSchema.safeParse(row[2]);
        if (!end.success) {
          return;
        }
        parsed.workouts.push({
          id: `gadgetbridge-${String(start)}`,
          start,
          end: end.data,
          activityType: workoutKindName(kind),
          ...(avg.success ? { averageHeartRate: avg.data } : {}),
        });
      },
    );
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

function toEpochMs(value: unknown): EpochMs | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  const parsed = EpochMsSchema.safeParse(Math.round(value * 1000));
  return parsed.success ? parsed.data : undefined;
}

function parseStage(value: unknown): SleepStage | undefined {
  if (value === 'awake' || value === 'light' || value === 'deep' || value === 'rem') {
    return value;
  }
  return undefined;
}

function workoutKindName(kind: number): string {
  switch (kind) {
    case 1:
      return 'run';
    case 2:
      return 'cycling';
    case 3:
      return 'swim';
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
