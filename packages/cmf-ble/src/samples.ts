/**
 * Pure CMF sample helpers shared by the SQLite import path and the live
 * on-wire decoders.
 *
 * Deliberately free of `sql.js` so the live-BLE browser bundle does not pull
 * the SQLite engine in just to decode a few samples.
 */
import { EpochMsSchema, type EpochMs, type SleepStage } from '@noop-cmf/types';

/** Milliseconds per second. */
export const MS_PER_SECOND = 1000;

/** Milliseconds per minute. */
export const MS_PER_MINUTE = 60_000;

/** CMF sleep stage byte for deep sleep. */
export const CMF_STAGE_DEEP = 1;

/** CMF sleep stage byte for light sleep. */
export const CMF_STAGE_LIGHT = 2;

/** CMF sleep stage byte for REM sleep. */
export const CMF_STAGE_REM = 3;

/** CMF sleep stage byte for awake during the night. */
export const CMF_STAGE_AWAKE = 4;

/** Millisecond timestamp value → {@link EpochMs}. */
export function toEpochMs(value: unknown): EpochMs | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  const parsed = EpochMsSchema.safeParse(Math.round(value));
  return parsed.success ? parsed.data : undefined;
}

/** Second timestamp value → {@link EpochMs}. */
export function toEpochMsSeconds(value: unknown): EpochMs | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return toEpochMs(Math.round(value) * MS_PER_SECOND);
}

/**
 * CMF sleep stage byte → canonical stage.
 * From Gadgetbridge `CmfActivitySampleProvider.sleepStageToActivityKind`:
 * 1 → deep, 2 → light, 3 → rem, 4 → awake, everything else unknown.
 */
export function decodeCmfStage(value: unknown): SleepStage | undefined {
  if (value === CMF_STAGE_DEEP) {
    return 'deep';
  }
  if (value === CMF_STAGE_LIGHT) {
    return 'light';
  }
  if (value === CMF_STAGE_REM) {
    return 'rem';
  }
  if (value === CMF_STAGE_AWAKE) {
    return 'awake';
  }
  return undefined;
}
