import { getDatabase } from '@/db/database';
import type { StoredUserProfile } from '@/db/database';

export interface JsonImportCounts {
  readonly hr: number;
  readonly stress: number;
  readonly spo2: number;
  readonly sleep: number;
  readonly workouts: number;
  readonly steps: number;
  readonly rawFrames: number;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Import data from a previously exported JSON file. Merges (bulkPut) into IndexedDB. */
export async function importAllFromJson(file: File): Promise<JsonImportCounts> {
  const text = await file.text();
  const payload = JSON.parse(text) as Record<string, unknown>;
  const db = getDatabase();
  const hr = asArray(payload['hrSamples']);
  const stress = asArray(payload['stressSamples']);
  const spo2 = asArray(payload['spo2Samples']);
  const sleep = asArray(payload['sleepSegments']);
  const workouts = asArray(payload['workouts']);
  const steps = asArray(payload['steps']);
  const rawFrames = asArray(payload['workoutRawFrames']);
  const profile = payload['userProfile'];

  await db.transaction(
    'rw',
    [db.hrSamples, db.stressSamples, db.spo2Samples, db.sleepSegments, db.workouts, db.steps, db.workoutRawFrames, db.userProfile],
    async () => {
      if (hr.length) await db.hrSamples.bulkPut(hr as never);
      if (stress.length) await db.stressSamples.bulkPut(stress as never);
      if (spo2.length) await db.spo2Samples.bulkPut(spo2 as never);
      if (sleep.length) await db.sleepSegments.bulkPut(sleep as never);
      if (workouts.length) await db.workouts.bulkPut(workouts as never);
      if (steps.length) await db.steps.bulkPut(steps as never);
      if (rawFrames.length) await db.workoutRawFrames.bulkPut(rawFrames as never);
      if (profile && typeof profile === 'object') {
        const p = profile as Record<string, unknown>;
        const stored: StoredUserProfile = {
          id: 'default',
          ...(typeof p['restingHeartRate'] === 'number' ? { restingHeartRate: p['restingHeartRate'] } : {}),
          ...(typeof p['maxHeartRate'] === 'number' ? { maxHeartRate: p['maxHeartRate'] } : {}),
          ...(typeof p['age'] === 'number' ? { age: p['age'] } : {}),
          ...(p['sex'] === 'male' || p['sex'] === 'female' || p['sex'] === 'other' ? { sex: p['sex'] } : {}),
          ...(typeof p['heightCm'] === 'number' ? { heightCm: p['heightCm'] } : {}),
          ...(typeof p['weightKg'] === 'number' ? { weightKg: p['weightKg'] } : {}),
          ...(typeof p['dayStartHour'] === 'number' ? { dayStartHour: p['dayStartHour'] } : {}),
          ...(typeof p['updatedAt'] === 'number' ? { updatedAt: p['updatedAt'] } : {}),
        };
        await db.userProfile.put(stored);
      }
    },
  );

  return {
    hr: hr.length,
    stress: stress.length,
    spo2: spo2.length,
    sleep: sleep.length,
    workouts: workouts.length,
    steps: steps.length,
    rawFrames: rawFrames.length,
  };
}
