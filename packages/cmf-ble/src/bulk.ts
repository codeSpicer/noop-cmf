/**
 * Bulk-data channel parser and two-way recovery notification builder.
 *
 * Record layout (little-endian):
 *   u8 kind | u64 epochMs | payload...
 * Kind 1 (HR): u16 bpm. Kind 2 (stress): u8 score. Kind 3 (SpO2): u8 pct.
 * Kind 4 (sleep segment): u64 end + u8 stage (0 awake, 1 light, 2 deep, 3 rem).
 * Kind 5 (workout): u64 end + u8 activityLen + utf8 activity + u16 avgHr + u32 calories.
 */
import { ok, err, type Result } from '@noop-cmf/types';
import type {
  EpochMs,
  HrSample,
  RecoveryNotificationInput,
  SleepSegment,
  Spo2Sample,
  StressSample,
  Workout,
} from '@noop-cmf/types';

/** Bulk record kind: heart-rate sample. */
export const KIND_HR = 1;

/** Bulk record kind: stress sample. */
export const KIND_STRESS = 2;

/** Bulk record kind: SpO2 sample. */
export const KIND_SPO2 = 3;

/** Bulk record kind: sleep segment. */
export const KIND_SLEEP = 4;

/** Bulk record kind: workout. */
export const KIND_WORKOUT = 5;

/** Fixed prefix length: u8 kind + u64 epochMs. */
export const RECORD_PREFIX_BYTES = 9;

/** Stage byte for 'awake'. */
export const STAGE_AWAKE = 0;

/** Stage byte for 'light'. */
export const STAGE_LIGHT = 1;

/** Stage byte for 'deep'. */
export const STAGE_DEEP = 2;

/** Stage byte for 'rem'. */
export const STAGE_REM = 3;

/** Text encoding for workout activity labels. */
export const ACTIVITY_ENCODING = 'utf-8';

/** Parsed bulk-download payload. */
export interface BulkData {
  readonly hrSamples: HrSample[];
  readonly stressSamples: StressSample[];
  readonly spo2Samples: Spo2Sample[];
  readonly sleepSegments: SleepSegment[];
  readonly workouts: Workout[];
}

/**
 * Parse a concatenated bulk-download buffer into canonical samples.
 */
export function parseBulkData(data: Uint8Array): Result<BulkData, string> {
  const bulk: BulkData = {
    hrSamples: [],
    stressSamples: [],
    spo2Samples: [],
    sleepSegments: [],
    workouts: [],
  };
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  while (offset < data.length) {
    const step = parseRecord(view, data, offset, bulk);
    if (!step.ok) {
      return step;
    }
    offset = step.value;
  }
  return ok(bulk);
}

function parseRecord(
  view: DataView,
  data: Uint8Array,
  offset: number,
  bulk: BulkData,
): Result<number, string> {
  if (offset + RECORD_PREFIX_BYTES > data.length) {
    return err(`Truncated record header at offset ${String(offset)}`);
  }
  const kind = view.getUint8(offset);
  const timestamp = Number(view.getBigUint64(offset + 1, true)) as EpochMs;
  switch (kind) {
    case KIND_HR: {
      if (offset + RECORD_PREFIX_BYTES + 2 > data.length) {
        return err(`Truncated HR record at offset ${String(offset)}`);
      }
      bulk.hrSamples.push({
        timestamp,
        bpm: view.getUint16(offset + RECORD_PREFIX_BYTES, true) as HrSample['bpm'],
      });
      return ok(offset + RECORD_PREFIX_BYTES + 2);
    }
    case KIND_STRESS: {
      if (offset + RECORD_PREFIX_BYTES + 1 > data.length) {
        return err(`Truncated stress record at offset ${String(offset)}`);
      }
      bulk.stressSamples.push({
        timestamp,
        stress: view.getUint8(offset + RECORD_PREFIX_BYTES) as StressSample['stress'],
      });
      return ok(offset + RECORD_PREFIX_BYTES + 1);
    }
    case KIND_SPO2: {
      if (offset + RECORD_PREFIX_BYTES + 1 > data.length) {
        return err(`Truncated SpO2 record at offset ${String(offset)}`);
      }
      bulk.spo2Samples.push({
        timestamp,
        spo2: view.getUint8(offset + RECORD_PREFIX_BYTES) as Spo2Sample['spo2'],
      });
      return ok(offset + RECORD_PREFIX_BYTES + 1);
    }
    case KIND_SLEEP: {
      if (offset + RECORD_PREFIX_BYTES + 9 > data.length) {
        return err(`Truncated sleep record at offset ${String(offset)}`);
      }
      const end = Number(view.getBigUint64(offset + RECORD_PREFIX_BYTES, true)) as EpochMs;
      const stageByte = view.getUint8(offset + RECORD_PREFIX_BYTES + 8);
      const stage = decodeStage(stageByte);
      if (!stage) {
        return err(`Unknown sleep stage ${String(stageByte)} at offset ${String(offset)}`);
      }
      bulk.sleepSegments.push({ start: timestamp, end, stage });
      return ok(offset + RECORD_PREFIX_BYTES + 9);
    }
    case KIND_WORKOUT: {
      return parseWorkoutRecord(view, data, offset, timestamp, bulk);
    }
    default:
      return err(`Unknown record kind ${String(kind)} at offset ${String(offset)}`);
  }
}

