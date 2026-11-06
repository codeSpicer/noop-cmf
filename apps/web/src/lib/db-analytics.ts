/**
 * Local-first analytics helpers: read from IndexedDB and compute views.
 */
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample, SleepSegment, Workout } from '@noop-cmf/types';
import {
  computeDayStrain,
  computeOvernightMetrics,
  computeRecovery,
  computeStrainTarget,
  analyzeSleep,
  computeSleepNeedTonight,
  computeSleepDebt,
} from '@noop-cmf/physio-engine';
import { getRecoveryTier } from '@noop-cmf/types';
import type { RecoveryColorTier } from '@noop-cmf/types';
import { computeReadinessFromData } from './readiness';

const DAY_MS = 86_400_000;
const BASELINE_RHR = 50;
const BASELINE_HR_MAX = 190;

export async function hasData(db: NoopCmfDatabase = getDatabase()): Promise<boolean> {
  const count = await db.hrSamples.count();
  return count > 0;
}

export async function latestDayRange(
  db: NoopCmfDatabase = getDatabase(),
): Promise<{ start: number; end: number } | null> {
  const hr = await db.hrSamples.orderBy('timestamp').last();
  const sleep = await db.sleepSegments.orderBy('start').last();
  const workout = await db.workouts.orderBy('start').last();
  const candidates = [hr?.timestamp, sleep?.end, workout?.end].filter(
    (v) => v !== undefined,
  ) as number[];
  if (candidates.length === 0) {
    return null;
  }
  const max = Math.max(...candidates);
  return { start: max - DAY_MS, end: max + 1 };
}

function inRange<T extends { timestamp?: number; start?: number }>(
  rows: T[],
  start: number,
  end: number,
  key: 'timestamp' | 'start' = 'timestamp',
): T[] {
  return rows.filter((row) => {
    const value = key === 'timestamp' ? row.timestamp : row.start;
    return typeof value === 'number' && value >= start && value < end;
  });
}

export interface OverviewView {
  readonly strain: number;
  readonly recovery: number;
  readonly sleepPerformance: number;
  readonly strainTarget: number;
  readonly tier: RecoveryColorTier;
  readonly readiness: ReturnType<typeof computeReadinessFromData>;
  readonly hrSamples: readonly HrSample[];
  readonly sleepSegments: readonly SleepSegment[];
  readonly workouts: readonly Workout[];
}

export async function loadOverview(
  db: NoopCmfDatabase = getDatabase(),
): Promise<OverviewView | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [hrRows, sleepRows, workoutRows, stressRows] = await Promise.all([
    db.hrSamples.toArray(),
    db.sleepSegments.toArray(),
    db.workouts.toArray(),
    db.stressSamples.toArray(),
  ]);
  const dayHr = inRange(hrRows, range.start, range.end);
  const daySleep = sleepRows.filter((s) => s.start < range.end && s.end > range.start);
  if (dayHr.length === 0 && daySleep.length === 0) return null;

  const breakdown = computeDayStrain(dayHr, BASELINE_RHR, BASELINE_HR_MAX);
  const summary = analyzeSleep(daySleep);
  const overnight = computeOvernightMetrics(dayHr, stressRows, daySleep, BASELINE_RHR);
  const recovery = computeRecovery({
    ehrvToday: overnight.ehrv,
    rhrToday: overnight.restingHeartRate,
    sleepPerformance: summary.sleepPerformance || 85,
    history: [],
  });
  const weekStart = range.end - 7 * DAY_MS;
  const weekHr = hrRows.filter((s) => s.timestamp >= weekStart && s.timestamp < range.end);
  const readiness = computeReadinessFromData({
    hrSamples: weekHr,
    sleepSegments: daySleep,
    workouts: workoutRows.filter((w) => w.end >= weekStart && w.start < range.end),
    now: EpochMsSchema.parse(range.end),
  });

  return {
    strain: breakdown.strain,
    recovery,
    sleepPerformance: summary.sleepPerformance,
    strainTarget: computeStrainTarget(recovery),
    tier: getRecoveryTier(recovery),
    readiness,
    hrSamples: dayHr,
    sleepSegments: daySleep,
    workouts: workoutRows,
  };
}

export interface RecoveryView {
  readonly recovery: number;
  readonly ehrv: number;
  readonly rhr: number;
  readonly readiness: ReturnType<typeof computeReadinessFromData>;
  readonly hrSamples: readonly HrSample[];
  readonly sleepSegments: readonly SleepSegment[];
}

export async function loadRecovery(
  db: NoopCmfDatabase = getDatabase(),
): Promise<RecoveryView | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [hrRows, sleepRows, stressRows, workoutRows] = await Promise.all([
    db.hrSamples.toArray(),
    db.sleepSegments.toArray(),
    db.stressSamples.toArray(),
    db.workouts.toArray(),
  ]);
  const dayHr = inRange(hrRows, range.start, range.end);
  const daySleep = sleepRows.filter((s) => s.start < range.end && s.end > range.start);
  if (dayHr.length === 0) return null;

  const overnight = computeOvernightMetrics(dayHr, stressRows, daySleep, BASELINE_RHR);
  const summary = analyzeSleep(daySleep);
  const recovery = computeRecovery({
    ehrvToday: overnight.ehrv,
    rhrToday: overnight.restingHeartRate,
    sleepPerformance: summary.sleepPerformance || 85,
    history: [],
  });
  const weekStart = range.end - 7 * DAY_MS;
  const weekHr = hrRows.filter((s) => s.timestamp >= weekStart && s.timestamp < range.end);
  const readiness = computeReadinessFromData({
    hrSamples: weekHr,
    sleepSegments: daySleep,
    workouts: workoutRows.filter((w) => w.end >= weekStart && w.start < range.end),
    now: EpochMsSchema.parse(range.end),
  });

  return {
    recovery,
    ehrv: overnight.ehrv,
    rhr: overnight.restingHeartRate,
    readiness,
    hrSamples: dayHr,
    sleepSegments: daySleep,
  };
}

export interface SleepView {
  readonly segments: readonly SleepSegment[];
  readonly need: number;
  readonly summary: ReturnType<typeof analyzeSleep>;
}

export async function loadSleep(
  db: NoopCmfDatabase = getDatabase(),
): Promise<SleepView | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const sleepRows = await db.sleepSegments.toArray();
  const daySleep = sleepRows.filter((s) => s.start < range.end && s.end > range.start);
  if (daySleep.length === 0) return null;
  const summary = analyzeSleep(daySleep);
  const debt = computeSleepDebt(0, 450, summary.totalSleepMinutes);
  const need = computeSleepNeedTonight(10, debt);
  return { segments: daySleep, need, summary };
}

export interface StrainView {
  readonly zones: Record<number, number>;
  readonly trimp: number;
  readonly strain: number;
  readonly hrSamples: readonly HrSample[];
}

export async function loadStrain(
  db: NoopCmfDatabase = getDatabase(),
): Promise<StrainView | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const hrRows = await db.hrSamples.toArray();
  const dayHr = inRange(hrRows, range.start, range.end);
  if (dayHr.length === 0) return null;
  const breakdown = computeDayStrain(dayHr, BASELINE_RHR, BASELINE_HR_MAX);
  return {
    zones: breakdown.zoneMinutes,
    trimp: breakdown.trimp,
    strain: breakdown.strain,
    hrSamples: dayHr,
  };
}