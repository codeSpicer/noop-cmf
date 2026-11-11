/**
 * On-wire CMF sample decoders.
 *
 * Formats ported from Gadgetbridge's `CmfActivitySync` (GPL-3.0). Every
 * integer field is LITTLE-ENDIAN and timestamps from the watch are in seconds.
 * Out-of-range or unknown records are dropped, matching the SQLite import path.
 */
import {
  BpmSchema,
  SpO2PercentSchema,
  StressScoreSchema,
  err,
  ok,
  type EpochMs,
  type HrSample,
  type Result,
  type SleepSegment,
  type Spo2Sample,
  type StressSample,
  type Workout,
} from '@noop-cmf/types';
import { MS_PER_SECOND, decodeCmfStage, toEpochMsSeconds } from './samples.js';

/** Fixed record stride, in bytes, for each on-wire stream. */
export const ACTIVITY_RECORD_BYTES = 32;
export const HR_RECORD_BYTES = 8;
export const STRESS_RECORD_BYTES = 8;
export const SPO2_RECORD_BYTES = 8;
export const SLEEP_HEADER_BYTES = 18;
export const SLEEP_STAGE_RECORD_BYTES = 8;
export const WORKOUT_GPS_RECORD_BYTES = 12;

/** One `ACTIVITY_DATA` record: step totals for a 1-minute bucket. */
export interface ActivityRecord {
  readonly timestamp: EpochMs;
  readonly steps: number;
  readonly distance: number;
  readonly calories: number;
}

/** One `WORKOUT_GPS` record. Coordinates are raw signed integers. */
export interface WorkoutGpsRecord {
  readonly timestamp: EpochMs;
  readonly longitude: number;
  readonly latitude: number;
}

/** Decoded `SLEEP_DATA` payload: session bounds plus ordered stage segments. */
export interface SleepData {
  readonly start: EpochMs;
  readonly wakeup: EpochMs;
  readonly segments: SleepSegment[];
}

function view(payload: Uint8Array): DataView {
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
}

function strideError(name: string, length: number, stride: number): string {
  return `${name} payload size ${String(length)} is not a multiple of ${String(stride)}`;
}

/** `ACTIVITY_DATA`: `[ts:s, steps, distance, calories, 16 unknown]` per 32 bytes. */
export function decodeActivityData(payload: Uint8Array): Result<ActivityRecord[], string> {
  if (payload.length === 0 || payload.length % ACTIVITY_RECORD_BYTES !== 0) {
    return err(strideError('Activity', payload.length, ACTIVITY_RECORD_BYTES));
  }
  const data = view(payload);
  const out: ActivityRecord[] = [];
  for (let offset = 0; offset < payload.length; offset += ACTIVITY_RECORD_BYTES) {
    const timestamp = toEpochMsSeconds(data.getUint32(offset, true));
    if (timestamp === undefined) {
      continue;
    }
    out.push({
      timestamp,
      steps: data.getUint32(offset + 4, true),
      distance: data.getUint32(offset + 8, true),
      calories: data.getUint32(offset + 12, true),
    });
  }
  return ok(out);
}

/** Heart-rate stream: `[ts:s, bpm]` per 8 bytes. */
export function decodeHeartRate(payload: Uint8Array): Result<HrSample[], string> {
  if (payload.length === 0 || payload.length % HR_RECORD_BYTES !== 0) {
    return err(strideError('Heart rate', payload.length, HR_RECORD_BYTES));
  }
  const data = view(payload);
  const out: HrSample[] = [];
  for (let offset = 0; offset < payload.length; offset += HR_RECORD_BYTES) {
    const timestamp = toEpochMsSeconds(data.getUint32(offset, true));
    const bpm = BpmSchema.safeParse(data.getUint32(offset + 4, true));
    if (timestamp !== undefined && bpm.success) {
      out.push({ timestamp, bpm: bpm.data });
    }
  }
  return ok(out);
}

/** Stress stream: `[ts:s, stress]` per 8 bytes. */
export function decodeStress(payload: Uint8Array): Result<StressSample[], string> {
  if (payload.length === 0 || payload.length % STRESS_RECORD_BYTES !== 0) {
    return err(strideError('Stress', payload.length, STRESS_RECORD_BYTES));
  }
  const data = view(payload);
  const out: StressSample[] = [];
  for (let offset = 0; offset < payload.length; offset += STRESS_RECORD_BYTES) {
    const timestamp = toEpochMsSeconds(data.getUint32(offset, true));
    const stress = StressScoreSchema.safeParse(data.getUint32(offset + 4, true));
    if (timestamp !== undefined && stress.success) {
      out.push({ timestamp, stress: stress.data });
    }
  }
  return ok(out);
}

/** SpO2 stream: `[ts:s, spo2]` per 8 bytes. */
export function decodeSpo2(payload: Uint8Array): Result<Spo2Sample[], string> {
  if (payload.length === 0 || payload.length % SPO2_RECORD_BYTES !== 0) {
    return err(strideError('SpO2', payload.length, SPO2_RECORD_BYTES));
  }
  const data = view(payload);
  const out: Spo2Sample[] = [];
  for (let offset = 0; offset < payload.length; offset += SPO2_RECORD_BYTES) {
    const timestamp = toEpochMsSeconds(data.getUint32(offset, true));
    const spo2 = SpO2PercentSchema.safeParse(data.getUint32(offset + 4, true));
    if (timestamp !== undefined && spo2.success) {
      out.push({ timestamp, spo2: spo2.data });
    }
  }
  return ok(out);
}

