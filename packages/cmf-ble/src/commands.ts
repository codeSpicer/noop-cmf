/**
 * CMF command table: the `(cmd1, cmd2)` opcode pairs from Gadgetbridge's
 * `CmfCommand.java` (GPL-3.0), in declaration order.
 *
 * `0xffff` cmd1 values are wildcard "phase" markers reused across the
 * confirm/fetch flows. Entries at the bottom marked `UNKNOWN_*` were observed
 * in the 2026-10-23 HCI capture but are not yet in Gadgetbridge's enum.
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

export const ACTIVITY_DATA = def('ACTIVITY_DATA', 0x0056, 0x0001);
export const ACTIVITY_FETCH_1 = def('ACTIVITY_FETCH_1', 0xffff, 0x8005);
export const ACTIVITY_FETCH_2 = def('ACTIVITY_FETCH_2', 0xffff, 0x9057);
export const ACTIVITY_FETCH_ACK_1 = def('ACTIVITY_FETCH_ACK_1', 0xffff, 0x0005);
export const ACTIVITY_FETCH_ACK_2 = def('ACTIVITY_FETCH_ACK_2', 0xffff, 0xa057);
export const ALARMS_GET = def('ALARMS_GET', 0x0063, 0x0002);
export const ALARMS_SET = def('ALARMS_SET', 0x0063, 0x0001);
export const APP_NOTIFICATION = def('APP_NOTIFICATION', 0x0065, 0x0001);
export const AUTH_NONCE_REPLY = def('AUTH_NONCE_REPLY', 0xffff, 0x004c);
export const AUTH_NONCE_REQUEST = def('AUTH_NONCE_REQUEST', 0xffff, 0x804b);
export const AUTH_PAIR_REPLY = def('AUTH_PAIR_REPLY', 0xffff, 0x0048);
export const AUTH_PAIR_REQUEST = def('AUTH_PAIR_REQUEST', 0xffff, 0x8047);
export const AUTH_PHONE_NAME = def('AUTH_PHONE_NAME', 0xffff, 0x8049);
export const AUTH_WATCH_MAC = def('AUTH_WATCH_MAC', 0xffff, 0x0049);
export const AUTH_FAILED = def('AUTH_FAILED', 0xffff, 0xa061);
export const AUTHENTICATED_CONFIRM_REPLY = def('AUTHENTICATED_CONFIRM_REPLY', 0xffff, 0x0004);
export const AUTHENTICATED_CONFIRM_REQUEST = def('AUTHENTICATED_CONFIRM_REQUEST', 0xffff, 0x804d);
export const BATTERY = def('BATTERY', 0x005c, 0x0001);
export const CALL_REMINDER_REQUEST = def('CALL_REMINDER_REQUEST', 0xffff, 0x9066);
export const CALL_REMINDER_RESPONSE = def('CALL_REMINDER_RESPONSE', 0xffff, 0xa066);
export const CONTACTS_GET = def('CONTACTS_GET', 0x00d5, 0x0002);
export const CONTACTS_SET = def('CONTACTS_SET', 0x00d5, 0x0001);
export const DATA_CHUNK_REQUEST_AGPS = def('DATA_CHUNK_REQUEST_AGPS', 0xffff, 0xa05f);
export const DATA_CHUNK_REQUEST_FIRMWARE = def('DATA_CHUNK_REQUEST_FIRMWARE', 0xffff, 0xa042);
export const DATA_CHUNK_REQUEST_WATCHFACE = def('DATA_CHUNK_REQUEST_WATCHFACE', 0xffff, 0xa064);
export const DATA_CHUNK_WRITE_AGPS = def('DATA_CHUNK_WRITE_AGPS', 0xffff, 0x905f);
export const DATA_CHUNK_WRITE_FIRMWARE = def('DATA_CHUNK_WRITE_FIRMWARE', 0xffff, 0x9042);
export const DATA_CHUNK_WRITE_WATCHFACE = def('DATA_CHUNK_WRITE_WATCHFACE', 0xffff, 0x9064);
export const DATA_TRANSFER_AGPS_FINISH_ACK_1 = def('DATA_TRANSFER_AGPS_FINISH_ACK_1', 0xffff, 0xa060);
export const DATA_TRANSFER_AGPS_FINISH_ACK_2 = def('DATA_TRANSFER_AGPS_FINISH_ACK_2', 0xffff, 0x9060);
export const DATA_TRANSFER_AGPS_INIT_REPLY = def('DATA_TRANSFER_AGPS_INIT_REPLY', 0xffff, 0xa05e);
export const DATA_TRANSFER_AGPS_INIT_REQUEST = def('DATA_TRANSFER_AGPS_INIT_REQUEST', 0xffff, 0x905e);
export const DATA_TRANSFER_FIRMWARE_INIT_1_REQUEST = def('DATA_TRANSFER_FIRMWARE_INIT_1_REQUEST', 0xffff, 0x9052);
export const DATA_TRANSFER_FIRMWARE_INIT_1_REPLY = def('DATA_TRANSFER_FIRMWARE_INIT_1_REPLY', 0xffff, 0xa052);
export const DATA_TRANSFER_FIRMWARE_INIT_2_REQUEST = def('DATA_TRANSFER_FIRMWARE_INIT_2_REQUEST', 0xffff, 0x9040);
export const DATA_TRANSFER_FIRMWARE_INIT_2_REPLY = def('DATA_TRANSFER_FIRMWARE_INIT_2_REPLY', 0xffff, 0xa040);
export const DATA_TRANSFER_FIRMWARE_FINISH_ACK_1 = def('DATA_TRANSFER_FIRMWARE_FINISH_ACK_1', 0xffff, 0xa041);
export const DATA_TRANSFER_FIRMWARE_FINISH_ACK_2 = def('DATA_TRANSFER_FIRMWARE_FINISH_ACK_2', 0xffff, 0x9041);
export const DATA_TRANSFER_WATCHFACE_FINISH_ACK_1 = def('DATA_TRANSFER_WATCHFACE_FINISH_ACK_1', 0xffff, 0xa065);
export const DATA_TRANSFER_WATCHFACE_FINISH_ACK_2 = def('DATA_TRANSFER_WATCHFACE_FINISH_ACK_2', 0xffff, 0x9065);
export const DATA_TRANSFER_WATCHFACE_INIT_1_REQUEST = def('DATA_TRANSFER_WATCHFACE_INIT_1_REQUEST', 0xffff, 0x8052);
export const DATA_TRANSFER_WATCHFACE_INIT_1_REPLY = def('DATA_TRANSFER_WATCHFACE_INIT_1_REPLY', 0xffff, 0x0052);
export const DATA_TRANSFER_WATCHFACE_INIT_2_REPLY = def('DATA_TRANSFER_WATCHFACE_INIT_2_REPLY', 0xffff, 0xa063);
export const DATA_TRANSFER_WATCHFACE_INIT_2_REQUEST = def('DATA_TRANSFER_WATCHFACE_INIT_2_REQUEST', 0xffff, 0x9063);
export const DO_NOT_DISTURB = def('DO_NOT_DISTURB', 0x0099, 0x0001);
export const FACTORY_RESET = def('FACTORY_RESET', 0x009a, 0x0001);
export const FIND_PHONE = def('FIND_PHONE', 0x005b, 0x0001);
export const FIND_WATCH = def('FIND_WATCH', 0x005d, 0x0001);
export const FIRMWARE_VERSION_GET = def('FIRMWARE_VERSION_GET', 0xffff, 0x8006);
export const FIRMWARE_VERSION_RET = def('FIRMWARE_VERSION_RET', 0xffff, 0x0006);
export const GOALS_SET = def('GOALS_SET', 0x005e, 0x0001);
export const GPS_COORDS = def('GPS_COORDS', 0xffff, 0x906a);
export const HEART_MONITORING_ALERTS = def('HEART_MONITORING_ALERTS', 0xffff, 0x9059);
export const HEART_MONITORING_ENABLED_GET = def('HEART_MONITORING_ENABLED_GET', 0x009b, 0x0002);
export const HEART_MONITORING_ENABLED_SET = def('HEART_MONITORING_ENABLED_SET', 0x009b, 0x0001);
export const HEART_RATE_RESTING = def('HEART_RATE_RESTING', 0x00da, 0x0001);
export const HEART_RATE_MANUAL_AUTO = def('HEART_RATE_MANUAL_AUTO', 0x0053, 0x0001);
export const HEART_RATE_WORKOUT = def('HEART_RATE_WORKOUT', 0x00e0, 0x0001);
export const LANGUAGE_RET = def('LANGUAGE_RET', 0xffff, 0xa06b);
export const LANGUAGE_SET = def('LANGUAGE_SET', 0xffff, 0x9058);
export const MUSIC_BUTTON = def('MUSIC_BUTTON', 0xffff, 0xa05d);
export const MUSIC_INFO_ACK = def('MUSIC_INFO_ACK', 0xffff, 0xa05c);
export const MUSIC_INFO_SET = def('MUSIC_INFO_SET', 0xffff, 0x905c);
export const SERIAL_NUMBER_GET = def('SERIAL_NUMBER_GET', 0x00de, 0x0002);
export const SERIAL_NUMBER_RET = def('SERIAL_NUMBER_RET', 0x00de, 0x0001);
export const SLEEP_DATA = def('SLEEP_DATA', 0x0058, 0x0001);
export const SPO2 = def('SPO2', 0x0055, 0x0001);
export const SPORTS_SET = def('SPORTS_SET', 0x00dc, 0x0001);
export const STANDING_REMINDER_GET = def('STANDING_REMINDER_GET', 0x0060, 0x0002);
export const STANDING_REMINDER_SET = def('STANDING_REMINDER_SET', 0x0060, 0x0001);
export const STRESS = def('STRESS', 0x009d, 0x0001);
export const TIME_FORMAT = def('TIME_FORMAT', 0x005f, 0x0001);
export const TIME = def('TIME', 0xffff, 0x8004);
export const TRIGGER_SYNC = def('TRIGGER_SYNC', 0x005c, 0x0002);
export const UNIT_LENGTH = def('UNIT_LENGTH', 0xffff, 0x9067);
export const UNIT_TEMPERATURE = def('UNIT_TEMPERATURE', 0xffff, 0x9068);
export const WAKE_ON_WRIST_RAISE = def('WAKE_ON_WRIST_RAISE', 0x0062, 0x0001);
export const WATCHFACE = def('WATCHFACE', 0x009f, 0x0001);
export const WATER_REMINDER_GET = def('WATER_REMINDER_GET', 0x0061, 0x0002);
export const WATER_REMINDER_SET = def('WATER_REMINDER_SET', 0x0061, 0x0001);
export const WEATHER_SET_1 = def('WEATHER_SET_1', 0xffff, 0x906b);
export const WEATHER_SET_2 = def('WEATHER_SET_2', 0x0066, 0x0001);
export const WORKOUT_GPS = def('WORKOUT_GPS', 0xffff, 0xa05a);
export const WORKOUT_SUMMARY = def('WORKOUT_SUMMARY', 0x0057, 0x0001);
export const WORKOUT_SUMMARY_V3 = def('WORKOUT_SUMMARY_V3', 0x0160, 0x0001);

// ---------------------------------------------------------------------------
// Opcodes observed in the live HCI capture but absent from CmfCommand.java.
// Names are provisional; confirmed against a fresh capture in Phase 9.
// ---------------------------------------------------------------------------

export const UNKNOWN_005E_0003 = def('UNKNOWN_005E_0003', 0x005e, 0x0003);
export const UNKNOWN_005F_0003 = def('UNKNOWN_005F_0003', 0x005f, 0x0003);
export const UNKNOWN_0060_0003 = def('UNKNOWN_0060_0003', 0x0060, 0x0003);
export const UNKNOWN_0061_0003 = def('UNKNOWN_0061_0003', 0x0061, 0x0003);
export const UNKNOWN_0062_0003 = def('UNKNOWN_0062_0003', 0x0062, 0x0003);
export const UNKNOWN_009B_0003 = def('UNKNOWN_009B_0003', 0x009b, 0x0003);
export const UNKNOWN_00DC_0003 = def('UNKNOWN_00DC_0003', 0x00dc, 0x0003);
export const UNKNOWN_A055 = def('UNKNOWN_A055', 0xffff, 0xa055);
export const UNKNOWN_A059 = def('UNKNOWN_A059', 0xffff, 0xa059);
export const UNKNOWN_A062 = def('UNKNOWN_A062', 0xffff, 0xa062);
export const UNKNOWN_A067 = def('UNKNOWN_A067', 0xffff, 0xa067);
export const UNKNOWN_A068 = def('UNKNOWN_A068', 0xffff, 0xa068);
export const UNKNOWN_0051 = def('UNKNOWN_0051', 0xffff, 0x0051);

/** All known commands, in declaration order. */
export const ALL_COMMANDS: readonly CmfCommandDef[] = [
  ACTIVITY_DATA,
  ACTIVITY_FETCH_1,
  ACTIVITY_FETCH_2,
  ACTIVITY_FETCH_ACK_1,
  ACTIVITY_FETCH_ACK_2,
  ALARMS_GET,
  ALARMS_SET,
  APP_NOTIFICATION,
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
  CALL_REMINDER_REQUEST,
  CALL_REMINDER_RESPONSE,
  CONTACTS_GET,
  CONTACTS_SET,
  DATA_CHUNK_REQUEST_AGPS,
  DATA_CHUNK_REQUEST_FIRMWARE,
  DATA_CHUNK_REQUEST_WATCHFACE,
  DATA_CHUNK_WRITE_AGPS,
  DATA_CHUNK_WRITE_FIRMWARE,
  DATA_CHUNK_WRITE_WATCHFACE,
  DATA_TRANSFER_AGPS_FINISH_ACK_1,
  DATA_TRANSFER_AGPS_FINISH_ACK_2,
  DATA_TRANSFER_AGPS_INIT_REPLY,
  DATA_TRANSFER_AGPS_INIT_REQUEST,
  DATA_TRANSFER_FIRMWARE_INIT_1_REQUEST,
  DATA_TRANSFER_FIRMWARE_INIT_1_REPLY,
  DATA_TRANSFER_FIRMWARE_INIT_2_REQUEST,
  DATA_TRANSFER_FIRMWARE_INIT_2_REPLY,
  DATA_TRANSFER_FIRMWARE_FINISH_ACK_1,
  DATA_TRANSFER_FIRMWARE_FINISH_ACK_2,
  DATA_TRANSFER_WATCHFACE_FINISH_ACK_1,
  DATA_TRANSFER_WATCHFACE_FINISH_ACK_2,
  DATA_TRANSFER_WATCHFACE_INIT_1_REQUEST,
  DATA_TRANSFER_WATCHFACE_INIT_1_REPLY,
  DATA_TRANSFER_WATCHFACE_INIT_2_REPLY,
  DATA_TRANSFER_WATCHFACE_INIT_2_REQUEST,
  DO_NOT_DISTURB,
  FACTORY_RESET,
  FIND_PHONE,
  FIND_WATCH,
  FIRMWARE_VERSION_GET,
  FIRMWARE_VERSION_RET,
  GOALS_SET,
  GPS_COORDS,
  HEART_MONITORING_ALERTS,
  HEART_MONITORING_ENABLED_GET,
  HEART_MONITORING_ENABLED_SET,
  HEART_RATE_RESTING,
  HEART_RATE_MANUAL_AUTO,
  HEART_RATE_WORKOUT,
  LANGUAGE_RET,
  LANGUAGE_SET,
  MUSIC_BUTTON,
  MUSIC_INFO_ACK,
  MUSIC_INFO_SET,
  SERIAL_NUMBER_GET,
  SERIAL_NUMBER_RET,
  SLEEP_DATA,
  SPO2,
  SPORTS_SET,
  STANDING_REMINDER_GET,
  STANDING_REMINDER_SET,
  STRESS,
  TIME_FORMAT,
  TIME,
  TRIGGER_SYNC,
  UNIT_LENGTH,
  UNIT_TEMPERATURE,
  WAKE_ON_WRIST_RAISE,
  WATCHFACE,
  WATER_REMINDER_GET,
  WATER_REMINDER_SET,
  WEATHER_SET_1,
  WEATHER_SET_2,
  WORKOUT_GPS,
  WORKOUT_SUMMARY,
  WORKOUT_SUMMARY_V3,
  UNKNOWN_005E_0003,
  UNKNOWN_005F_0003,
  UNKNOWN_0060_0003,
  UNKNOWN_0061_0003,
  UNKNOWN_0062_0003,
  UNKNOWN_009B_0003,
  UNKNOWN_00DC_0003,
  UNKNOWN_A055,
  UNKNOWN_A059,
  UNKNOWN_A062,
  UNKNOWN_A067,
  UNKNOWN_A068,
  UNKNOWN_0051,
];

/**
 * Commands sent in plaintext (no AES): the pairing handshake plus the AGPS,
 * firmware, and watchface chunk writes.
 */
const PLAINTEXT_NAMES = new Set([
  'AUTH_PAIR_REQUEST',
  'AUTH_PAIR_REPLY',
  'DATA_CHUNK_WRITE_AGPS',
  'DATA_CHUNK_WRITE_FIRMWARE',
  'DATA_CHUNK_WRITE_WATCHFACE',
]);

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
