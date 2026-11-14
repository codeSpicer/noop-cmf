/**
 * Compute per-workout TRIMP/strain and HR stats from IndexedDB.
 */
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import { computeDayStrain } from '@noop-cmf/physio-engine';
import { loadResolvedUserProfile } from './user-profile';

export interface WorkoutTrimp {
  readonly id: string;
  readonly activityType: string;
  readonly start: number;
  readonly end: number;
  readonly durationMin: number;
  readonly trimp: number;
  readonly strain: number;
  readonly avgHeartRate: number | null;
  readonly maxHeartRate: number | null;
  readonly hrSamples: number;
}

export async function loadWorkoutTrimp(
  db: NoopCmfDatabase = getDatabase(),
): Promise<WorkoutTrimp[]> {
  const [workouts, hrRows, profile] = await Promise.all([
    db.workouts.toArray(),
    db.hrSamples.toArray(),
    loadResolvedUserProfile(db),
  ]);
  const result: WorkoutTrimp[] = [];
  for (const w of workouts) {
    const samples = hrRows.filter((h) => h.timestamp >= w.start && h.timestamp <= w.end);
    const breakdown = computeDayStrain(samples, profile.restingHeartRate, profile.maxHeartRate);
    let avgHeartRate: number | null = null;
    let maxHeartRate: number | null = null;
    if (samples.length > 0) {
      let sum = 0;
      let max = -Infinity;
      for (const s of samples) {
        sum += s.bpm;
        if (s.bpm > max) max = s.bpm;
      }
      avgHeartRate = Math.round((sum / samples.length) * 10) / 10;
      maxHeartRate = max;
    } else if (w.averageHeartRate !== undefined) {
      avgHeartRate = w.averageHeartRate;
      maxHeartRate = w.averageHeartRate;
    }
    result.push({
      id: w.id,
      activityType: w.activityType,
      start: w.start,
      end: w.end,
      durationMin: Math.round(((w.end - w.start) / 60000) * 10) / 10,
      trimp: breakdown.trimp,
      strain: breakdown.strain,
      avgHeartRate,
      maxHeartRate,
      hrSamples: samples.length,
    });
  }
  result.sort((a, b) => b.start - a.start);
  return result;
}
