/**
 * Derive a 5-metric health monitor summary from IndexedDB.
 */
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { percentile, analyzeSleep } from '@noop-cmf/physio-engine';
import { latestDayRange } from './db-analytics';
import { loadResolvedUserProfile, computeTodaySteps } from './user-profile';
import { computeMainSleep } from './sleep-sessions';

export interface HealthMetrics {
  readonly restingHeartRate: number;
  readonly stress: number;
  readonly spo2: number;
  readonly sleepMinutes: number;
  readonly steps: number;
  readonly stepsLabel?: string;
}

export async function loadHealthMetrics(
  db: NoopCmfDatabase = getDatabase(),
): Promise<HealthMetrics | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [hrRows, stressRows, spo2Rows, sleepRows, stepRows, profile] = await Promise.all([
    db.hrSamples.toArray(),
    db.stressSamples.toArray(),
    db.spo2Samples.toArray(),
    db.sleepSegments.toArray(),
    db.steps.toArray(),
    loadResolvedUserProfile(db),
  ]);
  const dayHr = hrRows.filter((s) => s.timestamp >= range.start && s.timestamp < range.end);
  if (dayHr.length === 0) return null;
  const dayStress = stressRows.filter((s) => s.timestamp >= range.start && s.timestamp < range.end);
  const daySpo2 = spo2Rows.filter((s) => s.timestamp >= range.start && s.timestamp < range.end);

  const hrValues = dayHr.map((s) => s.bpm).sort((a, b) => a - b);
  const rhr = Math.round(percentile(hrValues, 10));
  const stress = dayStress.length > 0 ? dayStress.reduce((a, s) => a + s.stress, 0) / dayStress.length : 0;
  const spo2 = daySpo2.length > 0 ? daySpo2.reduce((a, s) => a + s.spo2, 0) / daySpo2.length : 0;

  // Main overnight sleep session in the last 24h window (aligns with Sleep view).
  const mainSleep = computeMainSleep(sleepRows, range.end);
  const sleepMinutes = mainSleep.session
    ? Math.round(analyzeSleep(mainSleep.session.segments).totalSleepMinutes)
    : 0;

  // Steps are a cumulative daily counter; compute "today" relative to the
  // latest data day using the configured local day boundary (default 00:00).
  const anchor = range.end - 1;
  const steps = computeTodaySteps(
    stepRows.map((s) => ({ timestamp: s.timestamp, steps: s.steps })),
    anchor,
    profile.dayStartHour,
  );

  return {
    restingHeartRate: rhr,
    stress: Math.round(stress),
    spo2: Math.round(spo2),
    sleepMinutes,
    steps,
    stepsLabel: 'Today',
  };
}