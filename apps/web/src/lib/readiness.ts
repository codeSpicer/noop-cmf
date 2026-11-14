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
import { loadResolvedUserProfile } from './user-profile';
import { computeMainSleep } from './sleep-sessions';

const DEFAULT_RHR = 50;
const DEFAULT_HR_MAX = 190;

export interface ReadinessDataInput {
  readonly hrSamples: readonly HrSample[];
  readonly sleepSegments: readonly SleepSegment[];
  readonly workouts: readonly Workout[];
  readonly now: EpochMs;
  readonly recoveryScore?: number;
  readonly restingHeartRate?: number;
  readonly maxHeartRate?: number;
}

/** Pure derivation from in-memory sample arrays (no IndexedDB). */
export function computeReadinessFromData(input: ReadinessDataInput): ReadinessResult {
  const {
    hrSamples,
    sleepSegments,
    workouts,
    now,
    recoveryScore: override,
    restingHeartRate = DEFAULT_RHR,
    maxHeartRate = DEFAULT_HR_MAX,
  } = input;

  let recoveryScore = 50;
  if (override !== undefined) {
    recoveryScore = override;
  } else if (hrSamples.length > 0) {
    const overnight = computeOvernightMetrics(hrSamples, [], sleepSegments, restingHeartRate);
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
    const breakdown = computeDayStrain(samples, restingHeartRate, maxHeartRate);
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

  const [hrRows, sleepRows, workoutRows, profile] = await Promise.all([
    db.hrSamples.toArray(),
    db.sleepSegments.toArray(),
    db.workouts.toArray(),
    loadResolvedUserProfile(db),
  ]);

  // Prefer main sleep session for recovery/sleep context when computing readiness without override.
  const main = computeMainSleep(sleepRows, now);
  const sleepSegments = main.session?.segments ?? sleepRows;

  return computeReadinessFromData({
    hrSamples: hrRows,
    sleepSegments,
    workouts: workoutRows,
    now,
    restingHeartRate: profile.restingHeartRate,
    maxHeartRate: profile.maxHeartRate,
  });
}

export type { ReadinessResult };
