/**
 * Unified data-source contract implemented by every watch backend
 * (WebBLE live transport, Gadgetbridge SQLite import, seeded simulator).
 */
import type { Result } from './result.js';
import type {
  HrSample,
  RecoveryNotificationInput,
  SleepSegment,
  Spo2Sample,
  StressSample,
  TimeRange,
  WatchProviderError,
  Workout,
} from './schemas.js';

export interface WatchDataProvider {
  /** Stable machine identifier, e.g. `cmf-ble`, `gadgetbridge`, `simulator`. */
  readonly id: string;

  /** Human-readable label shown in the sync UI. */
  readonly label: string;

  /** Open the underlying transport. Idempotent. */
  connect(): Promise<Result<void, WatchProviderError>>;

  /** Close the underlying transport. Idempotent. */
  disconnect(): Promise<Result<void, WatchProviderError>>;

  /** Heart-rate samples overlapping the range, ascending by timestamp. */
  getHeartRateSamples(range: TimeRange): Promise<Result<HrSample[], WatchProviderError>>;

  /** Stress samples overlapping the range, ascending by timestamp. */
  getStressSamples(range: TimeRange): Promise<Result<StressSample[], WatchProviderError>>;

  /** SpO2 samples overlapping the range, ascending by timestamp. */
  getSpo2Samples(range: TimeRange): Promise<Result<Spo2Sample[], WatchProviderError>>;

  /** Sleep segments overlapping the range, ascending by start time. */
  getSleepSegments(range: TimeRange): Promise<Result<SleepSegment[], WatchProviderError>>;

  /** Workouts overlapping the range, ascending by start time. */
  getWorkouts(range: TimeRange): Promise<Result<Workout[], WatchProviderError>>;

  /** Push the morning recovery payload back to the watch display. */
  pushRecoveryNotification(
    input: RecoveryNotificationInput,
  ): Promise<Result<void, WatchProviderError>>;
}
