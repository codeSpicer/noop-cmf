/**
 * Habit correlation engine: per-habit Recovery % and eHRV deltas between
 * days a habit was present vs absent in the morning journal.
 */
import type { JournalEntry } from '@noop-cmf/types';

/** Minimum paired days per group before a habit delta is reported. */
export const MIN_GROUP_DAYS = 2;

/** One day of outcomes joined with that day's journal entry. */
export interface HabitOutcomeDay {
  readonly entry: JournalEntry | undefined;
  readonly recovery: number | undefined;
  readonly ehrv: number | undefined;
}

/** Per-habit impact: mean(with habit) minus mean(without habit). */
export interface HabitImpact {
  readonly habit: string;
  /** Days the habit was marked true (with usable outcomes). */
  readonly daysWith: number;
  /** Days the habit was marked false or absent (with usable outcomes). */
  readonly daysWithout: number;
  /** Recovery % delta (positive favors the habit). `null` when insufficient data. */
  readonly recoveryDelta: number | null;
  /** eHRV delta (positive favors the habit). `null` when insufficient data. */
  readonly ehrvDelta: number | null;
}

function groupMean(values: readonly number[]): number | null {
  if (values.length < MIN_GROUP_DAYS) {
    return null;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

/**
 * Compute per-habit impact across journaled days.
 *
 * A habit counts as "with" only when explicitly `true`; `false` or absent
 * counts as "without". Deltas are `null` unless both groups reach
 * {@link MIN_GROUP_DAYS} usable days.
 */
export function computeHabitImpacts(days: readonly HabitOutcomeDay[]): HabitImpact[] {
  const habits = new Set<string>();
  for (const day of days) {
    if (day.entry) {
      for (const habit of Object.keys(day.entry.habits)) {
        habits.add(habit);
      }
    }
  }

  const impacts: HabitImpact[] = [];
  for (const habit of [...habits].sort()) {
    const withRecovery: number[] = [];
    const withoutRecovery: number[] = [];
    const withEhrv: number[] = [];
    const withoutEhrv: number[] = [];

    for (const day of days) {
      if (!day.entry) {
        continue;
      }
      const present = day.entry.habits[habit] === true;
      if (day.recovery !== undefined) {
        (present ? withRecovery : withoutRecovery).push(day.recovery);
      }
      if (day.ehrv !== undefined) {
        (present ? withEhrv : withoutEhrv).push(day.ehrv);
      }
    }

    const withRecoveryMean = groupMean(withRecovery);
    const withoutRecoveryMean = groupMean(withoutRecovery);
    const withEhrvMean = groupMean(withEhrv);
    const withoutEhrvMean = groupMean(withoutEhrv);

    impacts.push({
      habit,
      daysWith: withRecovery.length > withEhrv.length ? withRecovery.length : withEhrv.length,
      daysWithout:
        withoutRecovery.length > withoutEhrv.length ? withoutRecovery.length : withoutEhrv.length,
      recoveryDelta:
        withRecoveryMean === null || withoutRecoveryMean === null
          ? null
          : withRecoveryMean - withoutRecoveryMean,
      ehrvDelta:
        withEhrvMean === null || withoutEhrvMean === null ? null : withEhrvMean - withoutEhrvMean,
    });
  }
  return impacts;
}
