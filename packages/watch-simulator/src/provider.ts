/**
 * In-memory {@link WatchDataProvider} backed by a {@link SimulatedDataset}.
 *
 * `connect` / `disconnect` are idempotent state flips; query methods slice
 * the pre-generated arrays. An optional artificial latency keeps the async
 * contract honest for UI testing.
 */
import {
  RecoveryNotificationInputSchema,
  TimeRangeSchema,
  type HrSample,
  type Logger,
  type RecoveryNotificationInput,
  type SleepSegment,
  type Spo2Sample,
  type StressSample,
  type TimeRange,
  type WatchDataProvider,
  type WatchProviderError,
  type Workout,
} from '@noop-cmf/types';
import { err, ok, type Result } from '@noop-cmf/types';
import { noopLogger } from '@noop-cmf/types';
import { generateDataset, type PersonaId, type SimulatedDataset } from './generator.js';

/** Machine identifier reported by the simulated provider. */
export const SIMULATED_PROVIDER_ID = 'simulator';

/** Human-readable label reported by the simulated provider. */
export const SIMULATED_PROVIDER_LABEL = 'Simulated Watch';

/** Options for {@link SimulatedWatchProvider}. */
export interface SimulatedProviderOptions {
  readonly persona: PersonaId;
  readonly seed?: number | undefined;
  readonly anchorEpochMs: SimulatedDataset['anchorEpochMs'];
  readonly days?: number | undefined;
  readonly latencyMs?: number | undefined;
  readonly logger?: Logger | undefined;
}

export class SimulatedWatchProvider implements WatchDataProvider {
  readonly id = SIMULATED_PROVIDER_ID;
  readonly label = SIMULATED_PROVIDER_LABEL;

  private readonly dataset: SimulatedDataset;
  private readonly latencyMs: number;
  private readonly logger: Logger;
  private connected = false;
  private lastNotification: RecoveryNotificationInput | undefined;

  constructor(options: SimulatedProviderOptions) {
    const latency = options.latencyMs ?? 0;
    this.latencyMs = latency;
    this.logger = options.logger ?? noopLogger;
    this.dataset = generateDataset({
      persona: options.persona,
      seed: options.seed,
      anchorEpochMs: options.anchorEpochMs,
      days: options.days,
    });
  }

  /** The full pre-generated dataset backing this provider instance. */
  getDataset(): SimulatedDataset {
    return this.dataset;
  }

  /** Most recent recovery payload received via {@link pushRecoveryNotification}. */
  getLastNotification(): RecoveryNotificationInput | undefined {
    return this.lastNotification;
  }

  async connect(): Promise<Result<void, WatchProviderError>> {
    await this.pause();
    if (!this.connected) {
      this.connected = true;
      this.logger.info('simulator connected', { persona: this.dataset.persona });
    }
    return ok(undefined);
  }

  async disconnect(): Promise<Result<void, WatchProviderError>> {
    await this.pause();
    if (this.connected) {
      this.connected = false;
      this.logger.info('simulator disconnected', { persona: this.dataset.persona });
    }
    return ok(undefined);
  }

  async getHeartRateSamples(range: TimeRange): Promise<Result<HrSample[], WatchProviderError>> {
    return this.query(range, this.dataset.hrSamples, (sample) => sample.timestamp, 'heart-rate');
  }

  async getStressSamples(range: TimeRange): Promise<Result<StressSample[], WatchProviderError>> {
    return this.query(range, this.dataset.stressSamples, (sample) => sample.timestamp, 'stress');
  }

  async getSpo2Samples(range: TimeRange): Promise<Result<Spo2Sample[], WatchProviderError>> {
    return this.query(range, this.dataset.spo2Samples, (sample) => sample.timestamp, 'spo2');
  }

  async getSleepSegments(range: TimeRange): Promise<Result<SleepSegment[], WatchProviderError>> {
    const parsed = TimeRangeSchema.safeParse(range);
    if (!parsed.success) {
      return err({ code: 'DECODE_ERROR', message: 'Invalid time range' });
    }
    const gate = this.requireConnection();
    if (gate) {
      return gate;
    }
    await this.pause();
    const { start, end } = parsed.data;
    return ok(
      this.dataset.sleepSegments.filter((segment) => segment.start < end && segment.end > start),
    );
  }

  async getWorkouts(range: TimeRange): Promise<Result<Workout[], WatchProviderError>> {
    const parsed = TimeRangeSchema.safeParse(range);
    if (!parsed.success) {
      return err({ code: 'DECODE_ERROR', message: 'Invalid time range' });
    }
    const gate = this.requireConnection();
    if (gate) {
      return gate;
    }
    await this.pause();
    const { start, end } = parsed.data;
    return ok(
      this.dataset.workouts.filter((workout) => workout.start < end && workout.end > start),
    );
  }

  async pushRecoveryNotification(
    input: RecoveryNotificationInput,
  ): Promise<Result<void, WatchProviderError>> {
    const parsed = RecoveryNotificationInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ code: 'DECODE_ERROR', message: 'Invalid recovery payload' });
    }
    const gate = this.requireConnection();
    if (gate) {
      return gate;
    }
    await this.pause();
    this.lastNotification = parsed.data;
    this.logger.info('recovery notification pushed', {
      recovery: parsed.data.recovery,
      ehrv: parsed.data.ehrv,
    });
    return ok(undefined);
  }

  private requireConnection(): Result<never, WatchProviderError> | undefined {
    if (!this.connected) {
      return err({ code: 'NOT_CONNECTED', message: 'Simulated watch is not connected' });
    }
    return undefined;
  }

  private async query<T>(
    range: TimeRange,
    samples: readonly T[],
    timestampOf: (sample: T) => number,
    kind: string,
  ): Promise<Result<T[], WatchProviderError>> {
    const parsed = TimeRangeSchema.safeParse(range);
    if (!parsed.success) {
      return err({ code: 'DECODE_ERROR', message: 'Invalid time range' });
    }
    const gate = this.requireConnection();
    if (gate) {
      return gate;
    }
    await this.pause();
    const { start, end } = parsed.data;
    this.logger.debug(`simulator query ${kind}`, { start, end });
    return ok(
      samples.filter((sample) => {
        const timestamp = timestampOf(sample);
        return timestamp >= start && timestamp < end;
      }),
    );
  }

  private async pause(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, this.latencyMs);
      });
    }
  }
}
