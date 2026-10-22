import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { BpmSchema, EpochMsSchema, STRAIN_SCORE_MAX } from '@noop-cmf/types';
import {
  assertValidBaselines,
  banisterTrimp,
  classifyHrZone,
  computeDayStrain,
  hrRatio,
  STRAIN_CURVE_DIVISOR,
  STRAIN_CURVE_GAIN,
  TRIMP_MIN_HR_RATIO,
  ZONE_2_MIN,
  ZONE_3_MIN,
  ZONE_4_MIN,
  ZONE_5_MIN,
  type HrSampleInput,
} from './strain.js';

const RHR = 50;
const HR_MAX = 190;

function sampleAt(minute: number, bpm: number): HrSampleInput {
  return {
    timestamp: EpochMsSchema.parse(1_700_000_000_000 + minute * 60_000),
    bpm: BpmSchema.parse(bpm),
  };
}

describe('hrRatio', () => {
  it('maps resting to 0 and max to 1', () => {
    expect(hrRatio(RHR, RHR, HR_MAX)).toBe(0);
    expect(hrRatio(HR_MAX, RHR, HR_MAX)).toBe(1);
  });

  it('clamps below-resting and above-max values', () => {
    expect(hrRatio(30, RHR, HR_MAX)).toBe(0);
    expect(hrRatio(250, RHR, HR_MAX)).toBe(1);
  });

  it('returns 0 for degenerate baselines instead of NaN', () => {
    expect(hrRatio(120, 60, 60)).toBe(0);
    expect(hrRatio(120, 70, 60)).toBe(0);
  });
});

describe('classifyHrZone', () => {
  it('classifies each zone at its lower bound', () => {
    const span = HR_MAX - RHR;
    expect(classifyHrZone(RHR, RHR, HR_MAX)).toBe(1);
    expect(classifyHrZone(Math.ceil(RHR + span * ZONE_2_MIN), RHR, HR_MAX)).toBe(2);
    expect(classifyHrZone(Math.ceil(RHR + span * ZONE_3_MIN), RHR, HR_MAX)).toBe(3);
    expect(classifyHrZone(Math.ceil(RHR + span * ZONE_4_MIN), RHR, HR_MAX)).toBe(4);
    expect(classifyHrZone(Math.ceil(RHR + span * ZONE_5_MIN), RHR, HR_MAX)).toBe(5);
  });

  it('floors sub-threshold effort into zone 1', () => {
    expect(classifyHrZone(RHR + 5, RHR, HR_MAX)).toBe(1);
  });
});

describe('banisterTrimp', () => {
  it('ignores samples below the 0.30 HR-ratio floor', () => {
    const samples = [sampleAt(0, RHR + 5), sampleAt(1, RHR + 10)];
    expect(banisterTrimp(samples, RHR, HR_MAX)).toBe(0);
  });

  it('accumulates TRIMP for a sustained zone-4 effort', () => {
    const hr = Math.round(RHR + (HR_MAX - RHR) * 0.85);
    const samples = Array.from({ length: 30 }, (_, i) => sampleAt(i, hr));
    const trimp = banisterTrimp(samples, RHR, HR_MAX);
    expect(trimp).toBeGreaterThan(0);
    expect(trimp).toBeLessThan(1000);
  });

  it('scales linearly with duration for identical effort', () => {
    const hr = 160;
    const ten = Array.from({ length: 10 }, (_, i) => sampleAt(i, hr));
    const twenty = Array.from({ length: 20 }, (_, i) => sampleAt(i, hr));
    expect(banisterTrimp(twenty, RHR, HR_MAX)).toBeCloseTo(2 * banisterTrimp(ten, RHR, HR_MAX), 10);
  });

  it('returns 0 for empty input', () => {
    expect(banisterTrimp([], RHR, HR_MAX)).toBe(0);
  });
});

