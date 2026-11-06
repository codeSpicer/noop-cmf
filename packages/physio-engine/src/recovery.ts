/**
 * Overnight RHR / eHRV estimator plus the 30-day rolling Z-score recovery
 * calculator (spec equations [D] and [E]).
 */
import {
  MILLISECONDS_MAX,
  MILLISECONDS_MIN,
  RECOVERY_MAX,
  RECOVERY_MIN,
  type Bpm,
  type Milliseconds,
  type RecoveryPercent,
} from '@noop-cmf/types';
import type { HrSample, SleepSegment, StressSample } from '@noop-cmf/types';

/** Baseline used by the eHRV proxy when no history exists yet. */
export const EHRV_BASELINE_PROXY = 110;

/** eHRV penalty per stress point (spec equation [D]). */
export const EHRV_STRESS_COEFFICIENT = 0.9;

/** eHRV penalty per bpm above the 30-day RHR baseline (spec equation [D]). */
export const EHRV_RHR_COEFFICIENT = 0.6;

/** Percentile used for overnight RHR (spec equation [D]). */
export const OVERNIGHT_RHR_PERCENTILE = 10;

/** Recovery baseline intercept (spec equation [E]). */
export const RECOVERY_BASELINE = 50;

/** Recovery weight on the eHRV Z-score (spec equation [E]). */
export const RECOVERY_EHRV_WEIGHT = 18;

/** Recovery weight on the RHR Z-score (spec equation [E]). */
export const RECOVERY_RHR_WEIGHT = 14;

/** Recovery weight on sleep performance above 80 (spec equation [E]). */
export const RECOVERY_SLEEP_WEIGHT = 0.25;

/** Sleep performance anchor for the recovery sleep term (spec [E]). */
export const RECOVERY_SLEEP_ANCHOR = 80;

/** Minimum history days before sample variance is trusted (spec [E]). */
export const MIN_HISTORY_DAYS = 3;

/** Denominator floor for the eHRV sigma guard (spec equation [E]). */
export const EHRV_SIGMA_FLOOR = 4.0;

/** Denominator floor for the RHR sigma guard (spec equation [E]). */
export const RHR_SIGMA_FLOOR = 2.0;

