import { analyzeSleep, computeDayStrain } from '@noop-cmf/physio-engine';
import type { NoopCmfDatabase } from '@/db/database';
import { loadResolvedUserProfile, localDayKey, sumDailySteps } from './user-profile';

export interface WeeklyBucket {
  readonly weekLabel: string;
  readonly weekStart: number;
  readonly avgStrain: number;
  readonly avgRecovery: number;
  readonly avgSleepPerf: number;
  readonly totalSteps: number;
  readonly avgEnergy: number;
  readonly wearHours: number;
  readonly strainTrend: readonly number[];
}

export interface WeeklySummaryView {
  readonly weeks: readonly WeeklyBucket[];
}

function weekKey(ts: number): string {
  const d = new Date(ts);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const weekNum = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7);
  return `${String(d.getFullYear())}-W${String(weekNum).padStart(2, '0')}`;
}

export async function loadWeeklySummary(db: NoopCmfDatabase): Promise<WeeklySummaryView | null> {
  const [hrRows, stressRows, sleepRows, stepRows, profile] = await Promise.all([
    db.hrSamples.toArray(),
    db.stressSamples.toArray(),
    db.sleepSegments.toArray(),
    db.steps.toArray(),
    loadResolvedUserProfile(db),
  ]);
  if (hrRows.length === 0) return null;

  const weeks = new Map<string, { hr: typeof hrRows; stress: typeof stressRows; sleep: typeof sleepRows; steps: typeof stepRows }>();
  for (const h of hrRows) {
    const k = weekKey(h.timestamp);
    if (!weeks.has(k)) weeks.set(k, { hr: [], stress: [], sleep: [], steps: [] });
    const w = weeks.get(k);
    if (w) w.hr.push(h);
  }
  for (const s of stressRows) {
    const k = weekKey(s.timestamp);
    const ws = weeks.get(k);
    if (ws) ws.stress.push(s);
  }
  for (const s of sleepRows) {
    const k = weekKey(s.start);
    const wsl = weeks.get(k);
    if (wsl) wsl.sleep.push(s);
  }
  for (const s of stepRows) {
    const k = weekKey(s.timestamp);
    const wst = weeks.get(k);
    if (wst) wst.steps.push(s);
  }

  const buckets: WeeklyBucket[] = [];
  for (const [label, data] of weeks) {
    const dayStrains: number[] = [];
    const daySleepPerfs: number[] = [];
    let totalSteps = 0;
    const wearHours = data.hr.length * (5 / 60); // assume 5-min intervals

    // Group HR by local day for strain
    const byDay = new Map<string, typeof data.hr>();
    for (const h of data.hr) {
      const day = localDayKey(h.timestamp, profile.dayStartHour);
      if (!byDay.has(day)) byDay.set(day, []);
      const bd = byDay.get(day);
      if (bd) bd.push(h);
    }
    const sortedDays = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, dayHr] of sortedDays) {
      const strain = computeDayStrain(dayHr, profile.restingHeartRate, profile.maxHeartRate).strain;
      dayStrains.push(strain);
    }

    // Sleep performance per local day (by sleep start)
    const sleepByDay = new Map<string, typeof data.sleep>();
    for (const s of data.sleep) {
      const day = localDayKey(s.start, profile.dayStartHour);
      if (!sleepByDay.has(day)) sleepByDay.set(day, []);
      const sd = sleepByDay.get(day);
      if (sd) sd.push(s);
    }
    for (const [, segs] of [...sleepByDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const summary = analyzeSleep(segs);
      daySleepPerfs.push(summary.sleepPerformance);
    }

    // Steps: cumulative counter per local day window (sum segment maxima, defensive), summed across days
    const stepsByDay = new Map<string, { timestamp: number; steps: number }[]>();
    for (const s of data.steps) {
      const day = localDayKey(s.timestamp, profile.dayStartHour);
      if (!stepsByDay.has(day)) stepsByDay.set(day, []);
      const arr = stepsByDay.get(day);
      if (arr) arr.push({ timestamp: s.timestamp, steps: s.steps });
    }
    for (const [, samples] of [...stepsByDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      totalSteps += sumDailySteps(samples);
    }

    const avgStrain = dayStrains.length > 0 ? dayStrains.reduce((a, b) => a + b, 0) / dayStrains.length : 0;
    const avgSleepPerf = daySleepPerfs.length > 0 ? daySleepPerfs.reduce((a, b) => a + b, 0) / daySleepPerfs.length : 0;
    const avgEnergy = Math.max(1, Math.min(99, Math.round(avgStrain > 0 ? 50 + (avgSleepPerf - 80) * 0.25 - avgStrain * 2 : 50)));

    buckets.push({
      weekLabel: label,
      weekStart: Math.min(...data.hr.map((h: { timestamp: number }) => h.timestamp)),
      avgStrain: Math.round(avgStrain * 10) / 10,
      avgRecovery: 0, // placeholder; recovery needs multi-day history per week
      avgSleepPerf: Math.round(avgSleepPerf),
      totalSteps,
      avgEnergy,
      wearHours: Math.round(wearHours * 10) / 10,
      strainTrend: dayStrains,
    });
  }

  buckets.sort((a, b) => a.weekStart - b.weekStart);
  return { weeks: buckets };
}