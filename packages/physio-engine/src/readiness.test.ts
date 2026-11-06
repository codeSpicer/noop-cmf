import { describe, expect, it } from 'vitest';
import { EpochMsSchema, RECOVERY_MAX, RECOVERY_MIN } from '@noop-cmf/types';
import { computeReadiness, RECOVERY_MINUTES_PER_STRAIN, type StrainEvent } from './readiness.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

function ev(offsetMin: number, strain: number): StrainEvent {
  return { at: EpochMsSchema.parse(T0 + offsetMin * MIN), strain };
}

describe('computeReadiness', () => {
  it('returns recovery score with no events', () => {
    const result = computeReadiness({ recoveryScore: 80, strainEvents: [], now: EpochMsSchema.parse(T0) });
    expect(result.readinessPercent).toBe(80);
    expect(result.minutesToReady).toBe(0);
    expect(result.recovered).toBe(true);
  });

  it('dips right after a max-strain event', () => {
    const event = ev(0, 21);
    const result = computeReadiness({ recoveryScore: 80, strainEvents: [event], now: EpochMsSchema.parse(T0) });
    // remaining = 21*90 = 1890; readiness = 80*(1-0.6*1) = 32 -> clamped? 32 >=1
    expect(result.readinessPercent).toBe(32);
    expect(result.minutesToReady).toBe(21 * RECOVERY_MINUTES_PER_STRAIN);
    expect(result.recovered).toBe(false);
  });

  it('returns full recovery when countdown elapsed', () => {
    const event = ev(0, 21);
    const now = EpochMsSchema.parse(T0 + 21 * 90 * MIN);
    const result = computeReadiness({ recoveryScore: 80, strainEvents: [event], now });
    expect(result.readinessPercent).toBe(80);
    expect(result.minutesToReady).toBe(0);
    expect(result.recovered).toBe(true);
  });

  it('governs by largest remaining across multiple events', () => {
    const e1 = ev(0, 10); // 900 min
    const e2 = ev(-30, 5); // started 30 min ago, 450-30=420
    const now = EpochMsSchema.parse(T0);
    const result = computeReadiness({ recoveryScore: 70, strainEvents: [e1, e2], now });
    expect(result.minutesToReady).toBe(10 * 90);
  });

  it('guards now before an event (no negative elapsed)', () => {
    const event = ev(10, 5); // event in the future
    const now = EpochMsSchema.parse(T0);
    const result = computeReadiness({ recoveryScore: 70, strainEvents: [event], now });
    expect(result.minutesToReady).toBe(5 * 90);
  });

  it('guards zero/unknown recovery score', () => {
    const result = computeReadiness({ recoveryScore: 0, strainEvents: [], now: EpochMsSchema.parse(T0) });
    expect(result.readinessPercent).toBe(RECOVERY_MIN);
  });

  it('handles zero-strain event without division by zero', () => {
    const event = ev(0, 0);
    const result = computeReadiness({ recoveryScore: 80, strainEvents: [event], now: EpochMsSchema.parse(T0) });
    expect(result.readinessPercent).toBe(80);
    expect(result.minutesToReady).toBe(0);
    expect(result.recovered).toBe(true);
  });

  it('guards non-finite strain and recovery score', () => {
    const badEvent = { at: EpochMsSchema.parse(T0), strain: Number.NaN } as StrainEvent;
    const result = computeReadiness({ recoveryScore: Number.NaN, strainEvents: [badEvent], now: EpochMsSchema.parse(T0) });
    expect(result.readinessPercent).toBe(RECOVERY_MIN);
  });

  it('clamps into 1..99', () => {
    const event = ev(0, 21);
    const result = computeReadiness({ recoveryScore: 99, strainEvents: [event], now: EpochMsSchema.parse(T0) });
    expect(result.readinessPercent).toBeGreaterThanOrEqual(RECOVERY_MIN);
    expect(result.readinessPercent).toBeLessThanOrEqual(RECOVERY_MAX);
  });

  it('clamps an over-large recovery score to the max', () => {
    const result = computeReadiness({ recoveryScore: 200, strainEvents: [], now: EpochMsSchema.parse(T0) });
    expect(result.readinessPercent).toBe(RECOVERY_MAX);
  });

  it('clamps a negative recovery score to the min', () => {
    const result = computeReadiness({ recoveryScore: -5, strainEvents: [], now: EpochMsSchema.parse(T0) });
    expect(result.readinessPercent).toBe(RECOVERY_MIN);
  });
});