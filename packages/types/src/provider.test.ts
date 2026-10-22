import { describe, expect, it, vi } from 'vitest';
import type { Result } from './result.js';
import type { WatchDataProvider } from './provider.js';
import {
  BpmSchema,
  EpochMsSchema,
  MillisecondsSchema,
  RecoveryPercentSchema,
  SpO2PercentSchema,
  StrainScoreSchema,
  StressScoreSchema,
} from './branded.js';
import { RecoveryNotificationInputSchema, TimeRangeSchema } from './schemas.js';
import type {
  HrSample,
  SleepSegment,
  Spo2Sample,
  StressSample,
  TimeRange,
  WatchProviderError,
  Workout,
} from './schemas.js';

const okVoid: Result<void, WatchProviderError> = { ok: true, value: undefined };
const START = EpochMsSchema.parse(1_700_000_000_000);
const MID = EpochMsSchema.parse(1_700_000_600_000);
const LATER = EpochMsSchema.parse(1_700_001_800_000);
const RANGE_END = EpochMsSchema.parse(1_700_008_000_000);

describe('WatchDataProvider contract', () => {
  it('supports a structural implementation with typed Results', async () => {
    const hrSamples: HrSample[] = [{ timestamp: START, bpm: BpmSchema.parse(60) }];
    const stressSamples: StressSample[] = [
      { timestamp: START, stress: StressScoreSchema.parse(30) },
    ];
    const spo2Samples: Spo2Sample[] = [{ timestamp: START, spo2: SpO2PercentSchema.parse(98) }];
    const sleepSegments: SleepSegment[] = [{ start: START, end: MID, stage: 'deep' }];
    const workouts: Workout[] = [
      {
        id: 'w-1',
        start: START,
        end: LATER,
        activityType: 'run',
      },
    ];

    const provider: WatchDataProvider = {
      id: 'test-provider',
      label: 'Test Provider',
      connect: vi.fn(() => Promise.resolve(okVoid)),
      disconnect: vi.fn(() => Promise.resolve(okVoid)),
      getHeartRateSamples: vi.fn(() => Promise.resolve({ ok: true as const, value: hrSamples })),
      getStressSamples: vi.fn(() => Promise.resolve({ ok: true as const, value: stressSamples })),
      getSpo2Samples: vi.fn(() => Promise.resolve({ ok: true as const, value: spo2Samples })),
      getSleepSegments: vi.fn(() => Promise.resolve({ ok: true as const, value: sleepSegments })),
      getWorkouts: vi.fn(() => Promise.resolve({ ok: true as const, value: workouts })),
      pushRecoveryNotification: vi.fn(() => Promise.resolve(okVoid)),
    };

    const range: TimeRange = TimeRangeSchema.parse({ start: START, end: RANGE_END });
    const notification = RecoveryNotificationInputSchema.parse({
      recovery: RecoveryPercentSchema.parse(75),
      ehrv: MillisecondsSchema.parse(100),
      strainTarget: StrainScoreSchema.parse(12.5),
    });

    expect(await provider.connect()).toEqual(okVoid);
    expect(await provider.getHeartRateSamples(range)).toEqual({ ok: true, value: hrSamples });
    expect(await provider.getStressSamples(range)).toEqual({ ok: true, value: stressSamples });
    expect(await provider.getSpo2Samples(range)).toEqual({ ok: true, value: spo2Samples });
    expect(await provider.getSleepSegments(range)).toEqual({ ok: true, value: sleepSegments });
    expect(await provider.getWorkouts(range)).toEqual({ ok: true, value: workouts });
    expect(await provider.pushRecoveryNotification(notification)).toEqual(okVoid);
    expect(await provider.disconnect()).toEqual(okVoid);
  });

  it('propagates typed provider errors', async () => {
    const failure = {
      ok: false as const,
      error: { code: 'NOT_CONNECTED', message: 'pair the watch first' } as WatchProviderError,
    };
    const provider: WatchDataProvider = {
      id: 'failing',
      label: 'Failing',
      connect: () =>
        Promise.resolve({
          ok: false as const,
          error: { code: 'TIMEOUT', message: 'timed out' },
        }),
      disconnect: () => Promise.resolve(okVoid),
      getHeartRateSamples: () => Promise.resolve(failure),
      getStressSamples: () => Promise.resolve(failure),
      getSpo2Samples: () => Promise.resolve(failure),
      getSleepSegments: () => Promise.resolve(failure),
      getWorkouts: () => Promise.resolve(failure),
      pushRecoveryNotification: () => Promise.resolve(okVoid),
    };

    const result = await provider.getHeartRateSamples(
      TimeRangeSchema.parse({ start: START, end: EpochMsSchema.parse(1_700_000_000_001) }),
    );
    expect(result).toEqual(failure);
  });
});
