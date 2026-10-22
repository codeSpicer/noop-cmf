import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '@noop-cmf/types';
import { computeHabitImpacts, MIN_GROUP_DAYS, type HabitOutcomeDay } from './habits.js';

function entry(date: string, habits: Record<string, boolean>): JournalEntry {
  return { date, habits };
}

function day(
  date: string,
  habits: Record<string, boolean> | undefined,
  recovery: number | undefined,
  ehrv: number | undefined,
): HabitOutcomeDay {
  return { entry: habits === undefined ? undefined : entry(date, habits), recovery, ehrv };
}

describe('computeHabitImpacts', () => {
  it('computes positive and negative deltas for a well-logged habit', () => {
    const days = [
      day('2024-01-01', { alcohol: false }, 70, 110),
      day('2024-01-02', { alcohol: false }, 72, 112),
      day('2024-01-03', { alcohol: true }, 55, 95),
      day('2024-01-04', { alcohol: true }, 57, 93),
    ];
    const [impact] = computeHabitImpacts(days);
    expect(impact?.habit).toBe('alcohol');
    expect(impact?.daysWith).toBe(2);
    expect(impact?.daysWithout).toBe(2);
    expect(impact?.recoveryDelta).toBeCloseTo(-15, 10);
    expect(impact?.ehrvDelta).toBeCloseTo(-17, 10);
  });

  it('returns null deltas when a group is below the minimum', () => {
    const days = [
      day('2024-01-01', { caffeine: true }, 70, 110),
      day('2024-01-02', { caffeine: false }, 72, 112),
      day('2024-01-03', { caffeine: false }, 74, 114),
    ];
    const [impact] = computeHabitImpacts(days);
    expect(impact?.recoveryDelta).toBeNull();
    expect(impact?.ehrvDelta).toBeNull();
  });

  it('treats absent habits as without and skips days without entries', () => {
    const days = [
      day('2024-01-01', { reading: true }, 70, 110),
      day('2024-01-02', {}, 72, 112),
      day('2024-01-03', { reading: true }, 74, 114),
      day('2024-01-04', undefined, 90, 130),
      day('2024-01-05', {}, 60, 100),
    ];
    const [impact] = computeHabitImpacts(days);
    expect(impact?.habit).toBe('reading');
    expect(impact?.daysWith).toBe(2);
    expect(impact?.daysWithout).toBe(2);
    expect(impact?.recoveryDelta).toBeCloseTo(6, 10);
  });

  it('skips days missing one outcome while using the other', () => {
    const days = [
      day('2024-01-01', { run: true }, 70, undefined),
      day('2024-01-02', { run: true }, 72, undefined),
      day('2024-01-03', { run: false }, 60, undefined),
      day('2024-01-04', { run: false }, 62, undefined),
    ];
    const [impact] = computeHabitImpacts(days);
    expect(impact?.recoveryDelta).toBeCloseTo(10, 10);
    expect(impact?.ehrvDelta).toBeNull();
  });

  it('returns sorted habits and empty results for no journals', () => {
    expect(computeHabitImpacts([])).toEqual([]);
    expect(computeHabitImpacts([day('2024-01-01', undefined, 70, 110)])).toEqual([]);
    const days = [
      day('2024-01-01', { zinc: true, alcohol: false }, 70, 110),
      day('2024-01-02', { zinc: false, alcohol: false }, 72, 112),
    ];
    const habits = computeHabitImpacts(days).map((impact) => impact.habit);
    expect(habits).toEqual(['alcohol', 'zinc']);
  });

  it('exposes the minimum group size constant', () => {
    expect(MIN_GROUP_DAYS).toBe(2);
  });
});
