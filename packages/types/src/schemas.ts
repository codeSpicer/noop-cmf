/**
 * Canonical domain entities and runtime boundary schemas.
 *
 * Every external payload (BLE frames, Gadgetbridge SQLite rows, JSON
 * imports, localStorage state) must be parsed through these Zod schemas
 * before entering domain logic.
 */
import { z } from 'zod';
import {
  BpmSchema,
  EpochMsSchema,
  MillisecondsSchema,
  RecoveryPercentSchema,
  StrainScoreSchema,
  StressScoreSchema,
  SpO2PercentSchema,
  type RecoveryPercent,
} from './branded.js';

/** Sleep stage for a single segment. Asleep stages are light, deep, and rem. */
export const SleepStageSchema = z.enum(['awake', 'light', 'deep', 'rem']);
export type SleepStage = z.infer<typeof SleepStageSchema>;

/** Single heart-rate observation. */
export const HrSampleSchema = z.object({
  timestamp: EpochMsSchema,
  bpm: BpmSchema,
});
export type HrSample = z.infer<typeof HrSampleSchema>;

/** Single CMF PPG stress observation. */
export const StressSampleSchema = z.object({
  timestamp: EpochMsSchema,
  stress: StressScoreSchema,
});
export type StressSample = z.infer<typeof StressSampleSchema>;

/** Single blood-oxygen observation. */
export const Spo2SampleSchema = z.object({
  timestamp: EpochMsSchema,
  spo2: SpO2PercentSchema,
});
export type Spo2Sample = z.infer<typeof Spo2SampleSchema>;

/** Contiguous block of one sleep stage. End must be strictly after start. */
export const SleepSegmentSchema = z
  .object({
    start: EpochMsSchema,
    end: EpochMsSchema,
    stage: SleepStageSchema,
  })
  .refine((segment) => segment.end > segment.start, {
    message: 'Sleep segment end must be after start',
  });
export type SleepSegment = z.infer<typeof SleepSegmentSchema>;

/** A single workout session. End must be strictly after start. */
export const WorkoutSchema = z
  .object({
    id: z.string().min(1),
    start: EpochMsSchema,
    end: EpochMsSchema,
    activityType: z.string().min(1),
    averageHeartRate: BpmSchema.optional(),
    calories: z.number().int().nonnegative().optional(),
  })
  .refine((workout) => workout.end > workout.start, {
    message: 'Workout end must be after start',
  });
export type Workout = z.infer<typeof WorkoutSchema>;

/** Expected `YYYY-MM-DD` calendar-date format for journal entries. */
export const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Maximum allowed length of a journal free-text note. */
export const JOURNAL_NOTE_MAX_LENGTH = 2000;

/** Morning journal entry: habit checklist plus an optional note. */
export const JournalEntrySchema = z.object({
  date: z.string().regex(DATE_STRING_PATTERN, 'Date must use YYYY-MM-DD format'),
  habits: z.record(z.string().min(1), z.boolean()),
  note: z.string().max(JOURNAL_NOTE_MAX_LENGTH).optional(),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

/** Minimum valid sleep performance score. */
export const SLEEP_PERFORMANCE_MIN = 0;

/** Maximum valid sleep performance score. */
export const SLEEP_PERFORMANCE_MAX = 100;

/**
 * Sleep-anchored physiological cycle: starts at wake-up time T_wake(d-1) and
 * ends at wake-up time T_wake(d), so pre-midnight sleep belongs to the next
 * morning's recovery calculation.
 */
export const PhysiologicalCycleSchema = z
  .object({
    startWake: EpochMsSchema,
    endWake: EpochMsSchema,
    strain: StrainScoreSchema.optional(),
    recovery: RecoveryPercentSchema.optional(),
    sleepPerformance: z.number().min(SLEEP_PERFORMANCE_MIN).max(SLEEP_PERFORMANCE_MAX).optional(),
    overnightRestingHeartRate: BpmSchema.optional(),
    overnightEhrv: MillisecondsSchema.optional(),
  })
  .refine((cycle) => cycle.endWake > cycle.startWake, {
    message: 'Cycle end wake-up must be after start wake-up',
  });
export type PhysiologicalCycle = z.infer<typeof PhysiologicalCycleSchema>;

/** Closed time range used for provider queries. End must not precede start. */
export const TimeRangeSchema = z
  .object({
    start: EpochMsSchema,
    end: EpochMsSchema,
  })
  .refine((range) => range.end >= range.start, {
    message: 'Range end must not be before start',
  });
export type TimeRange = z.infer<typeof TimeRangeSchema>;

/** Machine-readable provider failure codes. */
export const WatchProviderErrorCodeSchema = z.enum([
  'NOT_CONNECTED',
  'TIMEOUT',
  'DECODE_ERROR',
  'IO_ERROR',
  'NOT_SUPPORTED',
  'UNKNOWN',
]);
export type WatchProviderErrorCode = z.infer<typeof WatchProviderErrorCodeSchema>;

/** Structured provider failure returned inside a {@link Result}. */
export const WatchProviderErrorSchema = z.object({
  code: WatchProviderErrorCodeSchema,
  message: z.string().min(1),
});
export type WatchProviderError = z.infer<typeof WatchProviderErrorSchema>;

/** Morning payload pushed back to the watch display. */
export const RecoveryNotificationInputSchema = z.object({
  recovery: RecoveryPercentSchema,
  ehrv: MillisecondsSchema,
  strainTarget: StrainScoreSchema,
});
export type RecoveryNotificationInput = z.infer<typeof RecoveryNotificationInputSchema>;

/** Recovery color tier shown in the UI. */
export const RecoveryColorTierSchema = z.enum(['green', 'yellow', 'red']);
export type RecoveryColorTier = z.infer<typeof RecoveryColorTierSchema>;

/** Recovery percent at or above this value renders green (67..99). */
export const RECOVERY_GREEN_MIN = 67;

/** Recovery percent at or above this value renders yellow (34..66); below renders red. */
export const RECOVERY_YELLOW_MIN = 34;

/** Map a recovery percent to its display color tier. */
export function getRecoveryTier(recovery: RecoveryPercent): RecoveryColorTier {
  if (recovery >= RECOVERY_GREEN_MIN) {
    return 'green';
  }
  if (recovery >= RECOVERY_YELLOW_MIN) {
    return 'yellow';
  }
  return 'red';
}
