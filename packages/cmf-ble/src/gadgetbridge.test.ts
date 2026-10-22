import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BpmSchema,
  EpochMsSchema,
  MillisecondsSchema,
  RecoveryPercentSchema,
  SpO2PercentSchema,
  StrainScoreSchema,
} from '@noop-cmf/types';
import type { SleepStage, TimeRange } from '@noop-cmf/types';
import {
  activityKindName,
  buildGadgetbridgeFixture,
  decodeCmfStage,
  GadgetbridgeSqliteProvider,
  GADGETBRIDGE_PROVIDER_ID,
  GADGETBRIDGE_PROVIDER_LABEL,
  GADGETBRIDGE_SCHEMA_SQL,
  loadSqlJs,
  parseGadgetbridgeFile,
} from './gadgetbridge.js';

const T0_MS = 1_700_000_000_000;
const T0_S = Math.floor(T0_MS / 1000);

function fixturePath(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', 'fixtures', name);
}

describe('decodeCmfStage', () => {
  it('maps 1/2/3 to deep/light/rem per Gadgetbridge', () => {
    expect(decodeCmfStage(1)).toBe('deep');
    expect(decodeCmfStage(2)).toBe('light');
    expect(decodeCmfStage(3)).toBe('rem');
  });

  it('returns undefined for unknown stages', () => {
    expect(decodeCmfStage(0)).toBeUndefined();
    expect(decodeCmfStage(4)).toBeUndefined();
    expect(decodeCmfStage('deep')).toBeUndefined();
    expect(decodeCmfStage(null)).toBeUndefined();
  });
});

describe('activityKindName', () => {
  it('names every documented workout kind', () => {
    expect(activityKindName(0x00000010)).toBe('run');
    expect(activityKindName(0x00000020)).toBe('walk');
    expect(activityKindName(0x00000040)).toBe('swim');
    expect(activityKindName(0x00000080)).toBe('cycling');
    expect(activityKindName(0x00000100)).toBe('treadmill');
    expect(activityKindName(0x00000200)).toBe('exercise');
    expect(activityKindName(0x00004000)).toBe('yoga');
    expect(activityKindName(0x00200000)).toBe('strength');
    expect(activityKindName(0x04000010)).toBe('cardio');
    expect(activityKindName(0x04000045)).toBe('hiit');
  });

  it('falls back to workout for unknown kinds', () => {
    expect(activityKindName(0)).toBe('workout');
    expect(activityKindName(0xdeadbeef)).toBe('workout');
  });
});

