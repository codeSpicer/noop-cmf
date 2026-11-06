import { describe, expect, it, beforeEach } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample, SleepSegment } from '@noop-cmf/types';
import { loadHealthMetrics } from './health-metrics';

const T0 = Date.UTC(2024, 0, 30);
function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}
function sl(start: number, end: number): SleepSegment {
  return { start: EpochMsSchema.parse(start), end: EpochMsSchema.parse(end), stage: 'deep' };
}

describe('health-metrics', () => {
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('returns null when empty', async () => {
    const db = getDatabase();
    expect(await loadHealthMetrics(db)).toBeNull();
  });

  it('computes metrics when populated', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120), hr(T0 - 500, 130)]);
    await db.sleepSegments.put(sl(T0 - 3600000, T0 - 1800000));
    await db.steps.put({ timestamp: EpochMsSchema.parse(T0 - 500), steps: 100 });
    const m = await loadHealthMetrics(db);
    expect(m).not.toBeNull();
    expect(m?.restingHeartRate ?? 0).toBeGreaterThan(0);
  });
});