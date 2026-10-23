/**
 * CMF command table: (cmd1, cmd2) opcode pairs from Gadgetbridge's
 * `CmfCommand.java` (GPL-3.0). `0xFFFF` cmd1 values are wildcard "phase"
 * markers reused across confirm/fetch flows.
 *
 * Entries marked "provisional" below were observed in a live HCI snoop
 * capture (2026-10-23) and their (cmd1, cmd2) pairs are verified, but the
 * human-readable metric names still need confirmation against CmfCommand.java.
 */

/** Command name with its (cmd1, cmd2) opcode pair. */
export interface CmfCommandDef {
  readonly name: string;
  readonly cmd1: number;
  readonly cmd2: number;
}

function def(name: string, cmd1: number, cmd2: number): CmfCommandDef {
  return { name, cmd1, cmd2 };
}

/** Activity bulk-data response. */
export const ACTIVITY_DATA = def('ACTIVITY_DATA', 0x0056, 0x0001);

/** Recorded-data fetch, phase 1. */
export const ACTIVITY_FETCH_1 = def('ACTIVITY_FETCH_1', 0xffff, 0x8005);

/** Recorded-data fetch, phase 2. */
export const ACTIVITY_FETCH_2 = def('ACTIVITY_FETCH_2', 0xffff, 0x9057);

/** Recorded-data fetch acknowledgement, phase 1. */
export const ACTIVITY_FETCH_ACK_1 = def('ACTIVITY_FETCH_ACK_1', 0xffff, 0x0005);

/** Recorded-data fetch acknowledgement, phase 2. */
export const ACTIVITY_FETCH_ACK_2 = def('ACTIVITY_FETCH_ACK_2', 0xffff, 0xa057);

/** Pairing nonce reply. */
export const AUTH_NONCE_REPLY = def('AUTH_NONCE_REPLY', 0xffff, 0x004c);

/** Pairing nonce request. */
export const AUTH_NONCE_REQUEST = def('AUTH_NONCE_REQUEST', 0xffff, 0x804b);

/** Pairing reply carrying the signed challenge. */
export const AUTH_PAIR_REPLY = def('AUTH_PAIR_REPLY', 0xffff, 0x0048);

/** Pairing request carrying the watch random. */
export const AUTH_PAIR_REQUEST = def('AUTH_PAIR_REQUEST', 0xffff, 0x8047);

/** Phone model announcement during pairing. */
export const AUTH_PHONE_NAME = def('AUTH_PHONE_NAME', 0xffff, 0x8049);

/** Watch MAC announcement during pairing. */
export const AUTH_WATCH_MAC = def('AUTH_WATCH_MAC', 0xffff, 0x0049);

/** Authentication failure notice. */
export const AUTH_FAILED = def('AUTH_FAILED', 0xffff, 0xa061);

/** Authenticated-session confirm reply. */
export const AUTHENTICATED_CONFIRM_REPLY = def('AUTHENTICATED_CONFIRM_REPLY', 0xffff, 0x0004);

/** Authenticated-session confirm request. */
export const AUTHENTICATED_CONFIRM_REQUEST = def('AUTHENTICATED_CONFIRM_REQUEST', 0xffff, 0x804d);

/** Battery level report. */
export const BATTERY = def('BATTERY', 0x005c, 0x0001);

/** Firmware version query. */
export const FIRMWARE_VERSION_GET = def('FIRMWARE_VERSION_GET', 0xffff, 0x8006);

/** Firmware version response. */
export const FIRMWARE_VERSION_RET = def('FIRMWARE_VERSION_RET', 0xffff, 0x0006);

/** Serial number query. */
export const SERIAL_NUMBER_GET = def('SERIAL_NUMBER_GET', 0x00de, 0x0002);

/** Serial number response. */
export const SERIAL_NUMBER_RET = def('SERIAL_NUMBER_RET', 0x00de, 0x0001);

/** Sleep bulk-data response. */
export const SLEEP_DATA = def('SLEEP_DATA', 0x0058, 0x0001);

/** SpO2 bulk-data response. */
export const SPO2 = def('SPO2', 0x0055, 0x0001);

/** Stress bulk-data response. */
export const STRESS = def('STRESS', 0x009d, 0x0001);

/** Phone clock synchronisation. */
export const TIME = def('TIME', 0xffff, 0x8004);

/** Begin a recorded-data fetch. */
export const TRIGGER_SYNC = def('TRIGGER_SYNC', 0x005c, 0x0002);

/** GPS track chunk for a workout. */
export const WORKOUT_GPS = def('WORKOUT_GPS', 0xffff, 0xa05a);

/** Workout summary response. */
export const WORKOUT_SUMMARY = def('WORKOUT_SUMMARY', 0x0057, 0x0001);

// ---------------------------------------------------------------------------
// Provisional opcodes observed in the live HCI capture. Metric names pending.
// Pattern: phone writes (cmd1, 0x0001) to request data, watch notifies
// (cmd1, 0x0003) to return it. Some metrics are notify-only (cmd2 0x0001).
// ---------------------------------------------------------------------------

