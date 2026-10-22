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
import type { SleepSegment, TimeRange } from '@noop-cmf/types';
import {
  buildGadgetbridgeFixture,
  GadgetbridgeSqliteProvider,
  GADGETBRIDGE_PROVIDER_ID,
  GADGETBRIDGE_PROVIDER_LABEL,
  GADGETBRIDGE_SCHEMA_SQL,
  loadSqlJs,
  parseGadgetbridgeFile,
} from './gadgetbridge.js';

const T0 = 1_700_000_000_000;

describe('buildGadgetbridgeFixture and parseGadgetbridgeFile', () => {
  it('round-trips HR, stress, SpO2, sleep, and workouts', async () => {
    const start = EpochMsSchema.parse(T0);
    const end = EpochMsSchema.parse(T0 + 30 * 60_000);
    const sleep: SleepSegment[] = [
      { start, end: EpochMsSchema.parse(T0 + 7 * 3_600_000), stage: 'deep' },
    ];
    const file = await buildGadgetbridgeFixture({
      deviceName: 'CMF Watch Pro 2',
      points: [
        {
          timestamp: start,
          bpm: BpmSchema.parse(72),
          stress: 30,
          spo2: SpO2PercentSchema.parse(98),
        },
      ],
      sleep,
      workouts: [
        {
          start,
          end,
          activityType: 'run',
          averageHeartRate: BpmSchema.parse(150),
          calories: 320,
        },
      ],
    });
    const parsed = await parseGadgetbridgeFile(file);
    expect(parsed.hrSamples).toHaveLength(1);
    expect(parsed.hrSamples[0]?.bpm).toBe(72);
    expect(parsed.stressSamples).toHaveLength(1);
    expect(parsed.stressSamples[0]?.stress).toBe(30);
    expect(parsed.spo2Samples).toHaveLength(1);
    expect(parsed.spo2Samples[0]?.spo2).toBe(98);
    expect(parsed.sleepSegments).toEqual(sleep);
    expect(parsed.workouts).toHaveLength(1);
    expect(parsed.workouts[0]?.activityType).toBe('run');
  });

  it('builds an empty database without rows', async () => {
    const file = await buildGadgetbridgeFixture();
    const parsed = await parseGadgetbridgeFile(file);
    expect(parsed.hrSamples).toEqual([]);
    expect(parsed.workouts).toEqual([]);
  });

  it('skips out-of-range rows instead of aborting', async () => {
    const start = EpochMsSchema.parse(T0);
    const file = await buildGadgetbridgeFixture({
      points: [
        { timestamp: start, bpm: BpmSchema.parse(72) },
        {
          timestamp: start,
          bpm: 999,
        },
        { timestamp: start, stress: 500 },
      ],
    });
    const parsed = await parseGadgetbridgeFile(file);
    expect(parsed.hrSamples).toHaveLength(1);
    expect(parsed.stressSamples).toHaveLength(0);
  });

  it('rejects garbage bytes', async () => {
    await expect(parseGadgetbridgeFile(new Uint8Array([0, 1, 2, 3]))).rejects.toThrow();
    const provider = new GadgetbridgeSqliteProvider();
    const bad = { start: 'x', end: 'y' } as unknown as TimeRange;
    expect((await provider.getHeartRateSamples(bad)).ok).toBe(false);
  });

  it('tolerates corrupt rows, unknown stages, and extra activity kinds', async () => {
    const SQL = await loadSqlJs();
    const db = new SQL.Database();
    try {
      db.run(GADGETBRIDGE_SCHEMA_SQL);
      db.run("INSERT INTO device (id, name, alias) VALUES (1, 'edge', 'e')");
      db.run('INSERT INTO heartrate (id, device_id, timestamp, bpm) VALUES (1, 1, -5, 70)');
      db.run("INSERT INTO heartrate (id, device_id, timestamp, bpm) VALUES (2, 1, 'oops', 70)");
      db.run('INSERT INTO stress (id, device_id, timestamp, stress) VALUES (3, 1, 1700000000, 50)');
      db.run('INSERT INTO spo2 (id, device_id, timestamp, spo2) VALUES (4, 1, 1700000000, 300)');
      db.run(
        "INSERT INTO sleep (id, device_id, start_ts, end_ts, stage) VALUES (5, 1, 1700000000, 1699999999, 'deep')",
      );
      db.run(
        "INSERT INTO sleep (id, device_id, start_ts, end_ts, stage) VALUES (6, 1, 1700000000, 1700003600, 'drowsy')",
      );
      db.run(
        'INSERT INTO activity (id, device_id, timestamp, activitykind, steps, heartrate) VALUES (7, 1, -10, 2, 0, 120)',
      );
      db.run(
        'INSERT INTO activity (id, device_id, timestamp, activitykind, steps, heartrate) VALUES (8, 1, 1700000000, 2, 0, 120)',
      );
      db.run(
        'INSERT INTO activity (id, device_id, timestamp, activitykind, steps, heartrate) VALUES (9, 1, 1700003600, 3, 0, NULL)',
      );
      db.run(
        'INSERT INTO activity (id, device_id, timestamp, activitykind, steps, heartrate) VALUES (10, 1, 1700007200, 9, 0, 130)',
      );
      const file = db.export();
      const parsed = await parseGadgetbridgeFile(file);
      expect(parsed.hrSamples).toEqual([]);
      expect(parsed.stressSamples).toHaveLength(1);
      expect(parsed.spo2Samples).toEqual([]);
      expect(parsed.sleepSegments).toEqual([]);
      expect(parsed.workouts.map((workout) => workout.activityType)).toEqual([
        'cycling',
        'swim',
        'workout',
      ]);
    } finally {
      db.close();
    }
  });
});