/** Percentile helper for sorted numeric arrays. */
export function percentile(sorted: readonly number[], pct: number): number {
  if (sorted.length === 0) {
    throw new RangeError('percentile requires at least one value');
  }
  if (pct <= 0) {
    return sorted[0] as number;
  }
  if (pct >= 100) {
    return sorted[sorted.length - 1] as number;
  }
  const rank = (pct / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const lowerValue = sorted[lower] as number;
  const upperValue = sorted[upper] as number;
  return lowerValue + (upperValue - lowerValue) * (rank - lower);
}

/** Arithmetic mean; empty input yields 0. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

/** Sample standard deviation (n-1); fewer than 2 values yields 0. */
export function sampleStdDev(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  let sumSq = 0;
  for (const value of values) {
    sumSq += (value - avg) * (value - avg);
  }
  return Math.sqrt(sumSq / (values.length - 1));
}

/** Result of the overnight estimation. */
export interface OvernightMetrics {
  readonly restingHeartRate: Bpm;
  readonly stress: number;
  readonly ehrv: Milliseconds;
}

/**
 * Overnight RHR, mean stress, and eHRV proxy (spec equation [D]).
 *
 * Only HR/stress samples strictly overlapping asleep stages count.
 * Falls back to `baselineRhr` / neutral 50 stress when no asleep overlap
 * exists, so the function never returns NaN.
 */
export function computeOvernightMetrics(
  hrSamples: readonly HrSample[],
  stressSamples: readonly StressSample[],
  sleepSegments: readonly SleepSegment[],
  baselineRhr: number,
): OvernightMetrics {
  const asleep = sleepSegments.filter((segment) => segment.stage !== 'awake');
  const hasNight = asleep.length > 0;

  const overnightHr = !hasNight
    ? []
    : hrSamples.filter((sample) =>
        asleep.some(
          (segment) => sample.timestamp >= segment.start && sample.timestamp < segment.end,
        ),
      );

  const hrValues = overnightHr.map((sample) => sample.bpm).sort((a, b) => a - b);
  const stressValues = !hasNight
    ? []
    : stressSamples
        .filter((sample) =>
          asleep.some(
            (segment) => sample.timestamp >= segment.start && sample.timestamp < segment.end,
          ),
        )
        .map((sample) => sample.stress);

  const restingHeartRate = (
    hrValues.length > 0
      ? Math.round(percentile(hrValues, OVERNIGHT_RHR_PERCENTILE))
      : Math.round(baselineRhr)
  ) as Bpm;
  const stress = stressValues.length > 0 ? mean(stressValues) : 50;
  const ehrv = Math.round(
    Math.min(
      MILLISECONDS_MAX,
      Math.max(
        MILLISECONDS_MIN,
        EHRV_BASELINE_PROXY -
          EHRV_STRESS_COEFFICIENT * stress -
          EHRV_RHR_COEFFICIENT * (restingHeartRate - baselineRhr),
      ),
    ),
  ) as Milliseconds;

  return { restingHeartRate, stress, ehrv };
}

/** One day of history feeding the rolling recovery calculator. */
export interface RecoveryHistoryDay {
  readonly ehrv: number;
  readonly restingHeartRate: number;
}

/** Inputs for today's recovery score (spec equation [E]). */
export interface RecoveryInputs {
  readonly ehrvToday: number;
  readonly rhrToday: number;
  readonly sleepPerformance: number;
  readonly history: readonly RecoveryHistoryDay[];
}

/**
 * Rolling 30-day Z-score recovery in `[1, 99]` (spec equation [E]).
 *
 * Cold-start / zero-variance guard: history shorter than
 * {@link MIN_HISTORY_DAYS} or sigma below 1.0 clamps denominators to
 * {@link EHRV_SIGMA_FLOOR} / {@link RHR_SIGMA_FLOOR}, so division by zero
 * cannot occur and the result is always a finite integer.
 */
export function computeRecovery(inputs: RecoveryInputs): RecoveryPercent {
  const { ehrvToday, rhrToday, sleepPerformance, history } = inputs;
  const ehrvHistory = history.map((day) => day.ehrv);
  const rhrHistory = history.map((day) => day.restingHeartRate);

  const muEhrv = ehrvHistory.length > 0 ? mean(ehrvHistory) : ehrvToday;
  const muRhr = rhrHistory.length > 0 ? mean(rhrHistory) : rhrToday;

  let sigmaEhrv = sampleStdDev(ehrvHistory);
  let sigmaRhr = sampleStdDev(rhrHistory);
  if (history.length < MIN_HISTORY_DAYS || sigmaEhrv < 1.0) {
    sigmaEhrv = Math.max(sigmaEhrv, EHRV_SIGMA_FLOOR);
  }
  if (history.length < MIN_HISTORY_DAYS || sigmaRhr < 1.0) {
    sigmaRhr = Math.max(sigmaRhr, RHR_SIGMA_FLOOR);
  }

  const zEhrv = (ehrvToday - muEhrv) / sigmaEhrv;
  const zRhr = (rhrToday - muRhr) / sigmaRhr;

  const raw =
    RECOVERY_BASELINE +
    RECOVERY_EHRV_WEIGHT * zEhrv -
    RECOVERY_RHR_WEIGHT * zRhr +
    RECOVERY_SLEEP_WEIGHT * (sleepPerformance - RECOVERY_SLEEP_ANCHOR);

  if (!Number.isFinite(raw)) {
    return 50 as RecoveryPercent;
  }
  return Math.min(RECOVERY_MAX, Math.max(RECOVERY_MIN, Math.round(raw))) as RecoveryPercent;
}

/**
 * Body Battery-style energy score 1..100.
 * Combines recovery, sleep debt, and today's strain.
 */
export function computeEnergyScore(recovery: number, sleepDebtMinutes: number, strain: number): number {
  const base = Number.isFinite(recovery) ? recovery : 50;
  const debt = Number.isFinite(sleepDebtMinutes) ? sleepDebtMinutes : 0;
  const s = Number.isFinite(strain) ? strain : 0;
  const raw = base * (1 - (s / 21) * 0.3) - debt * 0.05;
  return Math.max(1, Math.min(100, Math.round(raw)));
}

/**
 * Optimal strain target for today, one decimal (spec equation [F]).
 */
export function computeStrainTarget(recovery: number): number {
  const target = 6.0 + (recovery / 100) * 11.5;
  return Math.round(target * 10) / 10;
}
