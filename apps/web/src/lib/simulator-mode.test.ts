import { afterEach, describe, expect, it } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import {
  SIMULATOR_STORAGE_KEY,
  disableSimulatorMode,
  enableSimulatorMode,
  getSimulatorState,
} from './simulator-mode';

describe('simulator-mode', () => {
  afterEach(async () => {
    await clearDatabase(getDatabase());
    try {
      window.localStorage.removeItem(SIMULATOR_STORAGE_KEY);
    } catch {
      // ignore
    }
  });

  it('enables and disables simulator data without removing existing synced data', async () => {
    const db = getDatabase();
    const realTs = EpochMsSchema.parse(Date.UTC(2026, 5, 1, 12, 0, 0));
    await db.hrSamples.put({ timestamp: realTs, bpm: 72 as never });
    await db.workouts.put({
      id: 'real-workout-1',
      start: EpochMsSchema.parse(Date.UTC(2026, 5, 1, 10, 0, 0)),
      end: EpochMsSchema.parse(Date.UTC(2026, 5, 1, 10, 30, 0)),
      activityType: 'run',
    });

    const beforeHr = await db.hrSamples.count();
    const beforeWorkouts = await db.workouts.count();

    const result = await enableSimulatorMode('endurance-runner', db);
    expect(result.persona).toBe('endurance-runner');
    expect(result.inserted.hr).toBeGreaterThan(0);
    expect(getSimulatorState().active).toBe(true);

    const duringHr = await db.hrSamples.count();
    const duringWorkouts = await db.workouts.count();
    expect(duringHr).toBeGreaterThan(beforeHr);
    expect(duringWorkouts).toBeGreaterThan(beforeWorkouts);
    expect(await db.hrSamples.get(realTs)).toBeDefined();
    expect(await db.workouts.get('real-workout-1')).toBeDefined();

    await disableSimulatorMode(db);
    expect(getSimulatorState().active).toBe(false);
    expect(await db.hrSamples.count()).toBe(beforeHr);
    expect(await db.workouts.count()).toBe(beforeWorkouts);
    expect(await db.hrSamples.get(realTs)).toBeDefined();
    expect(await db.workouts.get('real-workout-1')).toBeDefined();
  }, 60_000);

  it('replaces previous simulator data when switching personas', async () => {
    const db = getDatabase();
    await enableSimulatorMode('endurance-runner', db);
    const firstTotal =
      (await db.hrSamples.count()) +
      (await db.stressSamples.count()) +
      (await db.spo2Samples.count()) +
      (await db.sleepSegments.count()) +
      (await db.workouts.count());

    await enableSimulatorMode('peak-recovery', db);
    const secondTotal =
      (await db.hrSamples.count()) +
      (await db.stressSamples.count()) +
      (await db.spo2Samples.count()) +
      (await db.sleepSegments.count()) +
      (await db.workouts.count());
    expect(getSimulatorState().active).toBe(true);
    expect(getSimulatorState().persona).toBe('peak-recovery');
    // Replacing persona data should not accumulate both datasets.
    expect(secondTotal).toBeLessThan(firstTotal * 2);

    await disableSimulatorMode(db);
    expect(await db.hrSamples.count()).toBe(0);
  }, 60_000);
});
