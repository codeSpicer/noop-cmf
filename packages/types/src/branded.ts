/**
 * Branded domain primitives plus Zod boundary schemas and constructors.
 *
 * Brands enforce unit safety at compile time (an {@link EpochMs} cannot be
 * passed where a {@link Bpm} is expected); the Zod schemas enforce the same
 * ranges at runtime for every external payload.
 */
import { z } from 'zod';
import { err, ok, type Result } from './result.js';

/** Minimum valid {@link EpochMs} (Unix epoch). */
export const EPOCH_MS_MIN = 0;

/** Minimum valid resting or active heart rate in beats per minute. */
export const BPM_MIN = 25;

/** Maximum valid heart rate in beats per minute. */
export const BPM_MAX = 240;

/** Minimum valid CMF PPG stress score. */
export const STRESS_SCORE_MIN = 1;

/** Maximum valid CMF PPG stress score. */
export const STRESS_SCORE_MAX = 99;

/** Minimum valid blood oxygen saturation percent. */
export const SPO2_MIN = 70;

/** Maximum valid blood oxygen saturation percent. */
export const SPO2_MAX = 100;

/** Minimum valid logarithmic day strain. */
export const STRAIN_SCORE_MIN = 0;

/** Maximum valid logarithmic day strain. */
export const STRAIN_SCORE_MAX = 21;

/** Minimum valid recovery / readiness percent. */
export const RECOVERY_MIN = 1;

/** Maximum valid recovery / readiness percent. */
export const RECOVERY_MAX = 99;

/** Minimum valid eHRV millisecond proxy. */
export const MILLISECONDS_MIN = 15;

/** Maximum valid eHRV millisecond proxy. */
export const MILLISECONDS_MAX = 180;

export const EpochMsSchema = z.number().int().min(EPOCH_MS_MIN).brand<'EpochMs'>();

/** UTC timestamp in milliseconds since the Unix epoch. */
export type EpochMs = z.output<typeof EpochMsSchema>;

export const BpmSchema = z.number().int().min(BPM_MIN).max(BPM_MAX).brand<'Bpm'>();

/** Heart rate in beats per minute. Valid range: 25..240. */
export type Bpm = z.output<typeof BpmSchema>;

export const StressScoreSchema = z
  .number()
  .int()
  .min(STRESS_SCORE_MIN)
  .max(STRESS_SCORE_MAX)
  .brand<'StressScore'>();

/** CMF PPG stress score. Valid range: 1..99. */
export type StressScore = z.output<typeof StressScoreSchema>;

export const SpO2PercentSchema = z
  .number()
  .int()
  .min(SPO2_MIN)
  .max(SPO2_MAX)
  .brand<'SpO2Percent'>();

/** Blood oxygen saturation percent. Valid range: 70..100. */
export type SpO2Percent = z.output<typeof SpO2PercentSchema>;

export const StrainScoreSchema = z
  .number()
  .min(STRAIN_SCORE_MIN)
  .max(STRAIN_SCORE_MAX)
  .brand<'StrainScore'>();

/** Whoop-style logarithmic day strain. Valid range: 0.0..21.0. */
export type StrainScore = z.output<typeof StrainScoreSchema>;

export const RecoveryPercentSchema = z
  .number()
  .int()
  .min(RECOVERY_MIN)
  .max(RECOVERY_MAX)
  .brand<'RecoveryPercent'>();

/** Readiness / recovery percent. Valid range: 1..99. */
export type RecoveryPercent = z.output<typeof RecoveryPercentSchema>;

export const MillisecondsSchema = z
  .number()
  .int()
  .min(MILLISECONDS_MIN)
  .max(MILLISECONDS_MAX)
  .brand<'Milliseconds'>();

/** Millisecond physiological proxy (eHRV). Valid range: 15..180. */
export type Milliseconds = z.output<typeof MillisecondsSchema>;

function makeBranded<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
): Result<z.output<S>, string> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join('; ');
    return err(detail);
  }
  return ok(parsed.data);
}

/** Validate an unknown value into an {@link EpochMs}, returning a {@link Result}. */
export function makeEpochMs(value: unknown): Result<EpochMs, string> {
  return makeBranded(EpochMsSchema, value);
}

/** Validate an unknown value into a {@link Bpm}, returning a {@link Result}. */
export function makeBpm(value: unknown): Result<Bpm, string> {
  return makeBranded(BpmSchema, value);
}

/** Validate an unknown value into a {@link StressScore}, returning a {@link Result}. */
export function makeStressScore(value: unknown): Result<StressScore, string> {
  return makeBranded(StressScoreSchema, value);
}

/** Validate an unknown value into an {@link SpO2Percent}, returning a {@link Result}. */
export function makeSpO2Percent(value: unknown): Result<SpO2Percent, string> {
  return makeBranded(SpO2PercentSchema, value);
}

/** Validate an unknown value into a {@link StrainScore}, returning a {@link Result}. */
export function makeStrainScore(value: unknown): Result<StrainScore, string> {
  return makeBranded(StrainScoreSchema, value);
}

/** Validate an unknown value into a {@link RecoveryPercent}, returning a {@link Result}. */
export function makeRecoveryPercent(value: unknown): Result<RecoveryPercent, string> {
  return makeBranded(RecoveryPercentSchema, value);
}

/** Validate an unknown value into {@link Milliseconds}, returning a {@link Result}. */
export function makeMilliseconds(value: unknown): Result<Milliseconds, string> {
  return makeBranded(MillisecondsSchema, value);
}
