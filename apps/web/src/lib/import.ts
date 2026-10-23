import type { TimeRange, WatchDataProvider } from '@noop-cmf/types';
import type { NoopCmfDatabase } from '@/db/database';

export interface ImportCounts {
  readonly hr: number;
  readonly stress: number;
  readonly spo2: number;
  readonly sleep: number;
  readonly workouts: number;
  readonly steps: number;
}

/** Pull every sample kind from a provider and persist it to IndexedDB. */
export async function importAll(
  provider: WatchDataProvider,
  range: TimeRange,
  db: NoopCmfDatabase,
): Promise<ImportCounts> {
  const [hr, stress, spo2, sleep, workouts, steps] = await Promise.all([
    provider.getHeartRateSamples(range),
    provider.getStressSamples(range),
    provider.getSpo2Samples(range),
    provider.getSleepSegments(range),
    provider.getWorkouts(range),
    provider.getStepSamples(range),
  ]);
  await db.transaction(
    'rw',
    [db.hrSamples, db.stressSamples, db.spo2Samples, db.sleepSegments, db.workouts, db.steps],
    async () => {
      if (hr.ok) await db.hrSamples.bulkPut(hr.value);
      if (stress.ok) await db.stressSamples.bulkPut(stress.value);
      if (spo2.ok) await db.spo2Samples.bulkPut(spo2.value);
      if (sleep.ok) await db.sleepSegments.bulkPut(sleep.value);
      if (workouts.ok) await db.workouts.bulkPut(workouts.value);
      if (steps.ok) await db.steps.bulkPut(steps.value);
    },
  );
  return {
    hr: hr.ok ? hr.value.length : 0,
    stress: stress.ok ? stress.value.length : 0,
    spo2: spo2.ok ? spo2.value.length : 0,
    sleep: sleep.ok ? sleep.value.length : 0,
    workouts: workouts.ok ? workouts.value.length : 0,
    steps: steps.ok ? steps.value.length : 0,
  };
}
