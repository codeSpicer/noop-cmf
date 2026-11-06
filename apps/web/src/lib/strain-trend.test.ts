import { describe, expect, it, beforeEach } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample } from '@noop-cmf/types';
import { loadStrainTrend } from './strain-trend';

const T0 = Date.UTC(2024, 0, 30);
function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}

describe('strain-trend', () => {
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('returns empty when no data', async () => {
    const db = getDatabase();
    expect(await loadStrainTrend(db)).toEqual([]);
  });

  it('returns 7 values when populated', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120), hr(T0 - 500, 130)]);
    const trend = await loadStrainTrend(db, 7);
    expect(trend).toHaveLength(7);
  });
});