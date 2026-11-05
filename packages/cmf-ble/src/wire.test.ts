import { describe, expect, it } from 'vitest';
import {
  decodeActivityData,
  decodeHeartRate,
  decodeSleepData,
  decodeSpo2,
  decodeStress,
  decodeWorkoutGps,
} from './wire.js';

function payload(bytes: number, fill: (view: DataView) => void): Uint8Array {
  const buffer = new Uint8Array(bytes);
  fill(new DataView(buffer.buffer));
  return buffer;
}

describe('decodeActivityData', () => {
  it('decodes 32-byte records', () => {
    const data = payload(64, (view) => {
      view.setUint32(0, 1_700_000_000, true);
      view.setUint32(4, 1234, true);
      view.setUint32(8, 900, true);
      view.setUint32(12, 45, true);
      view.setUint32(32, 1_700_000_060, true);
      view.setUint32(36, 0, true);
    });
    const result = decodeActivityData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]).toEqual({
        timestamp: 1_700_000_000_000,
        steps: 1234,
        distance: 900,
        calories: 45,
      });
      expect(result.value[1]?.steps).toBe(0);
    }
  });

  it('rejects empty or misaligned payloads', () => {
    expect(decodeActivityData(new Uint8Array(0)).ok).toBe(false);
    expect(decodeActivityData(new Uint8Array(31)).ok).toBe(false);
  });
});

describe('decodeHeartRate', () => {
  it('decodes [ts:s, bpm] records to milliseconds', () => {
    const data = payload(16, (view) => {
      view.setUint32(0, 1_700_000_000, true);
      view.setUint32(4, 72, true);
      view.setUint32(8, 1_700_000_008, true);
      view.setUint32(12, 140, true);
    });
    const result = decodeHeartRate(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { timestamp: 1_700_000_000_000, bpm: 72 },
        { timestamp: 1_700_000_008_000, bpm: 140 },
      ]);
    }
  });

  it('drops out-of-range bpm but keeps the rest', () => {
    const data = payload(16, (view) => {
      view.setUint32(0, 1_700_000_000, true);
      view.setUint32(4, 5, true);
      view.setUint32(8, 1_700_000_008, true);
      view.setUint32(12, 88, true);
    });
    const result = decodeHeartRate(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.bpm).toBe(88);
    }
  });

  it('rejects misaligned payloads', () => {
    expect(decodeHeartRate(new Uint8Array(7)).ok).toBe(false);
    expect(decodeHeartRate(new Uint8Array(0)).ok).toBe(false);
  });
});

describe('decodeStress and decodeSpo2', () => {
  it('decodes stress records', () => {
    const data = payload(8, (view) => {
      view.setUint32(0, 1_700_000_000, true);
      view.setUint32(4, 42, true);
    });
    const result = decodeStress(data);
    expect(result.ok && result.value).toEqual([{ timestamp: 1_700_000_000_000, stress: 42 }]);
  });

  it('decodes spo2 records', () => {
    const data = payload(8, (view) => {
      view.setUint32(0, 1_700_000_000, true);
      view.setUint32(4, 97, true);
    });
    const result = decodeSpo2(data);
    expect(result.ok && result.value).toEqual([{ timestamp: 1_700_000_000_000, spo2: 97 }]);
  });

  it('rejects misaligned payloads', () => {
    expect(decodeStress(new Uint8Array(8)).ok).toBe(true);
    expect(decodeSpo2(new Uint8Array(12)).ok).toBe(false);
  });
});

describe('decodeSleepData', () => {
  it('decodes a session header and stage segments', () => {
    const data = payload(34, (view) => {
      view.setUint32(0, 1_700_000_000, true);
      view.setUint32(4, 1_700_028_800, true);
      view.setUint32(18, 1_700_000_100, true);
      view.setInt16(22, 600, true);
      view.setInt16(24, 1, true);
      view.setUint32(26, 1_700_000_700, true);
      view.setInt16(30, 300, true);
      view.setInt16(32, 3, true);
    });
    const result = decodeSleepData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.start).toBe(1_700_000_000_000);
      expect(result.value.wakeup).toBe(1_700_028_800_000);
      expect(result.value.segments).toEqual([
        { start: 1_700_000_100_000, end: 1_700_000_700_000, stage: 'deep' },
        { start: 1_700_000_700_000, end: 1_700_001_000_000, stage: 'rem' },
      ]);
    }
  });

  it('rejects a truncated header', () => {
    expect(decodeSleepData(new Uint8Array(17)).ok).toBe(false);
  });

  it('rejects a misaligned stage tail', () => {
    expect(decodeSleepData(new Uint8Array(18 + 7)).ok).toBe(false);
  });
});

describe('decodeWorkoutGps', () => {
  it('decodes signed coordinates', () => {
    const data = payload(12, (view) => {
      view.setUint32(0, 1_700_000_000, true);
      view.setInt32(4, 123_456_789, true);
      view.setInt32(8, -45_678_901, true);
    });
    const result = decodeWorkoutGps(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        { timestamp: 1_700_000_000_000, longitude: 123_456_789, latitude: -45_678_901 },
      ]);
    }
  });

  it('rejects misaligned payloads', () => {
    expect(decodeWorkoutGps(new Uint8Array(11)).ok).toBe(false);
  });
});