/**
 * `SLEEP_DATA`: header `[sessionStart:s, wakeup:s, 10 metadata]`, then
 * `[ts:s, duration:s, stage]` per 8 bytes.
 */
export function decodeSleepData(payload: Uint8Array): Result<SleepData, string> {
  if (
    payload.length < SLEEP_HEADER_BYTES ||
    (payload.length - SLEEP_HEADER_BYTES) % SLEEP_STAGE_RECORD_BYTES !== 0
  ) {
    return err(`Sleep payload size ${String(payload.length)} is malformed`);
  }
  const data = view(payload);
  const start = toEpochMsSeconds(data.getUint32(0, true));
  const wakeup = toEpochMsSeconds(data.getUint32(4, true));
  if (start === undefined || wakeup === undefined) {
    return err('Sleep session timestamps out of range');
  }
  const segments: SleepSegment[] = [];
  for (let offset = SLEEP_HEADER_BYTES; offset < payload.length; offset += SLEEP_STAGE_RECORD_BYTES) {
    const segmentStart = toEpochMsSeconds(data.getUint32(offset, true));
    const durationSeconds = data.getInt16(offset + 4, true);
    const stage = decodeCmfStage(data.getInt16(offset + 6, true));
    if (segmentStart === undefined || stage === undefined || durationSeconds <= 0) {
      continue;
    }
    segments.push({
      start: segmentStart,
      end: (segmentStart + durationSeconds * MS_PER_SECOND) as EpochMs,
      stage,
    });
  }
  return ok({ start, wakeup, segments });
}

/** `WORKOUT_GPS`: `[ts:s, longitude, latitude]` per 12 bytes (raw integers). */
export function decodeWorkoutGps(payload: Uint8Array): Result<WorkoutGpsRecord[], string> {
  if (payload.length === 0 || payload.length % WORKOUT_GPS_RECORD_BYTES !== 0) {
    return err(strideError('Workout GPS', payload.length, WORKOUT_GPS_RECORD_BYTES));
  }
  const data = view(payload);
  const out: WorkoutGpsRecord[] = [];
  for (let offset = 0; offset < payload.length; offset += WORKOUT_GPS_RECORD_BYTES) {
    const timestamp = toEpochMsSeconds(data.getUint32(offset, true));
    if (timestamp === undefined) {
      continue;
    }
    out.push({
      timestamp,
      longitude: data.getInt32(offset + 4, true),
      latitude: data.getInt32(offset + 8, true),
    });
  }
  return ok(out);
}

/** Workout summary record stride (Watch Pro 1). */
export const WORKOUT_SUMMARY_RECORD_BYTES_PRO1 = 32;
/** Workout summary record stride (Watch Pro 2). */
export const WORKOUT_SUMMARY_RECORD_BYTES_PRO2 = 54;

const ACTIVITY_TYPE_NAMES: Record<number, string> = {
  0x01: 'outdoor walking',
  0x02: 'outdoor running',
  0x03: 'indoor running',
  0x04: 'mountain hike',
  0x05: 'outdoor cycling',
  0x06: 'jump rope',
  0x07: 'soccer',
  0x08: 'basketball',
  0x09: 'badminton',
  0x0a: 'table tennis',
  0x0b: 'cricket',
  0x0c: 'tennis',
  0x0d: 'dynamic cycle',
  0x0e: 'rower',
  0x0f: 'yoga',
  0x10: 'free training',
  0x13: 'strength training',
  0x18: 'cross trainer',
  0x19: 'indoor walking',
  0x1a: 'hiking',
  0x2e: 'other workout',
  0x72: 'indoor cycling',
};

export function activityTypeName(code: number): string {
  return ACTIVITY_TYPE_NAMES[code] ?? `activity ${String(code)}`;
}

/** `WORKOUT_SUMMARY`: N records of 32 (Pro 1) or 54 (Pro 2) bytes. */
export function decodeWorkoutSummary(payload: Uint8Array): Result<Workout[], string> {
  if (payload.length === 0) {
    return err('Workout summary payload is empty');
  }
  let stride = 0;
  if (payload.length % WORKOUT_SUMMARY_RECORD_BYTES_PRO2 === 0) {
    stride = WORKOUT_SUMMARY_RECORD_BYTES_PRO2;
  } else if (payload.length % WORKOUT_SUMMARY_RECORD_BYTES_PRO1 === 0) {
    stride = WORKOUT_SUMMARY_RECORD_BYTES_PRO1;
  } else {
    return err(`Workout summary payload size ${String(payload.length)} is malformed`);
  }
  const data = view(payload);
  const workouts: Workout[] = [];
  for (let offset = 0; offset < payload.length; offset += stride) {
    const start = toEpochMsSeconds(data.getUint32(offset, true));
    const typeCode = data.getUint8(offset + 6);
    const end = toEpochMsSeconds(data.getUint32(offset + 26, true));
    if (start === undefined || end === undefined || end <= start) {
      continue;
    }
    workouts.push({
      id: `${String(start)}-${String(end)}`,
      start,
      end,
      activityType: activityTypeName(typeCode),
    });
  }
  return ok(workouts);
}
