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
import { loadResolvedUserProfile } from './user-profile';
import { computeMainSleep } from './sleep-sessions';
import type { SleepSession } from './sleep-sessions';

const DAY_MS = 86_400_000;
const MIN_OVERNIGHT_HR_SAMPLES = 3;

export async function hasData(db: NoopCmfDatabase = getDatabase()): Promise<boolean> {
  const count = await db.hrSamples.count();
  return count > 0;
}

export async function latestDayRange(
  db: NoopCmfDatabase = getDatabase(),
): Promise<{ start: number; end: number } | null> {
  const hr = await db.hrSamples.orderBy('timestamp').last();
  const sleep = await db.sleepSegments.orderBy('end').last();
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

export interface SleepView {
  readonly segments: readonly SleepSegment[];
  readonly need: number;
  readonly summary: ReturnType<typeof analyzeSleep>;
  readonly sessionStart: number | null;
  readonly sessionEnd: number | null;
  readonly otherSessionsCount: number;
  readonly notes: readonly string[];
  readonly allSessionsInWindow: readonly SleepSession[];
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
  readonly overnightHrSamples: number;
  readonly historyDays: number;
}

export async function loadOverview(
  db: NoopCmfDatabase = getDatabase(),
): Promise<OverviewView | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [hrRows, sleepRows, workoutRows, stressRows, profile] = await Promise.all([
    db.hrSamples.toArray(),
    db.sleepSegments.toArray(),
    db.workouts.toArray(),
    db.stressSamples.toArray(),
    loadResolvedUserProfile(db),
  ]);
  const dayHr = inRange(hrRows, range.start, range.end);
  const mainSleep = computeMainSleep(sleepRows, range.end);
  const daySleep = mainSleep.session?.segments ?? [];
  if (dayHr.length === 0 && daySleep.length === 0) return null;

  const breakdown = computeDayStrain(dayHr, profile.restingHeartRate, profile.maxHeartRate);
  const summary = analyzeSleep(daySleep);
  const overnight = computeOvernightMetrics(dayHr, stressRows, daySleep, profile.restingHeartRate);
  const history: { ehrv: number; restingHeartRate: number }[] = [];
  for (let i = 1; i <= 30; i += 1) {
    const dEnd = range.end - i * DAY_MS;
    const dStart = dEnd - DAY_MS;
    const dHr = hrRows.filter((h) => h.timestamp >= dStart && h.timestamp < dEnd);
    if (dHr.length === 0) continue;
    const dSleep = sleepRows.filter((s) => s.start < dEnd && s.end > dStart);
    const dStress = stressRows.filter((s) => s.timestamp >= dStart && s.timestamp < dEnd);
    const dOvernight = computeOvernightMetrics(dHr, dStress, dSleep, profile.restingHeartRate);
    if (dOvernight.hrSampleCount < MIN_OVERNIGHT_HR_SAMPLES) continue;
    history.push({ ehrv: dOvernight.ehrv, restingHeartRate: dOvernight.restingHeartRate });
  }
  const sleepPerfForRecovery = daySleep.length > 0 ? summary.sleepPerformance : 50;
  const recovery = computeRecovery({
    ehrvToday: overnight.ehrv,
    rhrToday: overnight.restingHeartRate,
    sleepPerformance: sleepPerfForRecovery,
    history,
  });
  const weekStart = range.end - 7 * DAY_MS;
  const weekHr = hrRows.filter((s) => s.timestamp >= weekStart && s.timestamp < range.end);
  const readiness = computeReadinessFromData({
    hrSamples: weekHr,
    sleepSegments: daySleep,
    workouts: workoutRows.filter((w) => w.end >= weekStart && w.start < range.end),
    now: EpochMsSchema.parse(range.end),
    recoveryScore: recovery,
    restingHeartRate: profile.restingHeartRate,
    maxHeartRate: profile.maxHeartRate,
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
    overnightHrSamples: overnight.hrSampleCount,
    historyDays: history.length,
  };
}

export interface RecoveryView {
  readonly recovery: number;
  readonly ehrv: number;
  readonly rhr: number;
  readonly readiness: ReturnType<typeof computeReadinessFromData>;
  readonly hrSamples: readonly HrSample[];
  readonly sleepSegments: readonly SleepSegment[];
  readonly overnightHrSamples: number;
  readonly overnightStressSamples: number;
  readonly historyDays: number;
}

export async function loadRecovery(
  db: NoopCmfDatabase = getDatabase(),
): Promise<RecoveryView | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [hrRows, sleepRows, stressRows, workoutRows, profile] = await Promise.all([
    db.hrSamples.toArray(),
    db.sleepSegments.toArray(),
    db.stressSamples.toArray(),
    db.workouts.toArray(),
    loadResolvedUserProfile(db),
  ]);
  const dayHr = inRange(hrRows, range.start, range.end);
  const mainSleep = computeMainSleep(sleepRows, range.end);
  const daySleep = mainSleep.session?.segments ?? [];
  if (dayHr.length === 0) return null;

  const overnight = computeOvernightMetrics(dayHr, stressRows, daySleep, profile.restingHeartRate);
  const summary = analyzeSleep(daySleep);
  // Build rolling history from prior days for a meaningful recovery score.
  const history: { ehrv: number; restingHeartRate: number }[] = [];
  for (let i = 1; i <= 30; i += 1) {
    const dEnd = range.end - i * DAY_MS;
    const dStart = dEnd - DAY_MS;
    const dHr = hrRows.filter((h) => h.timestamp >= dStart && h.timestamp < dEnd);
    if (dHr.length === 0) continue;
    const dSleep = sleepRows.filter((s) => s.start < dEnd && s.end > dStart);
    const dStress = stressRows.filter((s) => s.timestamp >= dStart && s.timestamp < dEnd);
    const dOvernight = computeOvernightMetrics(dHr, dStress, dSleep, profile.restingHeartRate);
    if (dOvernight.hrSampleCount < MIN_OVERNIGHT_HR_SAMPLES) continue;
    history.push({
      ehrv: dOvernight.ehrv,
      restingHeartRate: dOvernight.restingHeartRate,
    });
  }
  const sleepPerfForRecovery = daySleep.length > 0 ? summary.sleepPerformance : 50;
  const recovery = computeRecovery({
    ehrvToday: overnight.ehrv,
    rhrToday: overnight.restingHeartRate,
    sleepPerformance: sleepPerfForRecovery,
    history,
  });
  const weekStart = range.end - 7 * DAY_MS;
  const weekHr = hrRows.filter((s) => s.timestamp >= weekStart && s.timestamp < range.end);
  const readiness = computeReadinessFromData({
    hrSamples: weekHr,
    sleepSegments: daySleep,
    workouts: workoutRows.filter((w) => w.end >= weekStart && w.start < range.end),
    now: EpochMsSchema.parse(range.end),
    recoveryScore: recovery,
    restingHeartRate: profile.restingHeartRate,
    maxHeartRate: profile.maxHeartRate,
  });

  return {
    recovery,
    ehrv: overnight.ehrv,
    rhr: overnight.restingHeartRate,
    readiness,
    hrSamples: dayHr,
    sleepSegments: daySleep,
    overnightHrSamples: overnight.hrSampleCount,
    overnightStressSamples: overnight.stressSampleCount,
    historyDays: history.length,
  };
}

