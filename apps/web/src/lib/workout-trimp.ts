/**
 * Compute per-workout TRIMP/strain from IndexedDB.
 */
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeDayStrain } from '@noop-cmf/physio-engine';

const BASELINE_RHR = 50;
const BASELINE_HR_MAX = 190;

export interface WorkoutTrimp {
  readonly id: string;
  readonly activityType: string;
  readonly trimp: number;
  readonly strain: number;
}

export async function loadWorkoutTrimp(
  db: NoopCmfDatabase = getDatabase(),
): Promise<WorkoutTrimp[]> {
  const [workouts, hrRows] = await Promise.all([db.workouts.toArray(), db.hrSamples.toArray()]);
  const result: WorkoutTrimp[] = [];
  for (const w of workouts) {
    const samples = hrRows.filter((h) => h.timestamp >= w.start && h.timestamp < w.end);
    const breakdown = computeDayStrain(samples, BASELINE_RHR, BASELINE_HR_MAX);
    result.push({
      id: w.id,
      activityType: w.activityType,
      trimp: breakdown.trimp,
      strain: breakdown.strain,
    });
  }
  return result;
}