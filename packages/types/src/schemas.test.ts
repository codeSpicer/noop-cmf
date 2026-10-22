import { describe, expect, it } from 'vitest';
import {
  DATE_STRING_PATTERN,
  getRecoveryTier,
  HrSampleSchema,
  JournalEntrySchema,
  JOURNAL_NOTE_MAX_LENGTH,
  PhysiologicalCycleSchema,
  RecoveryColorTierSchema,
  RecoveryNotificationInputSchema,
  RECOVERY_GREEN_MIN,
  RECOVERY_YELLOW_MIN,
  SLEEP_PERFORMANCE_MAX,
  SLEEP_PERFORMANCE_MIN,
  SleepSegmentSchema,
  Spo2SampleSchema,
  StressSampleSchema,
  TimeRangeSchema,
  WatchProviderErrorSchema,
  WorkoutSchema,
} from './schemas.js';
import { RecoveryPercentSchema } from './branded.js';

const T0 = 1_700_000_000_000;
const MINUTE_MS = 60_000;

describe('DATE_STRING_PATTERN', () => {
  it('matches YYYY-MM-DD dates', () => {
    expect(DATE_STRING_PATTERN.test('2024-02-29')).toBe(true);
  });

  it('rejects non-padded or delimited variants', () => {
    for (const value of ['2024-2-9', '2024/02/29', '29-02-2024', '20240229', '']) {
      expect(DATE_STRING_PATTERN.test(value)).toBe(false);
    }
  });
});

describe('HrSampleSchema', () => {
  it('accepts a valid sample', () => {
    expect(HrSampleSchema.parse({ timestamp: T0, bpm: 72 })).toEqual({ timestamp: T0, bpm: 72 });
  });

  it('rejects out-of-range heart rates', () => {
    expect(HrSampleSchema.safeParse({ timestamp: T0, bpm: 20 }).success).toBe(false);
    expect(HrSampleSchema.safeParse({ timestamp: T0, bpm: 300 }).success).toBe(false);
  });

  it('rejects fractional heart rates and negative timestamps', () => {
    expect(HrSampleSchema.safeParse({ timestamp: T0, bpm: 72.5 }).success).toBe(false);
    expect(HrSampleSchema.safeParse({ timestamp: -1, bpm: 72 }).success).toBe(false);
  });

  it('rejects missing fields and wrong field types', () => {
    expect(HrSampleSchema.safeParse({ bpm: 72 }).success).toBe(false);
    expect(HrSampleSchema.safeParse({ timestamp: T0 }).success).toBe(false);
    expect(HrSampleSchema.safeParse({ timestamp: 'x', bpm: 'y' }).success).toBe(false);
    expect(HrSampleSchema.safeParse(null).success).toBe(false);
  });

  it('strips unknown extra keys', () => {
    expect(HrSampleSchema.parse({ timestamp: T0, bpm: 72, device: 'watch' })).toEqual({
      timestamp: T0,
      bpm: 72,
    });
  });
});

describe('StressSampleSchema', () => {
  it('accepts a valid sample', () => {
    expect(StressSampleSchema.parse({ timestamp: T0, stress: 42 })).toEqual({
      timestamp: T0,
      stress: 42,
    });
  });

  it('rejects out-of-range stress scores', () => {
    expect(StressSampleSchema.safeParse({ timestamp: T0, stress: 0 }).success).toBe(false);
    expect(StressSampleSchema.safeParse({ timestamp: T0, stress: 100 }).success).toBe(false);
  });

  it('rejects malformed payloads', () => {
    expect(StressSampleSchema.safeParse({ timestamp: T0, stress: 3.5 }).success).toBe(false);
    expect(StressSampleSchema.safeParse({ timestamp: T0 }).success).toBe(false);
    expect(StressSampleSchema.safeParse({ stress: 50 }).success).toBe(false);
    expect(StressSampleSchema.safeParse({ timestamp: 't', stress: 's' }).success).toBe(false);
  });
});

