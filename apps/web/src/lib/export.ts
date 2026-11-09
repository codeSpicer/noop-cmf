/**
 * Export all local IndexedDB data as a downloadable JSON file.
 */
import { getDatabase } from '@/db/database';

export async function exportAllData(): Promise<void> {
  const db = getDatabase();
  const [hr, stress, spo2, sleep, workouts, steps, rawFrames] = await Promise.all([
    db.hrSamples.toArray(),
    db.stressSamples.toArray(),
    db.spo2Samples.toArray(),
    db.sleepSegments.toArray(),
    db.workouts.toArray(),
    db.steps.toArray(),
    db.workoutRawFrames.toArray(),
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    hrSamples: hr,
    stressSamples: stress,
    spo2Samples: spo2,
    sleepSegments: sleep,
    workouts,
    steps,
    workoutRawFrames: rawFrames,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `noop-cmf-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}