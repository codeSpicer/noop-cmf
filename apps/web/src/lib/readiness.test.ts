import { describe, expect, it, beforeEach } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample, SleepSegment, Workout } from '@noop-cmf/types';
import { computeReadinessFromData, loadReadiness } from './readiness';

const T0 = Date.UTC(2024, 0, 30);

function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}

function sleep(start: number, end: number): SleepSegment {
  return { start: EpochMsSchema.parse(start), end: EpochMsSchema.parse(end), stage: 'deep' };
}

function workout(id: string, start: number, end: number): Workout {
  return { id, start: EpochMsSchema.parse(start), end: EpochMsSchema.parse(end), activityType: 'run' };
}

describe('readiness lib', () => {
  beforeEach(async () => {
    await clearDatabase(getDatabase('test-readiness'));
  });

  it('computes readiness from in-memory data', () => {
    const now = EpochMsSchema.parse(T0);
    const hrSamples = [hr(T0 - 1000, 120), hr(T0 - 500, 130)];
    const sleepSegments = [sleep(T0 - 3600000, T0 - 1800000)];
    const workouts = [workout('w1', T0 - 2000, T0 - 1000)];
    const result = computeReadinessFromData({ hrSamples, sleepSegments, workouts, now });
    expect(result.readinessPercent).toBeGreaterThanOrEqual(1);
    expect(result.readinessPercent).toBeLessThanOrEqual(99);
  });

  it('loadReadiness reads from db', async () => {
    const db = getDatabase('test-readiness');
    await db.hrSamples.put(hr(T0 - 1000, 120));
    await db.sleepSegments.put(sleep(T0 - 3600000, T0 - 1800000));
    await db.workouts.put(workout('w1', T0 - 2000, T0 - 1000));
    const result = await loadReadiness({ db, now: EpochMsSchema.parse(T0) });
    expect(result).toBeDefined();
  });

  it('handles empty db', async () => {
    const db = getDatabase('test-readiness');
    const result = await loadReadiness({ db, now: EpochMsSchema.parse(T0) });
    expect(result.readinessPercent).toBeGreaterThanOrEqual(1);
  });
});