describe('Spo2SampleSchema', () => {
  it('accepts a valid sample', () => {
    expect(Spo2SampleSchema.parse({ timestamp: T0, spo2: 98 })).toEqual({
      timestamp: T0,
      spo2: 98,
    });
  });

  it('rejects out-of-range saturation', () => {
    expect(Spo2SampleSchema.safeParse({ timestamp: T0, spo2: 69 }).success).toBe(false);
    expect(Spo2SampleSchema.safeParse({ timestamp: T0, spo2: 101 }).success).toBe(false);
  });

  it('rejects malformed payloads', () => {
    expect(Spo2SampleSchema.safeParse({ timestamp: T0, spo2: 97.5 }).success).toBe(false);
    expect(Spo2SampleSchema.safeParse({ timestamp: T0 }).success).toBe(false);
    expect(Spo2SampleSchema.safeParse({ timestamp: Number.NaN, spo2: 98 }).success).toBe(false);
  });
});

describe('SleepSegmentSchema', () => {
  it('accepts every sleep stage', () => {
    for (const stage of ['awake', 'light', 'deep', 'rem'] as const) {
      expect(SleepSegmentSchema.parse({ start: T0, end: T0 + MINUTE_MS, stage })).toEqual({
        start: T0,
        end: T0 + MINUTE_MS,
        stage,
      });
    }
  });

  it('rejects an end that is not after the start', () => {
    expect(SleepSegmentSchema.safeParse({ start: T0, end: T0, stage: 'deep' }).success).toBe(false);
    expect(
      SleepSegmentSchema.safeParse({ start: T0 + MINUTE_MS, end: T0, stage: 'rem' }).success,
    ).toBe(false);
  });

  it('rejects unknown stages and malformed timestamps', () => {
    expect(
      SleepSegmentSchema.safeParse({ start: T0, end: T0 + MINUTE_MS, stage: 'drowsy' }).success,
    ).toBe(false);
    expect(
      SleepSegmentSchema.safeParse({ start: T0, end: T0 + MINUTE_MS, stage: 'LIGHT' }).success,
    ).toBe(false);
    expect(
      SleepSegmentSchema.safeParse({ start: -5, end: T0 + MINUTE_MS, stage: 'light' }).success,
    ).toBe(false);
    expect(SleepSegmentSchema.safeParse({ start: T0, end: 'later', stage: 'light' }).success).toBe(
      false,
    );
  });
});

describe('WorkoutSchema', () => {
  const validWorkout = {
    id: 'w-1',
    start: T0,
    end: T0 + 30 * MINUTE_MS,
    activityType: 'run',
  };

  it('accepts a minimal workout plus optional fields', () => {
    expect(WorkoutSchema.parse(validWorkout)).toEqual(validWorkout);
    expect(WorkoutSchema.parse({ ...validWorkout, averageHeartRate: 150, calories: 320 })).toEqual({
      ...validWorkout,
      averageHeartRate: 150,
      calories: 320,
    });
  });

  it('rejects empty identifiers and activity types', () => {
    expect(WorkoutSchema.safeParse({ ...validWorkout, id: '' }).success).toBe(false);
    expect(WorkoutSchema.safeParse({ ...validWorkout, activityType: '' }).success).toBe(false);
  });

  it('rejects an end that is not after the start', () => {
    expect(WorkoutSchema.safeParse({ ...validWorkout, end: T0 }).success).toBe(false);
    expect(WorkoutSchema.safeParse({ ...validWorkout, end: T0 - MINUTE_MS }).success).toBe(false);
  });

  it('rejects invalid optional fields', () => {
    expect(WorkoutSchema.safeParse({ ...validWorkout, averageHeartRate: 20 }).success).toBe(false);
    expect(WorkoutSchema.safeParse({ ...validWorkout, averageHeartRate: 150.5 }).success).toBe(
      false,
    );
    expect(WorkoutSchema.safeParse({ ...validWorkout, calories: -10 }).success).toBe(false);
    expect(WorkoutSchema.safeParse({ ...validWorkout, calories: 10.5 }).success).toBe(false);
  });

  it('rejects missing or mistyped required fields', () => {
    expect(WorkoutSchema.safeParse({ start: T0, end: T0 + MINUTE_MS }).success).toBe(false);
    expect(WorkoutSchema.safeParse({ ...validWorkout, start: 'now', end: 'later' }).success).toBe(
      false,
    );
  });
});

