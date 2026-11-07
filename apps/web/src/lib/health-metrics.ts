/**
 * Derive a 5-metric health monitor summary from IndexedDB.
 */
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { percentile } from '@noop-cmf/physio-engine';
import { latestDayRange } from './db-analytics';

export interface HealthMetrics {
  readonly restingHeartRate: number;
  readonly stress: number;
  readonly spo2: number;
  readonly sleepMinutes: number;
  readonly steps: number;
}

export async function loadHealthMetrics(
  db: NoopCmfDatabase = getDatabase(),
): Promise<HealthMetrics | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [hrRows, stressRows, spo2Rows, sleepRows, stepRows] = await Promise.all([
    db.hrSamples.toArray(),
    db.stressSamples.toArray(),
    db.spo2Samples.toArray(),
    db.sleepSegments.toArray(),
    db.steps.toArray(),
  ]);
  const dayHr = hrRows.filter((s) => s.timestamp >= range.start && s.timestamp < range.end);
  if (dayHr.length === 0) return null;
  const dayStress = stressRows.filter((s) => s.timestamp >= range.start && s.timestamp < range.end);
  const daySpo2 = spo2Rows.filter((s) => s.timestamp >= range.start && s.timestamp < range.end);
  const daySleep = sleepRows.filter((s) => s.start < range.end && s.end > range.start);
  const daySteps = stepRows.filter((s) => s.timestamp >= range.start && s.timestamp < range.end);

  const hrValues = dayHr.map((s) => s.bpm).sort((a, b) => a - b);
  const rhr = Math.round(percentile(hrValues, 10));
  const stress = dayStress.length > 0 ? dayStress.reduce((a, s) => a + s.stress, 0) / dayStress.length : 0;
  const spo2 = daySpo2.length > 0 ? daySpo2.reduce((a, s) => a + s.spo2, 0) / daySpo2.length : 0;
  const sleepMinutes = daySleep.reduce((a, s) => a + (s.end - s.start) / 60000, 0);
  // Steps are reported as a cumulative daily counter per record; take the
  // max within the day rather than summing (which would over-count).
  const steps = daySteps.length > 0 ? Math.max(...daySteps.map((s) => s.steps)) : 0;

  return {
    restingHeartRate: rhr,
    stress: Math.round(stress),
    spo2: Math.round(spo2),
    sleepMinutes: Math.round(sleepMinutes),
    steps,
  };
}