describe('computeDayStrain', () => {
  it('returns zero strain for a rest day', () => {
    const samples = Array.from({ length: 60 }, (_, i) => sampleAt(i, 55));
    const result = computeDayStrain(samples, RHR, HR_MAX);
    expect(result.strain).toBe(0);
    expect(result.trimp).toBe(0);
    expect(result.zoneMinutes[1]).toBe(60);
  });

  it('matches the hand-computed spec formula', () => {
    const samples = Array.from({ length: 30 }, (_, i) => sampleAt(i, 160));
    const { trimp, strain } = computeDayStrain(samples, RHR, HR_MAX);
    const expected = Math.min(
      STRAIN_SCORE_MAX,
      Math.round(STRAIN_CURVE_GAIN * Math.log(1 + trimp / STRAIN_CURVE_DIVISOR) * 10) / 10,
    );
    expect(strain).toBe(expected);
  });

  it('caps extreme multi-hour efforts at 21.0', () => {
    const samples = Array.from({ length: 600 }, (_, i) => sampleAt(i, 185));
    const result = computeDayStrain(samples, RHR, HR_MAX);
    expect(result.strain).toBeLessThanOrEqual(STRAIN_SCORE_MAX);
  });

  it('tallies zone minutes across all samples', () => {
    const samples = [sampleAt(0, 55), sampleAt(1, 160), sampleAt(2, 180)];
    const { zoneMinutes } = computeDayStrain(samples, RHR, HR_MAX);
    const total =
      zoneMinutes[1] + zoneMinutes[2] + zoneMinutes[3] + zoneMinutes[4] + zoneMinutes[5];
    expect(total).toBe(3);
  });
});

describe('assertValidBaselines', () => {
  it('accepts sane baselines', () => {
    expect(() => {
      assertValidBaselines(50, 190);
    }).not.toThrow();
  });

  it('rejects out-of-range or non-finite baselines', () => {
    expect(() => {
      assertValidBaselines(10, 190);
    }).toThrow(RangeError);
    expect(() => {
      assertValidBaselines(50, 300);
    }).toThrow(RangeError);
    expect(() => {
      assertValidBaselines(Number.NaN, 190);
    }).toThrow(RangeError);
    expect(() => {
      assertValidBaselines(50, Number.POSITIVE_INFINITY);
    }).toThrow(RangeError);
  });
});

describe('strain properties', () => {
  const hrArb = fc.integer({ min: 25, max: 240 });
  const rhrArb = fc.integer({ min: 40, max: 80 });
  const hrMaxArb = fc.integer({ min: 170, max: 210 });

  it('strain is always within [0.0, 21.0]', () => {
    fc.assert(
      fc.property(
        fc.array(hrArb, { minLength: 0, maxLength: 120 }),
        rhrArb,
        hrMaxArb,
        (hrValues, rhr, hrMax) => {
          const samples = hrValues.map((bpm, i) => sampleAt(i, bpm));
          const { strain } = computeDayStrain(samples, rhr, hrMax);
          expect(strain).toBeGreaterThanOrEqual(0);
          expect(strain).toBeLessThanOrEqual(21.0);
          expect(Number.isFinite(strain)).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('strain is monotonically non-decreasing when high-HR samples are appended', () => {
    fc.assert(
      fc.property(
        fc.array(hrArb, { minLength: 0, maxLength: 60 }),
        fc.array(fc.integer({ min: 170, max: 200 }), { minLength: 1, maxLength: 30 }),
        rhrArb,
        hrMaxArb,
        (base, extra, rhr, hrMax) => {
          const baseSamples = base.map((bpm, i) => sampleAt(i, bpm));
          const extraSamples = extra.map((bpm, i) => sampleAt(base.length + i, bpm));
          const before = computeDayStrain(baseSamples, rhr, hrMax).strain;
          const after = computeDayStrain([...baseSamples, ...extraSamples], rhr, hrMax).strain;
          expect(after).toBeGreaterThanOrEqual(before);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('below-floor samples never accrue TRIMP', () => {
    fc.assert(
      fc.property(rhrArb, hrMaxArb, (rhr, hrMax) => {
        fc.pre(hrMax > rhr);
        const floorHr = Math.floor(rhr + (hrMax - rhr) * (TRIMP_MIN_HR_RATIO - 0.01));
        const samples = [sampleAt(0, Math.max(25, Math.min(240, floorHr)))];
        const ratio = hrRatio(samples[0]?.bpm ?? rhr, rhr, hrMax);
        fc.pre(ratio < TRIMP_MIN_HR_RATIO);
        expect(banisterTrimp(samples, rhr, hrMax)).toBe(0);
      }),
      { numRuns: 500 },
    );
  });
});
