import { describe, expect, it, beforeEach } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample } from '@noop-cmf/types';
import { loadWorkoutTrimp } from './workout-trimp';

const T0 = Date.UTC(2024, 0, 30);
function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}

describe('workout-trimp', () => {
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('returns empty when no workouts', async () => {
    const db = getDatabase();
    expect(await loadWorkoutTrimp(db)).toEqual([]);
  });

  it('computes trimp per workout', async () => {
    const db = getDatabase();
    const start = T0 - 2000;
    const end = T0 - 1000;
    await db.workouts.put({
      id: 'w1',
      start: EpochMsSchema.parse(start),
      end: EpochMsSchema.parse(end),
      activityType: 'run',
    });
    await db.hrSamples.bulkPut([hr(start + 100, 150), hr(start + 200, 160)]);
    const result = await loadWorkoutTrimp(db);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('w1');
  });
});