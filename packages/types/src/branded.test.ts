import { describe, expect, it } from 'vitest';
import {
  BPM_MAX,
  BPM_MIN,
  EPOCH_MS_MIN,
  MILLISECONDS_MAX,
  MILLISECONDS_MIN,
  makeBpm,
  makeEpochMs,
  makeMilliseconds,
  makeRecoveryPercent,
  makeSpO2Percent,
  makeStrainScore,
  makeStressScore,
  RECOVERY_MAX,
  RECOVERY_MIN,
  SPO2_MAX,
  SPO2_MIN,
  STRAIN_SCORE_MAX,
  STRAIN_SCORE_MIN,
  STRESS_SCORE_MAX,
  STRESS_SCORE_MIN,
  BpmSchema,
  EpochMsSchema,
  MillisecondsSchema,
  RecoveryPercentSchema,
  SpO2PercentSchema,
  StrainScoreSchema,
  StressScoreSchema,
} from './branded.js';

describe('EpochMs', () => {
  it('accepts the Unix epoch', () => {
    expect(EpochMsSchema.parse(EPOCH_MS_MIN)).toBe(0);
  });

  it('accepts a realistic timestamp', () => {
    expect(EpochMsSchema.parse(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('rejects negative timestamps', () => {
    expect(EpochMsSchema.safeParse(-1).success).toBe(false);
  });

  it('rejects fractional timestamps', () => {
    expect(EpochMsSchema.safeParse(1_700_000_000_000.5).success).toBe(false);
  });

  it('rejects non-numbers', () => {
    for (const value of ['1700000000000', null, undefined, Number.NaN, true, {}]) {
      expect(EpochMsSchema.safeParse(value).success).toBe(false);
    }
  });

  it('makeEpochMs returns ok for valid input and err for malformed input', () => {
    const valid = makeEpochMs(1_700_000_000_000);
    expect(valid.ok).toBe(true);
    const invalid = makeEpochMs('yesterday');
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.length).toBeGreaterThan(0);
    }
  });
});

describe('Bpm', () => {
  it('accepts the boundary values', () => {
    expect(BpmSchema.parse(BPM_MIN)).toBe(25);
    expect(BpmSchema.parse(BPM_MAX)).toBe(240);
  });

  it('rejects values outside 25..240', () => {
    for (const value of [0, 24, 241, 1000, -60]) {
      expect(BpmSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects fractional heart rates', () => {
    expect(BpmSchema.safeParse(72.5).success).toBe(false);
  });

  it('rejects non-numeric inputs', () => {
    for (const value of ['72', null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(BpmSchema.safeParse(value).success).toBe(false);
    }
  });

  it('makeBpm wraps success and failure', () => {
    expect(makeBpm(72).ok).toBe(true);
    expect(makeBpm(20).ok).toBe(false);
  });
});

describe('StressScore', () => {
  it('accepts the boundary values', () => {
    expect(StressScoreSchema.parse(STRESS_SCORE_MIN)).toBe(1);
    expect(StressScoreSchema.parse(STRESS_SCORE_MAX)).toBe(99);
  });

  it('rejects values outside 1..99', () => {
    for (const value of [0, -1, 100, 250]) {
      expect(StressScoreSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects fractional stress scores', () => {
    expect(StressScoreSchema.safeParse(42.7).success).toBe(false);
  });

  it('rejects non-numeric inputs', () => {
    for (const value of ['42', null, undefined, {}, []]) {
      expect(StressScoreSchema.safeParse(value).success).toBe(false);
    }
  });

  it('makeStressScore wraps success and failure', () => {
    expect(makeStressScore(50).ok).toBe(true);
    const result = makeStressScore(0);
    expect(result.ok).toBe(false);
  });
});

describe('SpO2Percent', () => {
  it('accepts the boundary values', () => {
    expect(SpO2PercentSchema.parse(SPO2_MIN)).toBe(70);
    expect(SpO2PercentSchema.parse(SPO2_MAX)).toBe(100);
  });

  it('rejects values outside 70..100', () => {
    for (const value of [69, 0, 101, 140]) {
      expect(SpO2PercentSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects fractional saturation', () => {
    expect(SpO2PercentSchema.safeParse(97.5).success).toBe(false);
  });

  it('rejects non-numeric inputs', () => {
    for (const value of ['98', null, undefined, Number.NaN]) {
      expect(SpO2PercentSchema.safeParse(value).success).toBe(false);
    }
  });

  it('makeSpO2Percent wraps success and failure', () => {
    expect(makeSpO2Percent(98).ok).toBe(true);
    expect(makeSpO2Percent(65).ok).toBe(false);
  });
});

describe('StrainScore', () => {
  it('accepts the boundary values', () => {
    expect(StrainScoreSchema.parse(STRAIN_SCORE_MIN)).toBe(0);
    expect(StrainScoreSchema.parse(STRAIN_SCORE_MAX)).toBe(21);
  });

  it('accepts fractional strain values', () => {
    expect(StrainScoreSchema.parse(14.6)).toBe(14.6);
  });

  it('rejects values outside 0.0..21.0', () => {
    for (const value of [-0.1, -5, 21.1, 100]) {
      expect(StrainScoreSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects non-numeric or non-finite inputs', () => {
    for (const value of ['14.6', null, undefined, Number.NaN]) {
      expect(StrainScoreSchema.safeParse(value).success).toBe(false);
    }
  });

  it('makeStrainScore wraps success and failure', () => {
    expect(makeStrainScore(9.4).ok).toBe(true);
    expect(makeStrainScore(42).ok).toBe(false);
  });
});

describe('RecoveryPercent', () => {
  it('accepts the boundary values', () => {
    expect(RecoveryPercentSchema.parse(RECOVERY_MIN)).toBe(1);
    expect(RecoveryPercentSchema.parse(RECOVERY_MAX)).toBe(99);
  });

  it('rejects values outside 1..99', () => {
    for (const value of [0, -3, 100, 120]) {
      expect(RecoveryPercentSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects fractional recovery', () => {
    expect(RecoveryPercentSchema.safeParse(67.5).success).toBe(false);
  });

  it('rejects non-numeric inputs', () => {
    for (const value of ['80', null, undefined, false]) {
      expect(RecoveryPercentSchema.safeParse(value).success).toBe(false);
    }
  });

  it('makeRecoveryPercent wraps success and failure', () => {
    expect(makeRecoveryPercent(72).ok).toBe(true);
    expect(makeRecoveryPercent(0).ok).toBe(false);
  });
});

describe('Milliseconds', () => {
  it('accepts the boundary values', () => {
    expect(MillisecondsSchema.parse(MILLISECONDS_MIN)).toBe(15);
    expect(MillisecondsSchema.parse(MILLISECONDS_MAX)).toBe(180);
  });

  it('rejects values outside 15..180', () => {
    for (const value of [14, 0, 181, 500]) {
      expect(MillisecondsSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects fractional durations', () => {
    expect(MillisecondsSchema.safeParse(95.4).success).toBe(false);
  });

  it('rejects non-numeric inputs', () => {
    for (const value of ['95', null, undefined, Number.NaN]) {
      expect(MillisecondsSchema.safeParse(value).success).toBe(false);
    }
  });

  it('makeMilliseconds wraps success and failure', () => {
    expect(makeMilliseconds(110).ok).toBe(true);
    expect(makeMilliseconds(10).ok).toBe(false);
  });
});
