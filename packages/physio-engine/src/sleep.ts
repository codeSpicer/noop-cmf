/**
 * Sleep architecture analysis: efficiency, restorative share, debt, and
 * dynamic sleep need (part of spec equation [F]).
 */
import type { EpochMs, SleepSegment } from '@noop-cmf/types';

/** Milliseconds in one minute. */
export const MS_PER_MINUTE = 60_000;

/** Milliseconds in one hour. */
export const MS_PER_HOUR = 3_600_000;

/** Baseline nightly sleep need in minutes (spec equation [F]). */
export const BASELINE_SLEEP_MINUTES = 450;

/** Extra sleep-need minutes accrued per strain point (spec equation [F]). */
export const SLEEP_NEED_STRAIN_COEFFICIENT = 3.0;

/** Fraction of prior sleep debt carried into tonight's need (spec [F]). */
export const SLEEP_DEBT_CARRYOVER = 0.5;

/** Summary of one night of sleep architecture. */
export interface SleepSummary {
  /** Total time in bed, minutes (all segments). */
  readonly timeInBedMinutes: number;
  /** Total asleep minutes (light + deep + rem). */
  readonly totalSleepMinutes: number;
  /** Share of asleep time in deep + rem. Range 0..1. */
  readonly restorativeShare: number;
  /** Sleep efficiency percent. Range 0..100. */
  readonly sleepEfficiency: number;
  /** Sleep performance score blending efficiency and restorative share. Range 0..100. */
  readonly sleepPerformance: number;
}

/**
 * Analyze sleep segments for a single night.
 *
 * Empty input yields a zeroed summary (no sleep recorded) rather than NaN.
 */
export function analyzeSleep(segments: readonly SleepSegment[]): SleepSummary {
  let timeInBedMinutes = 0;
  let totalSleepMinutes = 0;
  let restorativeMinutes = 0;

  for (const segment of segments) {
    const minutes = Math.max(0, (segment.end - segment.start) / MS_PER_MINUTE);
    timeInBedMinutes += minutes;
    if (segment.stage === 'light' || segment.stage === 'deep' || segment.stage === 'rem') {
      totalSleepMinutes += minutes;
    }
    if (segment.stage === 'deep' || segment.stage === 'rem') {
      restorativeMinutes += minutes;
    }
  }

  if (timeInBedMinutes <= 0 || totalSleepMinutes <= 0) {
    return {
      timeInBedMinutes: round1(Math.max(0, timeInBedMinutes)),
      totalSleepMinutes: 0,
      restorativeShare: 0,
      sleepEfficiency: 0,
      sleepPerformance: 0,
    };
  }

  const restorativeShare = restorativeMinutes / totalSleepMinutes;
  const sleepEfficiency = (totalSleepMinutes / timeInBedMinutes) * 100;
  const sleepPerformance = Math.round(
    Math.min(100, Math.max(0, 0.6 * sleepEfficiency + 0.4 * restorativeShare * 100)),
  );

  return {
    timeInBedMinutes: round1(timeInBedMinutes),
    totalSleepMinutes: round1(totalSleepMinutes),
    restorativeShare,
    sleepEfficiency: round1(sleepEfficiency),
    sleepPerformance,
  };
}

/**
 * Dynamic sleep need for tonight in minutes (spec equation [F]).
 *
 * `sleepDebtMinutes` is the carried prior debt (positive = owed sleep).
 */
export function computeSleepNeedTonight(strainToday: number, sleepDebtMinutes: number): number {
  const need =
    BASELINE_SLEEP_MINUTES +
    Math.round(SLEEP_NEED_STRAIN_COEFFICIENT * strainToday) +
    Math.round(SLEEP_DEBT_CARRYOVER * sleepDebtMinutes);
  return Math.max(0, need);
}

/**
 * Update sleep debt: prior debt plus today's shortfall (need - slept).
 * Negative result means a sleep surplus (credit).
 */
export function computeSleepDebt(
  priorDebtMinutes: number,
  sleepNeedMinutes: number,
  sleptMinutes: number,
): number {
  return priorDebtMinutes + (sleepNeedMinutes - sleptMinutes);
}

/**
 * Group sleep segments into per-night buckets keyed by wake-up date.
 *
 * Each segment is attributed to the night ending at the first wake-up time
 * strictly after the segment start (pre-midnight sleep belongs to the next
 * morning's recovery, per the physiological-cycle model). Segments at or
 * after the final wake-up are attributed to that final wake-up.
 */
export function groupSegmentsByNight(
  segments: readonly SleepSegment[],
  wakeTimes: readonly EpochMs[],
): SleepSegment[][] {
  const sortedWakes = [...wakeTimes].sort((a, b) => a - b);
  const nights: SleepSegment[][] = sortedWakes.map(() => []);
  for (const segment of segments) {
    const index = sortedWakes.findIndex((wake) => segment.start < wake);
    const target = index === -1 ? sortedWakes.length - 1 : index;
    if (target >= 0) {
      nights[target]?.push(segment);
    }
  }
  return nights;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