function parseWorkoutRecord(
  view: DataView,
  data: Uint8Array,
  offset: number,
  start: EpochMs,
  bulk: BulkData,
): Result<number, string> {
  if (offset + RECORD_PREFIX_BYTES + 8 + 1 > data.length) {
    return err(`Truncated workout record at offset ${String(offset)}`);
  }
  const end = Number(view.getBigUint64(offset + RECORD_PREFIX_BYTES, true)) as EpochMs;
  const labelLen = view.getUint8(offset + RECORD_PREFIX_BYTES + 8);
  const labelStart = offset + RECORD_PREFIX_BYTES + 9;
  const fixedTail = 2 + 4;
  if (labelStart + labelLen + fixedTail > data.length) {
    return err(`Truncated workout label at offset ${String(offset)}`);
  }
  const activityType = new TextDecoder(ACTIVITY_ENCODING).decode(
    data.slice(labelStart, labelStart + labelLen),
  );
  if (activityType.length === 0) {
    return err(`Empty workout activity at offset ${String(offset)}`);
  }
  const averageHeartRate = view.getUint16(
    labelStart + labelLen,
    true,
  ) as Workout['averageHeartRate'];
  const calories = view.getUint32(labelStart + labelLen + 2, true);
  bulk.workouts.push({
    id: `ble-${String(start)}-${String(labelStart)}`,
    start,
    end,
    activityType,
    averageHeartRate,
    calories,
  });
  return ok(labelStart + labelLen + fixedTail);
}

function decodeStage(byte: number): SleepSegment['stage'] | undefined {
  switch (byte) {
    case STAGE_AWAKE:
      return 'awake';
    case STAGE_LIGHT:
      return 'light';
    case STAGE_DEEP:
      return 'deep';
    case STAGE_REM:
      return 'rem';
    default:
      return undefined;
  }
}

/** Magic prefix for recovery push notifications. */
export const RECOVERY_NOTIFICATION_MAGIC = 'RCV1';

/** Recovery notification wire length: 4 magic + 1 recovery + 2 ehrv + 2 strain. */
export const RECOVERY_NOTIFICATION_BYTES = 9;

/**
 * Build the 9-byte morning payload pushed back to the watch display:
 * ASCII `RCV1` + u8 recovery + u16 ehrv + u16 strain*10 (little-endian).
 */
export function formatRecoveryWatchNotification(
  input: RecoveryNotificationInput,
): Result<Uint8Array, string> {
  const out = new Uint8Array(RECOVERY_NOTIFICATION_BYTES);
  const view = new DataView(out.buffer);
  for (let i = 0; i < RECOVERY_NOTIFICATION_MAGIC.length; i += 1) {
    view.setUint8(i, RECOVERY_NOTIFICATION_MAGIC.charCodeAt(i));
  }
  view.setUint8(4, input.recovery);
  view.setUint16(5, input.ehrv, true);
  view.setUint16(7, Math.round(input.strainTarget * 10), true);
  return ok(out);
}

/**
 * Decode a recovery notification built by {@link formatRecoveryWatchNotification}.
 */
export function parseRecoveryWatchNotification(
  data: Uint8Array,
): Result<RecoveryNotificationInput, string> {
  if (data.length !== RECOVERY_NOTIFICATION_BYTES) {
    return err(`Recovery notification must be ${String(RECOVERY_NOTIFICATION_BYTES)} bytes`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < RECOVERY_NOTIFICATION_MAGIC.length; i += 1) {
    if (view.getUint8(i) !== RECOVERY_NOTIFICATION_MAGIC.charCodeAt(i)) {
      return err('Bad recovery notification magic');
    }
  }
  return ok({
    recovery: view.getUint8(4) as RecoveryNotificationInput['recovery'],
    ehrv: view.getUint16(5, true) as RecoveryNotificationInput['ehrv'],
    strainTarget: (view.getUint16(7, true) / 10) as RecoveryNotificationInput['strainTarget'],
  });
}