describe('JournalEntrySchema', () => {
  it('accepts habits with an optional note', () => {
    expect(
      JournalEntrySchema.parse({
        date: '2024-03-01',
        habits: { alcohol: false, caffeine: true },
      }),
    ).toEqual({ date: '2024-03-01', habits: { alcohol: false, caffeine: true } });
    expect(
      JournalEntrySchema.parse({ date: '2024-03-01', habits: {}, note: 'rested well' }),
    ).toEqual({ date: '2024-03-01', habits: {}, note: 'rested well' });
  });

  it('rejects malformed dates', () => {
    for (const date of ['2024-3-1', '03/01/2024', '20240301', '', 'tomorrow']) {
      expect(JournalEntrySchema.safeParse({ date, habits: {} }).success).toBe(false);
    }
  });

  it('rejects empty habit keys, non-boolean values, and non-object habits', () => {
    expect(JournalEntrySchema.safeParse({ date: '2024-03-01', habits: { '': true } }).success).toBe(
      false,
    );
    expect(
      JournalEntrySchema.safeParse({ date: '2024-03-01', habits: { alcohol: 'no' } }).success,
    ).toBe(false);
    expect(JournalEntrySchema.safeParse({ date: '2024-03-01', habits: [] }).success).toBe(false);
    expect(JournalEntrySchema.safeParse({ date: '2024-03-01' }).success).toBe(false);
  });

  it('rejects notes that exceed the maximum length', () => {
    const tooLong = 'n'.repeat(JOURNAL_NOTE_MAX_LENGTH + 1);
    expect(
      JournalEntrySchema.safeParse({ date: '2024-03-01', habits: {}, note: tooLong }).success,
    ).toBe(false);
    const exactlyMax = 'n'.repeat(JOURNAL_NOTE_MAX_LENGTH);
    expect(
      JournalEntrySchema.safeParse({ date: '2024-03-01', habits: {}, note: exactlyMax }).success,
    ).toBe(true);
  });
});

describe('PhysiologicalCycleSchema', () => {
  it('accepts wake-to-wake boundaries with all optional metrics', () => {
    const parsed = PhysiologicalCycleSchema.parse({
      startWake: T0,
      endWake: T0 + 24 * 60 * MINUTE_MS,
      strain: 12.4,
      recovery: 72,
      sleepPerformance: 88,
      overnightRestingHeartRate: 48,
      overnightEhrv: 110,
    });
    expect(parsed.strain).toBe(12.4);
    expect(parsed.recovery).toBe(72);
  });

  it('accepts a minimal cycle without optional metrics', () => {
    expect(PhysiologicalCycleSchema.parse({ startWake: T0, endWake: T0 + 1 })).toEqual({
      startWake: T0,
      endWake: T0 + 1,
    });
  });

  it('rejects an end wake-up that is not after the start', () => {
    expect(PhysiologicalCycleSchema.safeParse({ startWake: T0, endWake: T0 }).success).toBe(false);
    expect(PhysiologicalCycleSchema.safeParse({ startWake: T0 + 1, endWake: T0 }).success).toBe(
      false,
    );
  });

  it('rejects out-of-range optional metrics', () => {
    const base = { startWake: T0, endWake: T0 + 1 };
    expect(PhysiologicalCycleSchema.safeParse({ ...base, strain: 21.1 }).success).toBe(false);
    expect(PhysiologicalCycleSchema.safeParse({ ...base, recovery: 0 }).success).toBe(false);
    expect(
      PhysiologicalCycleSchema.safeParse({ ...base, sleepPerformance: SLEEP_PERFORMANCE_MIN - 1 })
        .success,
    ).toBe(false);
    expect(
      PhysiologicalCycleSchema.safeParse({ ...base, sleepPerformance: SLEEP_PERFORMANCE_MAX + 1 })
        .success,
    ).toBe(false);
    expect(
      PhysiologicalCycleSchema.safeParse({ ...base, overnightRestingHeartRate: 20 }).success,
    ).toBe(false);
    expect(PhysiologicalCycleSchema.safeParse({ ...base, overnightEhrv: 200 }).success).toBe(false);
  });

  it('accepts sleep performance boundaries', () => {
    expect(
      PhysiologicalCycleSchema.safeParse({
        startWake: T0,
        endWake: T0 + 1,
        sleepPerformance: SLEEP_PERFORMANCE_MIN,
      }).success,
    ).toBe(true);
    expect(
      PhysiologicalCycleSchema.safeParse({
        startWake: T0,
        endWake: T0 + 1,
        sleepPerformance: SLEEP_PERFORMANCE_MAX,
      }).success,
    ).toBe(true);
  });
});

