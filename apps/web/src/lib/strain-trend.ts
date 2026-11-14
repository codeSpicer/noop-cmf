/**
 * Compute a real N-day strain trend from IndexedDB.
 */
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeDayStrain } from '@noop-cmf/physio-engine';
import { latestDayRange } from './db-analytics';
import { loadResolvedUserProfile } from './user-profile';

const DAY_MS = 86_400_000;

export async function loadStrainTrend(
  db: NoopCmfDatabase = getDatabase(),
  days = 7,
): Promise<number[]> {
  const range = await latestDayRange(db);
  if (!range) return [];
  const [hrRows, profile] = await Promise.all([
    db.hrSamples.toArray(),
    loadResolvedUserProfile(db),
  ]);
  const result: number[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const end = range.end - i * DAY_MS;
    const start = end - DAY_MS;
    const dayHr = hrRows.filter((s) => s.timestamp >= start && s.timestamp < end);
    const breakdown = computeDayStrain(dayHr, profile.restingHeartRate, profile.maxHeartRate);
    result.push(breakdown.strain);
  }
  return result;
}
