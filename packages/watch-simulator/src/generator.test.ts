import { describe, expect, it } from 'vitest';
import { EpochMsSchema, HrSampleSchema } from '@noop-cmf/types';
import {
  DEFAULT_SEED,
  generateDataset,
  MS_PER_DAY,
  SIMULATION_DAYS,
  SPO2_CADENCE_MINUTES,
  STRESS_CADENCE_MINUTES,
  type PersonaId,
} from './generator.js';

const ANCHOR = EpochMsSchema.parse(1_700_000_000_000);
const PERSONAS: PersonaId[] = ['endurance-runner', 'peak-recovery', 'overreaching'];

describe('generateDataset', () => {
  it('defaults to seed 42 and 30 days', () => {
    const dataset = generateDataset({ persona: 'endurance-runner', anchorEpochMs: ANCHOR });
    expect(dataset.seed).toBe(DEFAULT_SEED);
    expect(dataset.days).toBe(SIMULATION_DAYS);
    expect(dataset.wakeTimes).toHaveLength(SIMULATION_DAYS);
  });

  it('produces byte-identical datasets for the same seed across runs', () => {
    const first = generateDataset({ persona: 'endurance-runner', seed: 42, anchorEpochMs: ANCHOR });
    const second = generateDataset({
      persona: 'endurance-runner',
      seed: 42,
      anchorEpochMs: ANCHOR,
    });
    expect(second).toEqual(first);
  });

  it('differs between seeds and personas', () => {
    const base = generateDataset({ persona: 'endurance-runner', seed: 42, anchorEpochMs: ANCHOR });
    const otherSeed = generateDataset({
      persona: 'endurance-runner',
      seed: 43,
      anchorEpochMs: ANCHOR,
    });
    expect(otherSeed.hrSamples).not.toEqual(base.hrSamples);
    const otherPersona = generateDataset({
      persona: 'peak-recovery',
      seed: 42,
      anchorEpochMs: ANCHOR,
    });
    expect(otherPersona.workouts).not.toEqual(base.workouts);
  });

  it('validates every sample through Zod schemas', () => {
    const dataset = generateDataset({ persona: 'peak-recovery', seed: 42, anchorEpochMs: ANCHOR });
    for (const sample of dataset.hrSamples) {
      expect(HrSampleSchema.safeParse(sample).success).toBe(true);
    }
  });

  it('generates whole-minute HR samples covering every day', () => {
    const dataset = generateDataset({
      persona: 'endurance-runner',
      seed: 42,
      anchorEpochMs: ANCHOR,
    });
    expect(dataset.hrSamples.length).toBe(SIMULATION_DAYS * 1440);
    expect(dataset.hrSamples[0]?.timestamp).toBe(ANCHOR);
    for (let i = 1; i < dataset.hrSamples.length; i += 1) {
      const prev = dataset.hrSamples[i - 1]?.timestamp ?? 0;
      const current = dataset.hrSamples[i]?.timestamp ?? 0;
      expect(current - prev).toBe(60_000);
    }
  });

  it('emits stress and SpO2 at their cadences', () => {
    const dataset = generateDataset({
      persona: 'endurance-runner',
      seed: 42,
      anchorEpochMs: ANCHOR,
    });
    const expectedStress = (SIMULATION_DAYS * 1440) / STRESS_CADENCE_MINUTES;
    const expectedSpo2 = (SIMULATION_DAYS * 1440) / SPO2_CADENCE_MINUTES;
    expect(dataset.stressSamples).toHaveLength(expectedStress);
    expect(dataset.spo2Samples).toHaveLength(expectedSpo2);
  });

  it('generates nightly sleep anchored to each wake-up', () => {
    const dataset = generateDataset({ persona: 'peak-recovery', seed: 42, anchorEpochMs: ANCHOR });
    expect(dataset.sleepSegments.length).toBeGreaterThan(0);
    for (const segment of dataset.sleepSegments) {
      expect(segment.end).toBeGreaterThan(segment.start);
    }
    const firstWake = dataset.wakeTimes[0] ?? 0;
    const firstNight = dataset.sleepSegments.filter((segment) => segment.end <= firstWake);
    expect(firstNight.length).toBeGreaterThan(0);
  });

  it('honours persona workout schedules', () => {
    const runner = generateDataset({
      persona: 'endurance-runner',
      seed: 42,
      anchorEpochMs: ANCHOR,
    });
    const peak = generateDataset({ persona: 'peak-recovery', seed: 42, anchorEpochMs: ANCHOR });
    const over = generateDataset({ persona: 'overreaching', seed: 42, anchorEpochMs: ANCHOR });
    expect(runner.workouts.length).toBeGreaterThan(peak.workouts.length);
    expect(over.workouts.length).toBeGreaterThanOrEqual(runner.workouts.length);
    for (const workout of runner.workouts) {
      expect(workout.end).toBeGreaterThan(workout.start);
      expect(workout.id.length).toBeGreaterThan(0);
    }
  });

  it('shows persona-level physiological signatures', () => {
    const datasets = Object.fromEntries(
      PERSONAS.map((persona) => [
        persona,
        generateDataset({ persona, seed: 42, anchorEpochMs: ANCHOR }),
      ]),
    ) as Record<PersonaId, ReturnType<typeof generateDataset>>;
    const avg = (values: readonly number[]): number =>
      values.reduce((total, value) => total + value, 0) / values.length;
    const avgStress = avg(datasets['overreaching'].stressSamples.map((sample) => sample.stress));
    const peakStress = avg(datasets['peak-recovery'].stressSamples.map((sample) => sample.stress));
    expect(avgStress).toBeGreaterThan(peakStress);
    const peakAsleep = datasets['peak-recovery'].sleepSegments.filter(
      (segment) => segment.stage !== 'awake',
    );
    const overAsleep = datasets['overreaching'].sleepSegments.filter(
      (segment) => segment.stage !== 'awake',
    );
    const totalMinutes = (segments: typeof peakAsleep): number =>
      segments.reduce((total, segment) => total + (segment.end - segment.start), 0);
    expect(totalMinutes(peakAsleep)).toBeGreaterThan(totalMinutes(overAsleep));
  });

  it('supports custom day counts', () => {
    const dataset = generateDataset({
      persona: 'endurance-runner',
      seed: 42,
      anchorEpochMs: ANCHOR,
      days: 3,
    });
    expect(dataset.days).toBe(3);
    expect(dataset.wakeTimes).toHaveLength(3);
    expect(dataset.hrSamples).toHaveLength(3 * 1440);
  });

  it('keeps wake times roughly one day apart within jitter', () => {
    const dataset = generateDataset({
      persona: 'endurance-runner',
      seed: 42,
      anchorEpochMs: ANCHOR,
    });
    for (let i = 1; i < dataset.wakeTimes.length; i += 1) {
      const gap = (dataset.wakeTimes[i] ?? 0) - (dataset.wakeTimes[i - 1] ?? 0);
      expect(gap).toBeGreaterThan(MS_PER_DAY - 3_600_000);
      expect(gap).toBeLessThan(MS_PER_DAY + 3_600_000);
    }
  });
});
