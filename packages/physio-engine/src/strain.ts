/**
 * Karvonen heart-rate zone classifier plus Banister TRIMP and logarithmic
 * day-strain math (spec equations [A], [B], [C]).
 */
import {
  BPM_MAX,
  BPM_MIN,
  STRAIN_SCORE_MAX,
  type HrSample,
  type StrainScore,
} from '@noop-cmf/types';

/** Lower inclusive bound of Zone 1 as an HR-reserve fraction. */
export const ZONE_1_MIN = 0.5;

/** Lower inclusive bound of Zone 2 as an HR-reserve fraction. */
export const ZONE_2_MIN = 0.6;

/** Lower inclusive bound of Zone 3 as an HR-reserve fraction. */
export const ZONE_3_MIN = 0.7;

/** Lower inclusive bound of Zone 4 as an HR-reserve fraction. */
export const ZONE_4_MIN = 0.8;

/** Lower inclusive bound of Zone 5 as an HR-reserve fraction. */
export const ZONE_5_MIN = 0.9;

/** One of the five Karvonen training zones. */
export type HrZone = 1 | 2 | 3 | 4 | 5;

/** Seconds per minute; samples are aggregated on whole-minute boundaries. */
export const SECONDS_PER_MINUTE = 60;

/** Banister TRIMP exponential weighting factor. */
export const TRIMP_EXPONENT_FACTOR = 1.92;

/** Banister TRIMP linear scaling factor. */
export const TRIMP_SCALING_FACTOR = 0.64;

/** Minimum HR-reserve fraction that accrues TRIMP. */
export const TRIMP_MIN_HR_RATIO = 0.3;

/** Default strain curve gain `k` (spec equation [C]). */
export const STRAIN_CURVE_GAIN = 6.2;

/** Default strain curve divisor `c` (spec equation [C]). */
export const STRAIN_CURVE_DIVISOR = 18;

/** Samples per aggregation bin used by the strain integrator. */
export const SAMPLES_PER_MINUTE = 1;

/** Single timestamped heart-rate observation for strain integration. */
export interface HrSampleInput {
  readonly timestamp: HrSample['timestamp'];
  readonly bpm: HrSample['bpm'];
}

/**
 * Clamp `value` into `[min, max]`.
 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/**
 * Heart-rate reserve fraction in `[0, 1]` (spec equation [A]).
 *
 * Returns 0 when `hrMax <= rhr` (degenerate resting baseline) instead of
 * producing NaN.
 */
export function hrRatio(hr: number, rhr: number, hrMax: number): number {
  if (hrMax <= rhr) {
    return 0;
  }
  return clamp((hr - rhr) / (hrMax - rhr), 0, 1);
}

/**
 * Classify one heart-rate sample into Karvonen zones 1-5.
 *
 * Fractions below {@link ZONE_1_MIN} fall in Zone 1 (recovery floor).
 */
export function classifyHrZone(hr: number, rhr: number, hrMax: number): HrZone {
  const ratio = hrRatio(hr, rhr, hrMax);
  if (ratio >= ZONE_5_MIN) {
    return 5;
  }
  if (ratio >= ZONE_4_MIN) {
    return 4;
  }
  if (ratio >= ZONE_3_MIN) {
    return 3;
  }
  if (ratio >= ZONE_2_MIN) {
    return 2;
  }
  return 1;
}

/**
 * Exponential Banister TRIMP over one-minute samples (spec equation [B]).
 *
 * Samples below {@link TRIMP_MIN_HR_RATIO} contribute zero. `dtMinutes` is
 * the per-sample duration in minutes (1 for 1-minute samples).
 */
export function banisterTrimp(
  samples: readonly HrSampleInput[],
  rhr: number,
  hrMax: number,
  dtMinutes = SAMPLES_PER_MINUTE,
): number {
  let trimp = 0;
  for (const sample of samples) {
    const ratio = hrRatio(sample.bpm, rhr, hrMax);
    if (ratio < TRIMP_MIN_HR_RATIO) {
      continue;
    }
    trimp += dtMinutes * ratio * TRIMP_SCALING_FACTOR * Math.exp(TRIMP_EXPONENT_FACTOR * ratio);
  }
  return trimp;
}

/** Result of day-strain integration with per-zone minute tallies. */
export interface StrainBreakdown {
  readonly strain: StrainScore;
  readonly trimp: number;
  readonly zoneMinutes: Record<HrZone, number>;
}

/**
 * Logarithmic day strain in `[0.0, 21.0]` (spec equation [C]) plus the
 * contributing TRIMP and per-zone minute breakdown.
 */
export function computeDayStrain(
  samples: readonly HrSampleInput[],
  rhr: number,
  hrMax: number,
  gain: number = STRAIN_CURVE_GAIN,
  divisor: number = STRAIN_CURVE_DIVISOR,
): StrainBreakdown {
  const zoneMinutes: Record<HrZone, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const sample of samples) {
    zoneMinutes[classifyHrZone(sample.bpm, rhr, hrMax)] += 1;
  }
  const trimp = banisterTrimp(samples, rhr, hrMax);
  const raw = gain * Math.log(1 + trimp / divisor);
  const rounded = Math.round(raw * 10) / 10;
  const strain = clamp(rounded, 0, STRAIN_SCORE_MAX) as StrainScore;
  return { strain, trimp, zoneMinutes };
}

/** Result of intensity-minute tallying. */
export interface IntensityMinutes {
  readonly moderate: number;
  readonly vigorous: number;
}

/**
 * Tally moderate (zone 2+) and vigorous (zone 4+) minutes from HR samples.
 */
export function computeIntensityMinutes(
  samples: readonly HrSampleInput[],
  rhr: number,
  hrMax: number,
): IntensityMinutes {
  let moderate = 0;
  let vigorous = 0;
  for (const sample of samples) {
    const zone = classifyHrZone(sample.bpm, rhr, hrMax);
    if (zone >= 2) moderate += 1;
    if (zone >= 4) vigorous += 1;
  }
  return { moderate, vigorous };
}

/** Validate resting/max heart-rate baselines used across the engine. */
export function assertValidBaselines(rhr: number, hrMax: number): void {
  if (!Number.isFinite(rhr) || rhr < BPM_MIN || rhr > BPM_MAX) {
    throw new RangeError(`rhr must be within ${String(BPM_MIN)}..${String(BPM_MAX)}`);
  }
  if (!Number.isFinite(hrMax) || hrMax < BPM_MIN || hrMax > BPM_MAX) {
    throw new RangeError(`hrMax must be within ${String(BPM_MIN)}..${String(BPM_MAX)}`);
  }
}
