import { describe, expect, it } from 'vitest';
import { EpochMsSchema, type SleepSegment } from '@noop-cmf/types';
import {
  analyzeSleep,
  BASELINE_SLEEP_MINUTES,
  computeSleepDebt,
  computeSleepNeedTonight,
  groupSegmentsByNight,
  MS_PER_MINUTE,
  SLEEP_DEBT_CARRYOVER,
  SLEEP_NEED_STRAIN_COEFFICIENT,
} from './sleep.js';

const NIGHT_START = 1_700_000_000_000;

function segment(
  startOffsetMin: number,
  durationMin: number,
  stage: SleepSegment['stage'],
): SleepSegment {
  const start = EpochMsSchema.parse(NIGHT_START + startOffsetMin * MS_PER_MINUTE);
  return { start, end: EpochMsSchema.parse(start + durationMin * MS_PER_MINUTE), stage };
}

describe('analyzeSleep', () => {
  it('computes efficiency and restorative share for a typical night', () => {
    const segments = [
      segment(0, 20, 'awake'),
      segment(20, 60, 'light'),
      segment(80, 90, 'deep'),
      segment(170, 60, 'rem'),
      segment(230, 250, 'light'),
    ];
    const summary = analyzeSleep(segments);
    expect(summary.timeInBedMinutes).toBe(480);
    expect(summary.totalSleepMinutes).toBe(460);
    expect(summary.restorativeShare).toBeCloseTo(150 / 460, 6);
    expect(summary.sleepEfficiency).toBeCloseTo((460 / 480) * 100, 1);
    expect(summary.sleepPerformance).toBeGreaterThanOrEqual(0);
    expect(summary.sleepPerformance).toBeLessThanOrEqual(100);
  });

  it('returns a zeroed summary for empty input', () => {
    expect(analyzeSleep([])).toEqual({
      timeInBedMinutes: 0,
      totalSleepMinutes: 0,
      restorativeShare: 0,
      sleepEfficiency: 0,
      sleepPerformance: 0,
    });
  });

  it('returns a zeroed summary when only awake time was recorded', () => {
    const summary = analyzeSleep([segment(0, 30, 'awake')]);
    expect(summary.totalSleepMinutes).toBe(0);
    expect(summary.sleepEfficiency).toBe(0);
    expect(summary.sleepPerformance).toBe(0);
  });

  it('clamps negative performance inputs and caps at 100', () => {
    const summary = analyzeSleep([segment(0, 480, 'deep')]);
    expect(summary.sleepPerformance).toBeLessThanOrEqual(100);
    expect(summary.restorativeShare).toBe(1);
    expect(summary.sleepEfficiency).toBe(100);
  });
});

describe('computeSleepNeedTonight', () => {
  it('matches the spec formula', () => {
    const need = computeSleepNeedTonight(10, 60);
    expect(need).toBe(
      BASELINE_SLEEP_MINUTES +
        Math.round(SLEEP_NEED_STRAIN_COEFFICIENT * 10) +
        Math.round(SLEEP_DEBT_CARRYOVER * 60),
    );
  });

  it('equals baseline for a rest day with no debt', () => {
    expect(computeSleepNeedTonight(0, 0)).toBe(BASELINE_SLEEP_MINUTES);
  });

  it('never goes negative even with large sleep credit', () => {
    expect(computeSleepNeedTonight(0, -2000)).toBeGreaterThanOrEqual(0);
  });
});

describe('computeSleepDebt', () => {
  it('accumulates shortfall onto prior debt', () => {
    expect(computeSleepDebt(30, 480, 420)).toBe(90);
  });

  it('goes negative when sleep exceeds need (credit)', () => {
    expect(computeSleepDebt(0, 450, 500)).toBe(-50);
  });
});

describe('groupSegmentsByNight', () => {
  it('attributes pre-midnight sleep to the next morning wake-up', () => {
    const wake1 = EpochMsSchema.parse(NIGHT_START + 6 * 60 * MS_PER_MINUTE);
    const wake2 = EpochMsSchema.parse(NIGHT_START + 30 * 60 * MS_PER_MINUTE);
    const preMidnight = segment(120, 60, 'deep');
    const afterWake1 = segment(400, 60, 'light');
    const nights = groupSegmentsByNight([preMidnight, afterWake1], [wake1, wake2]);
    expect(nights).toHaveLength(2);
    expect(nights[0]).toEqual([preMidnight]);
    expect(nights[1]).toEqual([afterWake1]);
  });

  it('handles segments across timezone-shifted wake boundaries', () => {
    const wake1 = EpochMsSchema.parse(NIGHT_START + 360 * MS_PER_MINUTE);
    const wake2 = EpochMsSchema.parse(NIGHT_START + 1800 * MS_PER_MINUTE);
    const late = segment(1700, 30, 'rem');
    const nights = groupSegmentsByNight([late], [wake2, wake1]);
    expect(nights[1]).toEqual([late]);
  });

  it('attributes post-final-wake segments to the final night', () => {
    const wake = EpochMsSchema.parse(NIGHT_START + 360 * MS_PER_MINUTE);
    const after = segment(500, 30, 'light');
    const nights = groupSegmentsByNight([after], [wake]);
    expect(nights[0]).toEqual([after]);
  });

  it('returns empty nights when no segments exist', () => {
    const wake = EpochMsSchema.parse(NIGHT_START + 360 * MS_PER_MINUTE);
    expect(groupSegmentsByNight([], [wake])).toEqual([[]]);
  });
});
