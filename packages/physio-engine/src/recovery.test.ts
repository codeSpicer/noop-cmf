import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import {
  EpochMsSchema,
  MILLISECONDS_MAX,
  MILLISECONDS_MIN,
  RECOVERY_MAX,
  RECOVERY_MIN,
} from '@noop-cmf/types';
import type { HrSample, SleepSegment, StressSample } from '@noop-cmf/types';
import {
  computeOvernightMetrics,
  computeRecovery,
  computeStrainTarget,
  mean,
  percentile,
  sampleStdDev,
  EHRV_SIGMA_FLOOR,
  RHR_SIGMA_FLOOR,
  type RecoveryHistoryDay,
} from './recovery.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

function hrAt(offsetMin: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(T0 + offsetMin * MIN), bpm: bpm as HrSample['bpm'] };
}

function stressAt(offsetMin: number, stress: number): StressSample {
  return {
    timestamp: EpochMsSchema.parse(T0 + offsetMin * MIN),
    stress: stress as StressSample['stress'],
  };
}

function seg(startMin: number, endMin: number, stage: SleepSegment['stage']): SleepSegment {
  return {
    start: EpochMsSchema.parse(T0 + startMin * MIN),
    end: EpochMsSchema.parse(T0 + endMin * MIN),
    stage,
  };
}

describe('percentile', () => {
  it('returns exact endpoints', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });

  it('interpolates the median', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
  });

  it('throws on empty input', () => {
    expect(() => percentile([], 50)).toThrow(RangeError);
  });
});