describe('buildGadgetbridgeFixture and parseGadgetbridgeFile', () => {
  it('round-trips HR, stress, SpO2, sleep stages, and summaries', async () => {
    const start = EpochMsSchema.parse(T0_MS);
    const file = await buildGadgetbridgeFixture({
      deviceName: 'CMF Watch Pro 2',
      points: [
        {
          timestampMs: start,
          bpm: BpmSchema.parse(72),
          stress: 30,
          spo2: SpO2PercentSchema.parse(98),
        },
      ],
      sleepStages: [{ timestampMs: start, durationSeconds: 3600, stage: 2 }],
      activities: [{ timestampSeconds: T0_S, steps: 11953, rawKind: 0, heartRate: 80 }],
      workoutSummaries: [
        { name: 'Morning run', startSeconds: T0_S, endSeconds: T0_S + 1800, activityKind: 0x10 },
      ],
    });
    const parsed = await parseGadgetbridgeFile(file);
    expect(parsed.hrSamples).toHaveLength(1);
    expect(parsed.hrSamples[0]?.bpm).toBe(72);
    expect(parsed.stressSamples).toHaveLength(1);
    expect(parsed.stressSamples[0]?.stress).toBe(30);
    expect(parsed.spo2Samples).toHaveLength(1);
    expect(parsed.spo2Samples[0]?.spo2).toBe(98);
    expect(parsed.sleepSegments).toHaveLength(1);
    expect(parsed.sleepSegments[0]?.stage).toBe('light');
    expect(parsed.sleepSegments[0]?.end).toBe(T0_MS + 3_600_000);
    expect(parsed.workouts).toHaveLength(1);
    expect(parsed.workouts[0]?.activityType).toBe('run');
    expect(parsed.workouts[0]?.start).toBe(T0_MS);
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0]?.steps).toBe(11953);
  });

  it('maps every CMF sleep stage byte', () => {
    const stages: Array<[number, SleepStage]> = [
      [1, 'deep'],
      [2, 'light'],
      [3, 'rem'],
    ];
    for (const [byte, stage] of stages) {
      expect(decodeCmfStage(byte)).toBe(stage);
    }
  });

  it('skips out-of-range rows instead of aborting', async () => {
    const start = EpochMsSchema.parse(T0_MS);
    const later = EpochMsSchema.parse(T0_MS + 60_000);
    const file = await buildGadgetbridgeFixture({
      points: [
        { timestampMs: start, bpm: BpmSchema.parse(72) },
        { timestampMs: later, bpm: 999 },
        { timestampMs: EpochMsSchema.parse(T0_MS + 120_000), stress: 500 },
      ],
      sleepStages: [
        { timestampMs: start, durationSeconds: 3600, stage: 9 },
        { timestampMs: later, durationSeconds: -5, stage: 2 },
      ],
    });
    const parsed = await parseGadgetbridgeFile(file);
    expect(parsed.hrSamples).toHaveLength(1);
    expect(parsed.stressSamples).toHaveLength(0);
    expect(parsed.sleepSegments).toHaveLength(0);
  });

  it('rejects garbage bytes', async () => {
    await expect(parseGadgetbridgeFile(new Uint8Array([0, 1, 2, 3]))).rejects.toThrow();
    const provider = new GadgetbridgeSqliteProvider();
    const bad = { start: 'x', end: 'y' } as unknown as TimeRange;
    expect((await provider.getHeartRateSamples(bad)).ok).toBe(false);
  });

  it('tolerates databases without CMF tables', async () => {
    const SQL = await loadSqlJs();
    const db = new SQL.Database();
    try {
      db.run('CREATE TABLE misc (id INTEGER)');
      const file = db.export();
      const parsed = await parseGadgetbridgeFile(file);
      expect(parsed.hrSamples).toEqual([]);
      expect(parsed.stressSamples).toEqual([]);
      expect(parsed.spo2Samples).toEqual([]);
      expect(parsed.sleepSegments).toEqual([]);
      expect(parsed.workouts).toEqual([]);
      expect(parsed.steps).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('tolerates corrupt rows and unknown activity kinds', async () => {
    const SQL = await loadSqlJs();
    const db = new SQL.Database();
    try {
      db.run(GADGETBRIDGE_SCHEMA_SQL);
      db.run(
        "INSERT INTO DEVICE (_id, NAME, MANUFACTURER, IDENTIFIER, TYPE, TYPE_NAME) VALUES (1, 'edge', 'Nothing', 'x', 0, 'NOTHING_CMF_WATCH_PRO_2')",
      );
      db.run(
        'INSERT INTO CMF_HEART_RATE_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, HEART_RATE) VALUES (-5, 1, 1, 70)',
      );
      db.run(
        "INSERT INTO CMF_HEART_RATE_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, HEART_RATE) VALUES ('oops', 1, 1, 70)",
      );
      db.run(
        'INSERT INTO CMF_STRESS_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, STRESS) VALUES (1700000000000, 1, 1, 50)',
      );
      db.run(
        'INSERT INTO CMF_SPO2_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, SPO2) VALUES (1700000000000, 1, 1, 300)',
      );
      db.run(
        'INSERT INTO CMF_SLEEP_STAGE_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, DURATION, STAGE) VALUES (1700000000000, 1, 1, 3600, 9)',
      );
      db.run(
        'INSERT INTO CMF_ACTIVITY_SAMPLE (TIMESTAMP, DEVICE_ID, USER_ID, RAW_INTENSITY, STEPS, RAW_KIND, HEART_RATE) VALUES (-10, 1, 1, 0, 100, 0, 70)',
      );
      db.run(
        'INSERT INTO BASE_ACTIVITY_SUMMARY (_id, START_TIME, END_TIME, OVERRIDE_ACTIVITY_KIND, ACTIVITY_KIND, DEVICE_ID, USER_ID) VALUES (1, 1700000000, 1700003600, 16, 16, 1, 1)',
      );
      db.run(
        'INSERT INTO BASE_ACTIVITY_SUMMARY (_id, START_TIME, END_TIME, OVERRIDE_ACTIVITY_KIND, ACTIVITY_KIND, DEVICE_ID, USER_ID) VALUES (2, 1700003600, 1700003400, 16, 16, 1, 1)',
      );
      db.run(
        'INSERT INTO BASE_ACTIVITY_SUMMARY (_id, START_TIME, END_TIME, OVERRIDE_ACTIVITY_KIND, ACTIVITY_KIND, DEVICE_ID, USER_ID) VALUES (3, 1700007200, 1700010800, 999, 999, 1, 1)',
      );
      db.run(
        'INSERT INTO BASE_ACTIVITY_SUMMARY (_id, START_TIME, END_TIME, OVERRIDE_ACTIVITY_KIND, ACTIVITY_KIND, DEVICE_ID, USER_ID) VALUES (4, -50, 1700010800, 16, 16, 1, 1)',
      );
      const file = db.export();
      const parsed = await parseGadgetbridgeFile(file);
      expect(parsed.hrSamples).toEqual([]);
      expect(parsed.stressSamples).toHaveLength(1);
      expect(parsed.spo2Samples).toEqual([]);
      expect(parsed.sleepSegments).toEqual([]);
      expect(parsed.workouts.map((workout) => workout.activityType)).toEqual(['run', 'workout']);
    } finally {
      db.close();
    }
  });
});

describe('live GATT fixture', () => {
  it('matches the UUID constants used by the protocol layer', () => {
    const fixture = JSON.parse(
      fs.readFileSync(fixturePath('cmf-watch-pro-2-gatt.json'), 'utf8'),
    ) as {
      deviceName: string;
      mtu: number;
      services: Array<{ uuid: string; characteristics: Array<{ uuid: string }> }>;
    };
    expect(fixture.deviceName).toBe('CMF Watch Pro 2-D70F');
    expect(fixture.mtu).toBe(247);
    const uuids = new Set<string>();
    for (const service of fixture.services) {
      uuids.add(service.uuid);
      for (const char of service.characteristics) {
        uuids.add(char.uuid);
      }
    }
    for (const expected of [
      '0000180f-0000-1000-8000-00805f9b34fb',
      '00002a19-0000-1000-8000-00805f9b34fb',
      '0000ffd1-0000-1000-8000-00805f9b34fb',
      'e49a3002-f69a-11e8-8eb2-f2801f1b9fd1',
    ]) {
      expect(uuids.has(expected)).toBe(true);
    }
  });
});

describe('real Gadgetbridge export', () => {
  it('parses the live watch database', async () => {
    const file = new Uint8Array(fs.readFileSync(fixturePath('real-gadgetbridge-cmf-pro2.db')));
    const parsed = await parseGadgetbridgeFile(file);
    expect(parsed.hrSamples.length).toBe(15);
    expect(parsed.stressSamples.length).toBe(2);
    expect(parsed.spo2Samples.length).toBe(2);
    expect(parsed.steps.length).toBeGreaterThanOrEqual(0);
    for (const sample of parsed.hrSamples) {
      expect(sample.bpm).toBeGreaterThanOrEqual(25);
      expect(sample.bpm).toBeLessThanOrEqual(240);
    }
    expect(parsed.hrSamples.map((sample) => sample.timestamp)).toEqual(
      [...parsed.hrSamples.map((sample) => sample.timestamp)].sort((a, b) => a - b),
    );
  });

  it('loads the live database through the provider', async () => {
    const provider = new GadgetbridgeSqliteProvider();
    const file = new Uint8Array(fs.readFileSync(fixturePath('real-gadgetbridge-cmf-pro2.db')));
    expect((await provider.loadFile(file)).ok).toBe(true);
    const range = {
      start: EpochMsSchema.parse(1_700_000_000_000),
      end: EpochMsSchema.parse(1_800_000_000_000),
    };
    const hr = await provider.getHeartRateSamples(range);
    expect(hr.ok ? hr.value.length : -1).toBe(15);
  });
});

describe('GadgetbridgeSqliteProvider', () => {
  it('exposes provider identity and loads fixture files', async () => {
    const provider = new GadgetbridgeSqliteProvider();
    expect(provider.id).toBe(GADGETBRIDGE_PROVIDER_ID);
    expect(provider.label).toBe(GADGETBRIDGE_PROVIDER_LABEL);
    expect((await provider.connect()).ok).toBe(true);
    const start = EpochMsSchema.parse(T0_MS);
    const file = await buildGadgetbridgeFixture({
      points: [
        {
          timestampMs: start,
          bpm: BpmSchema.parse(72),
          stress: 30,
          spo2: SpO2PercentSchema.parse(98),
        },
      ],
      sleepStages: [{ timestampMs: start, durationSeconds: 3600, stage: 2 }],
      workoutSummaries: [
        { name: 'run', startSeconds: T0_S, endSeconds: T0_S + 1800, activityKind: 0x10 },
      ],
    });
    expect((await provider.loadFile(file)).ok).toBe(true);
    const range = {
      start: EpochMsSchema.parse(T0_MS - 3_600_000),
      end: EpochMsSchema.parse(T0_MS + 10 * 86_400_000),
    };
    const hr = await provider.getHeartRateSamples(range);
    expect(hr.ok ? hr.value.length : -1).toBe(1);
    const stress = await provider.getStressSamples(range);
    expect(stress.ok ? stress.value.length : -1).toBe(1);
    const spo2 = await provider.getSpo2Samples(range);
    expect(spo2.ok ? spo2.value.length : -1).toBe(1);
    const sleep = await provider.getSleepSegments(range);
    expect(sleep.ok ? sleep.value.length : -1).toBe(1);
    const workouts = await provider.getWorkouts(range);
    expect(workouts.ok ? workouts.value.length : -1).toBe(1);
    expect((await provider.disconnect()).ok).toBe(true);
  });

  it('returns empty arrays before any file is loaded', async () => {
    const provider = new GadgetbridgeSqliteProvider();
    const range = {
      start: EpochMsSchema.parse(T0_MS),
      end: EpochMsSchema.parse(T0_MS + 3_600_000),
    };
    const hr = await provider.getHeartRateSamples(range);
    expect(hr.ok ? hr.value : ['unexpected']).toEqual([]);
  });

  it('rejects inverted ranges', async () => {
    const provider = new GadgetbridgeSqliteProvider();
    const bad = { start: EpochMsSchema.parse(T0_MS), end: EpochMsSchema.parse(T0_MS - 1) };
    expect((await provider.getHeartRateSamples(bad)).ok).toBe(false);
    expect((await provider.getSleepSegments(bad)).ok).toBe(false);
    expect((await provider.getWorkouts(bad)).ok).toBe(false);
  });

  it('reports NOT_SUPPORTED for watch push', async () => {
    const provider = new GadgetbridgeSqliteProvider();
    const result = await provider.pushRecoveryNotification({
      recovery: RecoveryPercentSchema.parse(70),
      ehrv: MillisecondsSchema.parse(100),
      strainTarget: StrainScoreSchema.parse(12),
    });
    expect(result.ok).toBe(false);
  });

  it('reports DECODE_ERROR for corrupt files', async () => {
    const provider = new GadgetbridgeSqliteProvider();
    const result = await provider.loadFile(new Uint8Array([1, 2, 3]));
    expect(result.ok).toBe(false);
  });
});
