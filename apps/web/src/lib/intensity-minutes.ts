import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeIntensityMinutes as engineIntensity } from '@noop-cmf/physio-engine';
import { latestDayRange } from './db-analytics';

const BASELINE_RHR = 50;
const BASELINE_HR_MAX = 190;

export async function loadIntensityMinutes(
  db: NoopCmfDatabase = getDatabase(),
  days = 7,
): Promise<{ moderate: number; vigorous: number } | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const hrRows = await db.hrSamples.toArray();
  const weekStart = range.end - days * 86400000;
  const weekHr = hrRows.filter((h) => h.timestamp >= weekStart && h.timestamp < range.end);
  if (weekHr.length === 0) return null;
  return engineIntensity(weekHr, BASELINE_RHR, BASELINE_HR_MAX);
}