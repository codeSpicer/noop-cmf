import { describe, expect, it, beforeEach } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample, SleepSegment } from '@noop-cmf/types';
import { loadBaselineBands } from './baseline-bands';

const T0 = Date.UTC(2024, 0, 30);
function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}
function sl(start: number, end: number): SleepSegment {
  return { start: EpochMsSchema.parse(start), end: EpochMsSchema.parse(end), stage: 'deep' };
}

describe('baseline-bands', () => {
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('returns null when empty', async () => {
    const db = getDatabase();
    expect(await loadBaselineBands(db)).toBeNull();
  });

  it('computes bands when populated', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120), hr(T0 - 500, 130)]);
    await db.sleepSegments.put(sl(T0 - 3600000, T0 - 1800000));
    const bands = await loadBaselineBands(db);
    expect(bands).not.toBeNull();
    expect(bands?.daily.length ?? 0).toBeGreaterThan(0);
  });
});