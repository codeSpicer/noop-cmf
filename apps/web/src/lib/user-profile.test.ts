import { describe, expect, it } from 'vitest';
import {
  computeTodaySteps,
  getLocalDayWindow,
  resolveUserProfile,
  sumDailySteps,
} from './user-profile';
import type { UserProfile } from './user-profile';

describe('user-profile helpers', () => {
  it('resolves defaults and enforces maxHr > rhr', () => {
    expect(resolveUserProfile(null)).toMatchObject({
      restingHeartRate: 50,
      maxHeartRate: 190,
      dayStartHour: 0,
    });
    const profile: UserProfile = { id: 'default', restingHeartRate: 60, maxHeartRate: 201 };
    const resolved = resolveUserProfile(profile);
    expect(resolved.restingHeartRate).toBe(60);
    expect(resolved.maxHeartRate).toBe(201);
  });

  it('computes local day window with configurable start hour', () => {
    // 2026-11-14 01:30 local -> with 2am start should belong to previous logical day
    const ts = new Date(2026, 10, 14, 1, 30, 0, 0).getTime();
    const midnight = getLocalDayWindow(ts, 0);
    const twoAm = getLocalDayWindow(ts, 2);
    expect(midnight.key).toBe('2026-11-14');
    expect(twoAm.key).toBe('2026-11-13');
  });

  it('sums cumulative daily steps and handles reset defensively', () => {
    expect(sumDailySteps([
      { timestamp: 1, steps: 100 },
      { timestamp: 2, steps: 250 },
      { timestamp: 3, steps: 400 },
    ])).toBe(400);
    expect(sumDailySteps([
      { timestamp: 1, steps: 300 },
      { timestamp: 2, steps: 350 },
      { timestamp: 3, steps: 10 }, // reset
      { timestamp: 4, steps: 120 },
    ])).toBe(470);
  });

  it('computes today steps using day boundary', () => {
    const dayStart = new Date(2026, 10, 14, 0, 0, 0, 0).getTime();
    const anchor = new Date(2026, 10, 14, 8, 0, 0, 0).getTime();
    const prev = dayStart - 60 * 60 * 1000;
    const steps = computeTodaySteps(
      [
        { timestamp: prev, steps: 1317 },
        { timestamp: dayStart + 60 * 60 * 1000, steps: 0 },
        { timestamp: dayStart + 2 * 60 * 60 * 1000, steps: 0 },
      ],
      anchor,
      0,
    );
    expect(steps).toBe(0);
  });
});
