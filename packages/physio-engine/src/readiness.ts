/**
 * Readiness / Time-to-Recovery model (spec equation [G]).
 *
 * A decaying readiness percentage plus a countdown to "ready to go hard
 * again", derived from recent strain events and the morning recovery score.
 */
import { RECOVERY_MAX, RECOVERY_MIN, type EpochMs, type RecoveryPercent } from '@noop-cmf/types';

/** Minutes of recovery owed per unit of strain (strain 21 -> ~31.5 h). */
export const RECOVERY_MINUTES_PER_STRAIN = 90;

/** Fraction of the morning recovery score lost immediately after strain. */
export const READINESS_DECAY_FRACTION = 0.6;

/** Lower bound of the readiness percent (mirrors {@link RECOVERY_MIN}). */
export const READINESS_MIN = RECOVERY_MIN;

/** Upper bound of the readiness percent (mirrors {@link RECOVERY_MAX}). */
export const READINESS_MAX = RECOVERY_MAX;

/** A single completed strain event feeding the readiness model. */
export interface StrainEvent {
  readonly at: EpochMs;
  readonly strain: number;
}

/** Result of {@link computeReadiness}. */
export interface ReadinessResult {
  readonly readinessPercent: RecoveryPercent;
  readonly minutesToReady: number;
  readonly recovered: boolean;
}

/** Clamp a number into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

interface EventRecovery {
  readonly remaining: number;
  readonly recoveryMinutes: number;
}

function eventRecovery(event: StrainEvent, now: EpochMs): EventRecovery {
  const strain = Number.isFinite(event.strain) ? event.strain : 0;
  const recoveryMinutes = Math.round(strain * RECOVERY_MINUTES_PER_STRAIN);
  if (recoveryMinutes <= 0) {
    return { remaining: 0, recoveryMinutes: 0 };
  }
  const elapsedMinutes = Math.max(0, (now - event.at) / 60_000);
  const remaining = Math.max(0, recoveryMinutes - elapsedMinutes);
  return { remaining, recoveryMinutes };
}

/**
 * Compute readiness and time-to-recovery from recent strain events.
 *
 * Pure and deterministic. Guarded against empty input, unknown/zero
 * recovery score, and `now` before an event.
 */
export function computeReadiness(input: {
  readonly recoveryScore: number;
  readonly strainEvents: readonly StrainEvent[];
  readonly now: EpochMs;
}): ReadinessResult {
  const recoveryScore = Number.isFinite(input.recoveryScore) ? input.recoveryScore : 0;
  const events = input.strainEvents;
  const now = input.now;

  const recoveries = events.map((event) => eventRecovery(event, now));

  // Governing event = largest remaining.
  let minutesToReady = 0;
  let governingRecoveryMinutes = 0;
  for (const recovery of recoveries) {
    if (recovery.remaining > minutesToReady) {
      minutesToReady = recovery.remaining;
      governingRecoveryMinutes = recovery.recoveryMinutes;
    }
  }

  const hasEvents = events.length > 0;

  let readinessRaw = recoveryScore;
  if (hasEvents && minutesToReady > 0 && governingRecoveryMinutes > 0) {
    readinessRaw =
      recoveryScore *
      (1 - READINESS_DECAY_FRACTION * (minutesToReady / governingRecoveryMinutes));
  }

  const readinessPercent = clamp(Math.round(readinessRaw), READINESS_MIN, READINESS_MAX) as RecoveryPercent;

  const recovered = !hasEvents || minutesToReady === 0;

  return {
    readinessPercent,
    minutesToReady,
    recovered,
  };
}