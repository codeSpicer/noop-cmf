import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeIntensityMinutes as engineIntensity } from '@noop-cmf/physio-engine';
import { latestDayRange } from './db-analytics';
import { loadResolvedUserProfile } from './user-profile';

export async function loadIntensityMinutes(
  db: NoopCmfDatabase = getDatabase(),
  days = 7,
): Promise<{ moderate: number; vigorous: number } | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [hrRows, profile] = await Promise.all([
    db.hrSamples.toArray(),
    loadResolvedUserProfile(db),
  ]);
  const weekStart = range.end - days * 86400000;
  const weekHr = hrRows.filter((h) => h.timestamp >= weekStart && h.timestamp < range.end);
  if (weekHr.length === 0) return null;
  return engineIntensity(weekHr, profile.restingHeartRate, profile.maxHeartRate);
}
