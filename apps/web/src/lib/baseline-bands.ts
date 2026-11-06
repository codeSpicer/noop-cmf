/**
 * Compute daily RHR/eHRV baseline bands from IndexedDB.
 */
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeOvernightMetrics, mean, sampleStdDev } from '@noop-cmf/physio-engine';
import { latestDayRange } from './db-analytics';

const DAY_MS = 86_400_000;
const BASELINE_RHR = 50;

export interface DailyBaseline {
  readonly day: number;
  readonly rhr: number;
  readonly ehrv: number;
}

export interface BaselineBands {
  readonly daily: readonly DailyBaseline[];
  readonly rhrMean: number;
  readonly rhrStd: number;
  readonly ehrvMean: number;
  readonly ehrvStd: number;
}

export async function loadBaselineBands(
  db: NoopCmfDatabase = getDatabase(),
  days = 14,
): Promise<BaselineBands | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [hrRows, stressRows, sleepRows] = await Promise.all([
    db.hrSamples.toArray(),
    db.stressSamples.toArray(),
    db.sleepSegments.toArray(),
  ]);
  const daily: DailyBaseline[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const end = range.end - i * DAY_MS;
    const start = end - DAY_MS;
    const dayHr = hrRows.filter((h) => h.timestamp >= start && h.timestamp < end);
    const daySleep = sleepRows.filter((s) => s.start < end && s.end > start);
    const dayStress = stressRows.filter((s) => s.timestamp >= start && s.timestamp < end);
    if (dayHr.length === 0) continue;
    const overnight = computeOvernightMetrics(dayHr, dayStress, daySleep, BASELINE_RHR);
    daily.push({ day: start, rhr: overnight.restingHeartRate, ehrv: overnight.ehrv });
  }
  if (daily.length === 0) return null;
  const rhrValues = daily.map((d) => d.rhr);
  const ehrvValues = daily.map((d) => d.ehrv);
  return {
    daily,
    rhrMean: mean(rhrValues),
    rhrStd: sampleStdDev(rhrValues),
    ehrvMean: mean(ehrvValues),
    ehrvStd: sampleStdDev(ehrvValues),
  };
}