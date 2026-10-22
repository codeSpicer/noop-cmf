import { describe, expect, it } from 'vitest';
import { MillisecondsSchema, RecoveryPercentSchema, StrainScoreSchema } from '@noop-cmf/types';
import {
  formatRecoveryWatchNotification,
  KIND_HR,
  KIND_SLEEP,
  KIND_SPO2,
  KIND_STRESS,
  KIND_WORKOUT,
  parseBulkData,
  parseRecoveryWatchNotification,
  RECOVERY_NOTIFICATION_BYTES,
} from './bulk.js';

const T0 = 1_700_000_000_000;

function hrRecord(epochMs: number, bpm: number): Uint8Array {
  const out = new Uint8Array(11);
  const view = new DataView(out.buffer);
  view.setUint8(0, KIND_HR);
  view.setBigUint64(1, BigInt(epochMs), true);
  view.setUint16(9, bpm, true);
  return out;
}

function stressRecord(epochMs: number, stress: number): Uint8Array {
  const out = new Uint8Array(10);
  const view = new DataView(out.buffer);
  view.setUint8(0, KIND_STRESS);
  view.setBigUint64(1, BigInt(epochMs), true);
  view.setUint8(9, stress);
  return out;
}

function spo2Record(epochMs: number, spo2: number): Uint8Array {
  const out = new Uint8Array(10);
  const view = new DataView(out.buffer);
  view.setUint8(0, KIND_SPO2);
  view.setBigUint64(1, BigInt(epochMs), true);
  view.setUint8(9, spo2);
  return out;
}

function sleepRecord(startMs: number, endMs: number, stage: number): Uint8Array {
  const out = new Uint8Array(18);
  const view = new DataView(out.buffer);
  view.setUint8(0, KIND_SLEEP);
  view.setBigUint64(1, BigInt(startMs), true);
  view.setBigUint64(9, BigInt(endMs), true);
  view.setUint8(17, stage);
  return out;
}

function workoutRecord(startMs: number, endMs: number, label: string, avgHr: number): Uint8Array {
  const labelBytes = new TextEncoder().encode(label);
  const out = new Uint8Array(9 + 8 + 1 + labelBytes.length + 2 + 4);
  const view = new DataView(out.buffer);
  view.setUint8(0, KIND_WORKOUT);
  view.setBigUint64(1, BigInt(startMs), true);
  view.setBigUint64(9, BigInt(endMs), true);
  view.setUint8(17, labelBytes.length);
  out.set(labelBytes, 18);
  view.setUint16(18 + labelBytes.length, avgHr, true);
  view.setUint32(20 + labelBytes.length, 320, true);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('parseBulkData', () => {
  it('parses HR, stress, SpO2, sleep, and workout records', () => {
    const data = concat([
      hrRecord(T0, 72),
      stressRecord(T0, 30),
      spo2Record(T0, 98),
      sleepRecord(T0, T0 + 3_600_000, 2),
      workoutRecord(T0 + 7_200_000, T0 + 9_000_000, 'run', 150),
    ]);
    const parsed = parseBulkData(data);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.hrSamples).toEqual([{ timestamp: T0, bpm: 72 }]);
    expect(parsed.value.stressSamples).toEqual([{ timestamp: T0, stress: 30 }]);
    expect(parsed.value.spo2Samples).toEqual([{ timestamp: T0, spo2: 98 }]);
    expect(parsed.value.sleepSegments).toEqual([{ start: T0, end: T0 + 3_600_000, stage: 'deep' }]);
    expect(parsed.value.workouts).toHaveLength(1);
    expect(parsed.value.workouts[0]?.activityType).toBe('run');
    expect(parsed.value.workouts[0]?.averageHeartRate).toBe(150);
    expect(parsed.value.workouts[0]?.calories).toBe(320);
  });

  it('parses every sleep stage byte', () => {
    const stages: Array<[number, string]> = [
      [0, 'awake'],
      [1, 'light'],
      [2, 'deep'],
      [3, 'rem'],
    ];
    for (const [byte, stage] of stages) {
      const parsed = parseBulkData(sleepRecord(T0, T0 + 60_000, byte));
      expect(parsed.ok && parsed.value.sleepSegments[0]?.stage).toBe(stage);
    }
  });

  it('rejects unknown kinds, stages, and truncation', () => {
    expect(parseBulkData(new Uint8Array([9, 0, 0, 0, 0, 0, 0, 0, 0])).ok).toBe(false);
    expect(parseBulkData(sleepRecord(T0, T0 + 60_000, 9)).ok).toBe(false);
    expect(parseBulkData(hrRecord(T0, 72).slice(0, 5)).ok).toBe(false);
    expect(parseBulkData(hrRecord(T0, 72).slice(0, 10)).ok).toBe(false);
    expect(parseBulkData(stressRecord(T0, 30).slice(0, 5)).ok).toBe(false);
    expect(parseBulkData(stressRecord(T0, 30).slice(0, 9)).ok).toBe(false);
    expect(parseBulkData(spo2Record(T0, 98).slice(0, 5)).ok).toBe(false);
    expect(parseBulkData(spo2Record(T0, 98).slice(0, 9)).ok).toBe(false);
    expect(parseBulkData(sleepRecord(T0, T0 + 1, 2).slice(0, 10)).ok).toBe(false);
    expect(parseBulkData(sleepRecord(T0, T0 + 1, 2).slice(0, 17)).ok).toBe(false);
    expect(parseBulkData(workoutRecord(T0, T0 + 1, 'run', 150).slice(0, 12)).ok).toBe(false);
    expect(parseBulkData(workoutRecord(T0, T0 + 1, '', 150)).ok).toBe(false);
    const longLabel = workoutRecord(T0, T0 + 1, 'run', 150);
    expect(parseBulkData(longLabel.slice(0, longLabel.length - 2)).ok).toBe(false);
  });
});

describe('recovery notification codec', () => {
  it('round-trips recovery, ehrv, and strain target', () => {
    const valid = {
      recovery: RecoveryPercentSchema.parse(72),
      ehrv: MillisecondsSchema.parse(110),
      strainTarget: StrainScoreSchema.parse(14.6),
    };
    const encoded = formatRecoveryWatchNotification(valid);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    expect(encoded.value.length).toBe(RECOVERY_NOTIFICATION_BYTES);
    const decoded = parseRecoveryWatchNotification(encoded.value);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.recovery).toBe(72);
      expect(decoded.value.ehrv).toBe(110);
      expect(decoded.value.strainTarget).toBeCloseTo(14.6, 5);
    }
  });

  it('rejects bad magic and wrong length', () => {
    expect(parseRecoveryWatchNotification(new Uint8Array(9)).ok).toBe(false);
    expect(parseRecoveryWatchNotification(new Uint8Array(4)).ok).toBe(false);
  });
});