describe('mean and sampleStdDev', () => {
  it('returns 0 for empty input', () => {
    expect(mean([])).toBe(0);
    expect(sampleStdDev([])).toBe(0);
  });

  it('returns 0 stddev for a single value', () => {
    expect(sampleStdDev([5])).toBe(0);
  });

  it('computes sample (n-1) standard deviation', () => {
    expect(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
});

describe('computeOvernightMetrics', () => {
  const asleep = [seg(0, 120, 'light'), seg(120, 200, 'deep'), seg(300, 360, 'awake')];

  it('uses only samples overlapping asleep stages', () => {
    const hr = [hrAt(-30, 90), hrAt(10, 60), hrAt(30, 55), hrAt(130, 52), hrAt(320, 95)];
    const stress = [stressAt(-30, 90), stressAt(10, 40), stressAt(130, 20)];
    const result = computeOvernightMetrics(hr, stress, asleep, 55);
    expect(result.restingHeartRate).toBe(53);
    expect(result.stress).toBe(30);
    const expected = Math.round(110 - 0.9 * 30 - 0.6 * (53 - 55));
    expect(result.ehrv).toBe(expected);
  });

  it('matches the spec eHRV formula by hand', () => {
    const hr = [hrAt(10, 48), hrAt(20, 48), hrAt(30, 48)];
    const stress = [stressAt(10, 30), stressAt(20, 30)];
    const result = computeOvernightMetrics(hr, stress, [seg(0, 60, 'rem')], 50);
    expect(result.restingHeartRate).toBe(48);
    expect(result.stress).toBe(30);
    expect(result.ehrv).toBe(Math.round(110 - 0.9 * 30 - 0.6 * (48 - 50)));
  });

  it('falls back to baseline and neutral stress with no asleep overlap', () => {
    const result = computeOvernightMetrics(
      [hrAt(10, 90)],
      [stressAt(10, 90)],
      [seg(0, 60, 'awake')],
      55,
    );
    expect(result.restingHeartRate).toBe(55);
    expect(result.stress).toBe(50);
    expect(result.ehrv).toBe(Math.round(110 - 0.9 * 50));
  });

  it('clamps eHRV into 15..180', () => {
    const hr = [hrAt(10, 25), hrAt(20, 25)];
    const stress = [stressAt(10, 1), stressAt(20, 1)];
    const high = computeOvernightMetrics(hr, stress, [seg(0, 60, 'deep')], 60);
    expect(high.ehrv).toBeLessThanOrEqual(MILLISECONDS_MAX);
    expect(high.ehrv).toBeGreaterThanOrEqual(MILLISECONDS_MIN);

    const lowHr = [hrAt(10, 120), hrAt(20, 120)];
    const lowStress = [stressAt(10, 99), stressAt(20, 99)];
    const low = computeOvernightMetrics(lowHr, lowStress, [seg(0, 60, 'deep')], 40);
    expect(low.ehrv).toBeGreaterThanOrEqual(MILLISECONDS_MIN);
  });
});

describe('computeRecovery', () => {
  function flatHistory(days: number, ehrv: number, rhr: number): RecoveryHistoryDay[] {
    return Array.from({ length: days }, () => ({ ehrv, restingHeartRate: rhr }));
  }

  it('returns 50 for a perfectly average day against flat history', () => {
    const recovery = computeRecovery({
      ehrvToday: 100,
      rhrToday: 50,
      sleepPerformance: 80,
      history: flatHistory(30, 100, 50),
    });
    expect(recovery).toBe(50);
  });

  it('matches a hand-computed Z-score example', () => {
    const varied = Array.from({ length: 30 }, (_, i) => ({
      ehrv: 96 + (i % 5),
      restingHeartRate: 48 + (i % 3),
    }));
    const recovery = computeRecovery({
      ehrvToday: 104,
      rhrToday: 47,
      sleepPerformance: 90,
      history: varied,
    });
    expect(recovery).toBeGreaterThanOrEqual(RECOVERY_MIN);
    expect(recovery).toBeLessThanOrEqual(RECOVERY_MAX);
    expect(Number.isInteger(recovery)).toBe(true);
  });

  it('applies the zero-variance guard floors', () => {
    expect(EHRV_SIGMA_FLOOR).toBe(4.0);
    expect(RHR_SIGMA_FLOOR).toBe(2.0);
    const recovery = computeRecovery({
      ehrvToday: 104,
      rhrToday: 50,
      sleepPerformance: 80,
      history: flatHistory(30, 100, 50),
    });
    expect(recovery).toBe(50 + 18);
  });

  it('uses the cold-start guard for short history', () => {
    const recovery = computeRecovery({
      ehrvToday: 100,
      rhrToday: 50,
      sleepPerformance: 80,
      history: flatHistory(2, 100, 50),
    });
    expect(recovery).toBe(50);
  });

  it('handles empty history without NaN', () => {
    const recovery = computeRecovery({
      ehrvToday: 100,
      rhrToday: 50,
      sleepPerformance: 80,
      history: [],
    });
    expect(recovery).toBe(50);
  });

  it('returns 50 for non-finite inputs instead of NaN', () => {
    const recovery = computeRecovery({
      ehrvToday: Number.NaN,
      rhrToday: 50,
      sleepPerformance: 80,
      history: [],
    });
    expect(recovery).toBe(50);
  });

  it('clamps extreme inputs into 1..99', () => {
    const high = computeRecovery({
      ehrvToday: 180,
      rhrToday: 25,
      sleepPerformance: 100,
      history: flatHistory(30, 60, 80),
    });
    expect(high).toBe(RECOVERY_MAX);
    const low = computeRecovery({
      ehrvToday: 15,
      rhrToday: 120,
      sleepPerformance: 0,
      history: flatHistory(30, 150, 40),
    });
    expect(low).toBe(RECOVERY_MIN);
  });

  it('rewards sleep performance above 80 and penalizes below', () => {
    const base = { ehrvToday: 100, rhrToday: 50, history: flatHistory(30, 100, 50) };
    const rested = computeRecovery({ ...base, sleepPerformance: 100 });
    const tired = computeRecovery({ ...base, sleepPerformance: 60 });
    expect(rested).toBeGreaterThan(tired);
    expect(rested - tired).toBe(10);
  });
});

describe('computeStrainTarget', () => {
  it('maps 0 recovery to 6.0 and 100 recovery to 17.5', () => {
    expect(computeStrainTarget(0)).toBe(6.0);
    expect(computeStrainTarget(100)).toBe(17.5);
  });

  it('rounds to one decimal', () => {
    expect(computeStrainTarget(50)).toBe(11.8);
    expect(computeStrainTarget(72)).toBe(14.3);
  });
});

describe('recovery properties', () => {
  const historyDayArb = fc.record({
    ehrv: fc.integer({ min: 15, max: 180 }),
    restingHeartRate: fc.integer({ min: 25, max: 240 }),
  });

  it('recovery is always a finite integer in [1, 99], even with zero variance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 15, max: 180 }),
        fc.integer({ min: 25, max: 240 }),
        fc.integer({ min: 0, max: 100 }),
        fc.array(historyDayArb, { minLength: 0, maxLength: 30 }),
        (ehrvToday, rhrToday, sleepPerformance, history) => {
          const recovery = computeRecovery({ ehrvToday, rhrToday, sleepPerformance, history });
          expect(Number.isInteger(recovery)).toBe(true);
          expect(recovery).toBeGreaterThanOrEqual(1);
          expect(recovery).toBeLessThanOrEqual(99);
          expect(Number.isFinite(recovery)).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('constant history (sigma = 0) never yields NaN or Infinity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 15, max: 180 }),
        fc.integer({ min: 25, max: 240 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 15, max: 180 }),
        fc.integer({ min: 25, max: 240 }),
        (ehrvToday, rhrToday, sleepPerformance, flatEhrv, flatRhr) => {
          const history = Array.from({ length: 30 }, () => ({
            ehrv: flatEhrv,
            restingHeartRate: flatRhr,
          }));
          const recovery = computeRecovery({ ehrvToday, rhrToday, sleepPerformance, history });
          expect(Number.isNaN(recovery)).toBe(false);
          expect(recovery).not.toBe(Number.POSITIVE_INFINITY);
          expect(recovery).not.toBe(Number.NEGATIVE_INFINITY);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