export const METRIC_009B_GET = def('METRIC_009B_GET', 0x009b, 0x0001);
export const METRIC_009B_RET = def('METRIC_009B_RET', 0x009b, 0x0003);
export const METRIC_005E_GET = def('METRIC_005E_GET', 0x005e, 0x0001);
export const METRIC_005E_RET = def('METRIC_005E_RET', 0x005e, 0x0003);
export const METRIC_005F_GET = def('METRIC_005F_GET', 0x005f, 0x0001);
export const METRIC_005F_RET = def('METRIC_005F_RET', 0x005f, 0x0003);
export const METRIC_0060_GET = def('METRIC_0060_GET', 0x0060, 0x0001);
export const METRIC_0060_RET = def('METRIC_0060_RET', 0x0060, 0x0003);
export const METRIC_0061_GET = def('METRIC_0061_GET', 0x0061, 0x0001);
export const METRIC_0061_RET = def('METRIC_0061_RET', 0x0061, 0x0003);
export const METRIC_0062_GET = def('METRIC_0062_GET', 0x0062, 0x0001);
export const METRIC_0062_RET = def('METRIC_0062_RET', 0x0062, 0x0003);
export const METRIC_00DC_GET = def('METRIC_00DC_GET', 0x00dc, 0x0001);
export const METRIC_00DC_RET = def('METRIC_00DC_RET', 0x00dc, 0x0003);
export const METRIC_0053 = def('METRIC_0053', 0x0053, 0x0001);
export const METRIC_00DA = def('METRIC_00DA', 0x00da, 0x0001);

export const PHASE_906A = def('PHASE_906A', 0xffff, 0x906a);
export const PHASE_9067 = def('PHASE_9067', 0xffff, 0x9067);
export const PHASE_9068 = def('PHASE_9068', 0xffff, 0x9068);
export const PHASE_9058 = def('PHASE_9058', 0xffff, 0x9058);
export const PHASE_9059 = def('PHASE_9059', 0xffff, 0x9059);
export const PHASE_9066 = def('PHASE_9066', 0xffff, 0x9066);
export const PHASE_A06B = def('PHASE_A06B', 0xffff, 0xa06b);
export const PHASE_A06A = def('PHASE_A06A', 0xffff, 0xa06a);
export const PHASE_A055 = def('PHASE_A055', 0xffff, 0xa055);
export const PHASE_A067 = def('PHASE_A067', 0xffff, 0xa067);
export const PHASE_A068 = def('PHASE_A068', 0xffff, 0xa068);
export const PHASE_A059 = def('PHASE_A059', 0xffff, 0xa059);
export const PHASE_A066 = def('PHASE_A066', 0xffff, 0xa066);
export const PHASE_0051 = def('PHASE_0051', 0xffff, 0x0051);
export const PHASE_A062 = def('PHASE_A062', 0xffff, 0xa062);

/** All known commands in declaration order. */
export const ALL_COMMANDS: readonly CmfCommandDef[] = [
  ACTIVITY_DATA,
  ACTIVITY_FETCH_1,
  ACTIVITY_FETCH_2,
  ACTIVITY_FETCH_ACK_1,
  ACTIVITY_FETCH_ACK_2,
  AUTH_NONCE_REPLY,
  AUTH_NONCE_REQUEST,
  AUTH_PAIR_REPLY,
  AUTH_PAIR_REQUEST,
  AUTH_PHONE_NAME,
  AUTH_WATCH_MAC,
  AUTH_FAILED,
  AUTHENTICATED_CONFIRM_REPLY,
  AUTHENTICATED_CONFIRM_REQUEST,
  BATTERY,
  FIRMWARE_VERSION_GET,
  FIRMWARE_VERSION_RET,
  SERIAL_NUMBER_GET,
  SERIAL_NUMBER_RET,
  SLEEP_DATA,
  SPO2,
  STRESS,
  TIME,
  TRIGGER_SYNC,
  WORKOUT_GPS,
  WORKOUT_SUMMARY,
  METRIC_009B_GET,
  METRIC_009B_RET,
  METRIC_005E_GET,
  METRIC_005E_RET,
  METRIC_005F_GET,
  METRIC_005F_RET,
  METRIC_0060_GET,
  METRIC_0060_RET,
  METRIC_0061_GET,
  METRIC_0061_RET,
  METRIC_0062_GET,
  METRIC_0062_RET,
  METRIC_00DC_GET,
  METRIC_00DC_RET,
  METRIC_0053,
  METRIC_00DA,
  PHASE_906A,
  PHASE_9067,
  PHASE_9068,
  PHASE_9058,
  PHASE_9059,
  PHASE_9066,
  PHASE_A06B,
  PHASE_A06A,
  PHASE_A055,
  PHASE_A067,
  PHASE_A068,
  PHASE_A059,
  PHASE_A066,
  PHASE_0051,
  PHASE_A062,
];

/**
 * Commands sent in plaintext (no AES): pairing handshake plus AGPS and
 * watchface chunk writes.
 */
const PLAINTEXT_NAMES = new Set(['AUTH_PAIR_REQUEST', 'AUTH_PAIR_REPLY']);

/**
 * True when `command` travels encrypted (AES-128-CBC + PKCS7).
 */
export function shouldEncrypt(name: string): boolean {
  return !PLAINTEXT_NAMES.has(name);
}

/**
 * Look up a command by its (cmd1, cmd2) opcode pair.
 */
export function commandFromCodes(cmd1: number, cmd2: number): CmfCommandDef | undefined {
  return ALL_COMMANDS.find((cmd) => cmd.cmd1 === cmd1 && cmd.cmd2 === cmd2);
}