describe('TimeRangeSchema', () => {
  it('accepts normal and zero-length ranges', () => {
    expect(TimeRangeSchema.parse({ start: T0, end: T0 + MINUTE_MS })).toEqual({
      start: T0,
      end: T0 + MINUTE_MS,
    });
    expect(TimeRangeSchema.parse({ start: T0, end: T0 })).toEqual({ start: T0, end: T0 });
  });

  it('rejects inverted ranges and malformed values', () => {
    expect(TimeRangeSchema.safeParse({ start: T0 + 1, end: T0 }).success).toBe(false);
    expect(TimeRangeSchema.safeParse({ start: -1, end: T0 }).success).toBe(false);
    expect(TimeRangeSchema.safeParse({ start: T0 }).success).toBe(false);
    expect(TimeRangeSchema.safeParse({ start: 'a', end: 'b' }).success).toBe(false);
  });
});

describe('WatchProviderErrorSchema', () => {
  it('accepts every known error code', () => {
    for (const code of [
      'NOT_CONNECTED',
      'TIMEOUT',
      'DECODE_ERROR',
      'IO_ERROR',
      'NOT_SUPPORTED',
      'UNKNOWN',
    ] as const) {
      expect(WatchProviderErrorSchema.parse({ code, message: 'details' })).toEqual({
        code,
        message: 'details',
      });
    }
  });

  it('rejects unknown codes and empty messages', () => {
    expect(WatchProviderErrorSchema.safeParse({ code: 'OFFLINE', message: 'x' }).success).toBe(
      false,
    );
    expect(WatchProviderErrorSchema.safeParse({ code: 'TIMEOUT', message: '' }).success).toBe(
      false,
    );
    expect(WatchProviderErrorSchema.safeParse({ code: 'TIMEOUT' }).success).toBe(false);
    expect(WatchProviderErrorSchema.safeParse({ message: 'x' }).success).toBe(false);
  });
});

describe('RecoveryNotificationInputSchema', () => {
  it('accepts a valid morning payload', () => {
    expect(
      RecoveryNotificationInputSchema.parse({ recovery: 72, ehrv: 110, strainTarget: 14.6 }),
    ).toEqual({ recovery: 72, ehrv: 110, strainTarget: 14.6 });
  });

  it('rejects out-of-range fields', () => {
    expect(
      RecoveryNotificationInputSchema.safeParse({ recovery: 100, ehrv: 110, strainTarget: 10 })
        .success,
    ).toBe(false);
    expect(
      RecoveryNotificationInputSchema.safeParse({ recovery: 72, ehrv: 10, strainTarget: 10 })
        .success,
    ).toBe(false);
    expect(
      RecoveryNotificationInputSchema.safeParse({ recovery: 72, ehrv: 110, strainTarget: 30 })
        .success,
    ).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(RecoveryNotificationInputSchema.safeParse({ recovery: 72, ehrv: 110 }).success).toBe(
      false,
    );
  });
});

describe('RecoveryColorTierSchema and getRecoveryTier', () => {
  it('accepts the three tiers', () => {
    expect(RecoveryColorTierSchema.parse('green')).toBe('green');
    expect(RecoveryColorTierSchema.parse('yellow')).toBe('yellow');
    expect(RecoveryColorTierSchema.parse('red')).toBe('red');
  });

  it('rejects unknown tiers', () => {
    for (const value of ['GREEN', 'amber', '', null]) {
      expect(RecoveryColorTierSchema.safeParse(value).success).toBe(false);
    }
  });

  it('maps green, yellow, and red boundaries correctly', () => {
    expect(getRecoveryTier(RecoveryPercentSchema.parse(RECOVERY_GREEN_MIN))).toBe('green');
    expect(getRecoveryTier(RecoveryPercentSchema.parse(99))).toBe('green');
    expect(getRecoveryTier(RecoveryPercentSchema.parse(RECOVERY_YELLOW_MIN))).toBe('yellow');
    expect(getRecoveryTier(RecoveryPercentSchema.parse(RECOVERY_GREEN_MIN - 1))).toBe('yellow');
    expect(getRecoveryTier(RecoveryPercentSchema.parse(RECOVERY_YELLOW_MIN - 1))).toBe('red');
    expect(getRecoveryTier(RecoveryPercentSchema.parse(1))).toBe('red');
  });
});