export async function loadSleep(
  db: NoopCmfDatabase = getDatabase(),
): Promise<SleepView | null> {
  const range = await latestDayRange(db);
  if (!range) return null;
  const [sleepRows, hrRows, profile] = await Promise.all([
    db.sleepSegments.toArray(),
    db.hrSamples.toArray(),
    loadResolvedUserProfile(db),
  ]);
  const main = computeMainSleep(sleepRows, range.end);
  if (!main.session) return null;
  const segments = main.session.segments;
  const summary = analyzeSleep(segments);

  // Estimate today's strain for sleep need (strain factor in sleep-need model).
  const dayHr = inRange(hrRows, range.start, range.end);
  const strainToday = computeDayStrain(dayHr, profile.restingHeartRate, profile.maxHeartRate).strain;
  const debt = computeSleepDebt(0, 450, summary.totalSleepMinutes);
  const need = computeSleepNeedTonight(strainToday, debt);

  return {
    segments,
    need,
    summary,
    sessionStart: main.session.start,
    sessionEnd: main.session.end,
    otherSessionsCount: main.otherSessionsCount,
    notes: main.notes,
    allSessionsInWindow: main.allSessionsInWindow,
  };
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
  const [hrRows, profile] = await Promise.all([
    db.hrSamples.toArray(),
    loadResolvedUserProfile(db),
  ]);
  const dayHr = inRange(hrRows, range.start, range.end);
  if (dayHr.length === 0) return null;
  const breakdown = computeDayStrain(dayHr, profile.restingHeartRate, profile.maxHeartRate);
  return {
    zones: breakdown.zoneMinutes,
    trimp: breakdown.trimp,
    strain: breakdown.strain,
    hrSamples: dayHr,
  };
}

/** Daily resting HR (10th percentile) for the last 28 days. */
export async function loadRhrTrend(db: NoopCmfDatabase = getDatabase()): Promise<readonly number[]> {
  const hrRows = await db.hrSamples.toArray();
  if (hrRows.length === 0) return [];
  const byDay = new Map<string, number[]>();
  for (const h of hrRows) {
    const day = new Date(h.timestamp).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    const bd = byDay.get(day);
    if (bd) bd.push(h.bpm);
  }
  const sorted = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const last28 = sorted.slice(-28);
  return last28.map(([, bpms]) => {
    const sortedBpms = [...bpms].sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor(sortedBpms.length * 0.1));
    return sortedBpms[idx] ?? sortedBpms[0] ?? 0;
  });
}
