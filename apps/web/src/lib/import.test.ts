import { describe, expect, it } from 'vitest';
import {
  BpmSchema,
  EpochMsSchema,
  SpO2PercentSchema,
  StressScoreSchema,
  type Result,
  type WatchDataProvider,
  type WatchProviderError,
} from '@noop-cmf/types';
import { NoopCmfDatabase } from '@/db/database';
import { importAll } from './import';

const T = EpochMsSchema.parse(1_700_000_000_000);
const T2 = EpochMsSchema.parse(1_700_000_060_000);

function okResult<T>(value: T): Result<T, WatchProviderError> {
  return { ok: true, value };
}

function failResult(): Result<never, WatchProviderError> {
  return { ok: false, error: { code: 'NOT_CONNECTED', message: 'offline' } };
}

function makeProvider(healthy: boolean): WatchDataProvider {
  const hr = healthy ? okResult([{ timestamp: T, bpm: BpmSchema.parse(72) }]) : failResult();
  const stress = healthy ? okResult([{ timestamp: T, stress: StressScoreSchema.parse(30) }]) : failResult();
  const spo2 = healthy ? okResult([{ timestamp: T, spo2: SpO2PercentSchema.parse(98) }]) : failResult();
  const sleep = healthy
    ? okResult([{ start: T, end: T2, stage: 'deep' as const }])
    : failResult();
  const workouts = healthy
    ? okResult([{ id: 'w1', start: T, end: T2, activityType: 'run' }])
    : failResult();
  const steps = healthy ? okResult([{ timestamp: T, steps: 100 }]) : failResult();

  return {
    id: 'mock',
    label: 'Mock',
    connect: () => Promise.resolve(okResult(undefined)),
    disconnect: () => Promise.resolve(okResult(undefined)),
    getHeartRateSamples: () => Promise.resolve(hr),
    getStressSamples: () => Promise.resolve(stress),
    getSpo2Samples: () => Promise.resolve(spo2),
    getSleepSegments: () => Promise.resolve(sleep),
    getWorkouts: () => Promise.resolve(workouts),
    getStepSamples: () => Promise.resolve(steps),
    pushRecoveryNotification: () => Promise.resolve(okResult(undefined)),
  };
}

describe('importAll', () => {
  it('imports every sample kind from a healthy provider', async () => {
    const db = new NoopCmfDatabase(`test-import-ok-${String(Date.now())}`);
    try {
      const counts = await importAll(makeProvider(true), { start: T, end: T2 }, db);
      expect(counts).toEqual({ hr: 1, stress: 1, spo2: 1, sleep: 1, workouts: 1, steps: 1 });
      expect(await db.hrSamples.count()).toBe(1);
      expect(await db.workouts.count()).toBe(1);
      expect(await db.steps.count()).toBe(1);
    } finally {
      db.close();
    }
  });

  it('returns zero counts without throwing when a provider fails', async () => {
    const db = new NoopCmfDatabase(`test-import-fail-${String(Date.now())}`);
    try {
      const counts = await importAll(makeProvider(false), { start: T, end: T2 }, db);
      expect(counts).toEqual({ hr: 0, stress: 0, spo2: 0, sleep: 0, workouts: 0, steps: 0 });
      expect(await db.hrSamples.count()).toBe(0);
    } finally {
      db.close();
    }
  });
});
