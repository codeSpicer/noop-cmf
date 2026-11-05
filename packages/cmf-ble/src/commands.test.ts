import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_FETCH_1,
  ALL_COMMANDS,
  BATTERY,
  HEART_MONITORING_ENABLED_SET,
  HEART_RATE_RESTING,
  TIME,
  WORKOUT_SUMMARY,
  commandFromCodes,
  shouldEncrypt,
} from './commands.js';

describe('command table', () => {
  it('looks up commands by opcode pair', () => {
    expect(commandFromCodes(0xffff, 0x8005)).toEqual(ACTIVITY_FETCH_1);
    expect(commandFromCodes(0x005c, 0x0001)).toEqual(BATTERY);
    expect(commandFromCodes(0xffff, 0x8004)).toEqual(TIME);
    expect(commandFromCodes(0x0057, 0x0001)).toEqual(WORKOUT_SUMMARY);
  });

  it('returns undefined for unknown opcodes', () => {
    expect(commandFromCodes(0x1234, 0x5678)).toBeUndefined();
  });

  it('resolves opcodes by their Gadgetbridge names', () => {
    expect(commandFromCodes(0x00da, 0x0001)).toEqual(HEART_RATE_RESTING);
    expect(commandFromCodes(0x009b, 0x0001)).toEqual(HEART_MONITORING_ENABLED_SET);
  });

  it('has no duplicate (cmd1, cmd2) opcode pairs', () => {
    const seen = new Set<string>();
    for (const command of ALL_COMMANDS) {
      const key = `${command.cmd1.toString(16)}:${command.cmd2.toString(16)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('marks pairing and data-chunk commands as plaintext', () => {
    expect(shouldEncrypt('AUTH_PAIR_REQUEST')).toBe(false);
    expect(shouldEncrypt('AUTH_PAIR_REPLY')).toBe(false);
    expect(shouldEncrypt('DATA_CHUNK_WRITE_FIRMWARE')).toBe(false);
    expect(shouldEncrypt('ACTIVITY_DATA')).toBe(true);
    expect(shouldEncrypt('BATTERY')).toBe(true);
    expect(shouldEncrypt('UNKNOWN_CMD')).toBe(true);
  });
});
