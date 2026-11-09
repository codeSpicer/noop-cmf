/**
 * Derive the current readiness / time-to-recovery.
 *
 * Works in demo mode (same shape as the demo provider) and after a real sync,
 * both from IndexedDB rows and from in-memory sample arrays.
 */
import { EpochMsSchema } from '@noop-cmf/types';
import type { EpochMs, HrSample, SleepSegment, Workout } from '@noop-cmf/types';
import { getDatabase } from '@/db/database';
import type { NoopCmfDatabase } from '@/db/database';
import {
  computeDayStrain,
  computeOvernightMetrics,
  computeRecovery,
  analyzeSleep,
  computeReadiness,
} from '@noop-cmf/physio-engine';
import type { StrainEvent, ReadinessResult } from '@noop-cmf/physio-engine';

const BASELINE_RHR = 50;
const BASELINE_HR_MAX = 190;

export interface ReadinessDataInput {
  readonly hrSamples: readonly HrSample[];
  readonly sleepSegments: readonly SleepSegment[];
  readonly workouts: readonly Workout[];
  readonly now: EpochMs;
  readonly recoveryScore?: number;
}

/** Pure derivation from in-memory sample arrays (no IndexedDB). */
export function computeReadinessFromData(input: ReadinessDataInput): ReadinessResult {
  const { hrSamples, sleepSegments, workouts, now, recoveryScore: override } = input;

  let recoveryScore = 50;
  if (override !== undefined) {
    recoveryScore = override;
  } else if (hrSamples.length > 0) {
    const overnight = computeOvernightMetrics(hrSamples, [], sleepSegments, BASELINE_RHR);
    const sleepSummary = sleepSegments.length > 0 ? analyzeSleep(sleepSegments) : null;
    const sleepPerformance = sleepSummary ? sleepSummary.sleepPerformance : 85;
    recoveryScore = computeRecovery({
      ehrvToday: overnight.ehrv,
      rhrToday: overnight.restingHeartRate,
      sleepPerformance,
      history: [],
    });
  }

  const strainEvents: StrainEvent[] = workouts.map((workout) => {
    const samples = hrSamples.filter(
      (sample) => sample.timestamp >= workout.start && sample.timestamp < workout.end,
    );
    const breakdown = computeDayStrain(samples, BASELINE_RHR, BASELINE_HR_MAX);
    return { at: workout.end, strain: breakdown.strain };
  });

  return computeReadiness({ recoveryScore, strainEvents, now });
}

export interface ReadinessLoadOptions {
  readonly db?: NoopCmfDatabase;
  readonly now?: EpochMs;
}

/** Load readiness from an IndexedDB instance (defaults to the shared one). */
export async function loadReadiness(options: ReadinessLoadOptions = {}): Promise<ReadinessResult> {
  const db = options.db ?? getDatabase();
  const now = options.now ?? EpochMsSchema.parse(Date.now());

  const [hrRows, sleepRows, workoutRows] = await Promise.all([
    db.hrSamples.toArray(),
    db.sleepSegments.toArray(),
    db.workouts.toArray(),
  ]);

  return computeReadinessFromData({
    hrSamples: hrRows,
    sleepSegments: sleepRows,
    workouts: workoutRows,
    now,
  });
}

export type { ReadinessResult };