import { beforeEach, describe, expect, it } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample } from '@noop-cmf/types';
import { loadTrainingLoad } from './training-load';

const T0 = Date.UTC(2024, 0, 30);

function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}

describe('training-load', () => {
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('returns null when empty', async () => {
    expect(await loadTrainingLoad(getDatabase())).toBeNull();
  });

  it('reports calibrating with sparse history to avoid false overreaching', async () => {
    const db = getDatabase();
    // only recent days of data within 28d window (sparse history)
    await db.hrSamples.bulkPut([
      hr(T0 - 1000, 150),
      hr(T0 - 2000, 155),
      hr(T0 - 86400000 - 1000, 150),
      hr(T0 - 2 * 86400000 - 1000, 150),
      hr(T0 - 3 * 86400000 - 1000, 150),
      hr(T0 - 4 * 86400000 - 1000, 150),
      hr(T0 - 5 * 86400000 - 1000, 150),
      hr(T0 - 6 * 86400000 - 1000, 150),
    ]);
    const view = await loadTrainingLoad(db);
    expect(view).not.toBeNull();
    expect(view?.status).toBe('calibrating');
    expect(view?.daysWithData28).toBeLessThan(14);
  });
});