describe('live GATT fixture', () => {
  it('matches the UUID constants used by the protocol layer', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fixture = JSON.parse(
      fs.readFileSync(path.join(here, '..', 'fixtures', 'cmf-watch-pro-2-gatt.json'), 'utf8'),
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

describe('GadgetbridgeSqliteProvider', () => {
  it('exposes provider identity and loads fixture files', async () => {
    const provider = new GadgetbridgeSqliteProvider();
    expect(provider.id).toBe(GADGETBRIDGE_PROVIDER_ID);
    expect(provider.label).toBe(GADGETBRIDGE_PROVIDER_LABEL);
    expect((await provider.connect()).ok).toBe(true);
    const start = EpochMsSchema.parse(T0);
    const file = await buildGadgetbridgeFixture({
      points: [
        {
          timestamp: start,
          bpm: BpmSchema.parse(72),
          stress: 30,
          spo2: SpO2PercentSchema.parse(98),
        },
      ],
      sleep: [{ start, end: EpochMsSchema.parse(T0 + 3_600_000), stage: 'light' }],
      workouts: [
        {
          start,
          end: EpochMsSchema.parse(T0 + 1_800_000),
          activityType: 'run',
          averageHeartRate: BpmSchema.parse(150),
        },
      ],
    });
    expect((await provider.loadFile(file)).ok).toBe(true);
    const range = {
      start: EpochMsSchema.parse(T0 - 3_600_000),
      end: EpochMsSchema.parse(T0 + 10 * 86_400_000),
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
    const range = { start: EpochMsSchema.parse(T0), end: EpochMsSchema.parse(T0 + 3_600_000) };
    const hr = await provider.getHeartRateSamples(range);
    expect(hr.ok ? hr.value : ['unexpected']).toEqual([]);
  });

  it('rejects inverted ranges', async () => {
    const provider = new GadgetbridgeSqliteProvider();
    const bad = { start: EpochMsSchema.parse(T0), end: EpochMsSchema.parse(T0 - 1) };
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
