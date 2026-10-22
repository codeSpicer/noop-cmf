/**
 * Deterministic 30-day biometric generator.
 *
 * One seeded mulberry32 stream is consumed in a fixed order (day by day,
 * wake jitter → sleep → HR → stress → SpO2 → workouts), so the same
 * `{ seed, persona, anchorEpochMs, days }` options always produce
 * byte-identical arrays.
 */
import { z } from 'zod';
import type {
  EpochMs,
  HrSample,
  SleepSegment,
  SleepStage,
  Spo2Sample,
  StressSample,
  Workout,
} from '@noop-cmf/types';
import { createMulberry32, type Mulberry32 } from './prng.js';

/** Stable identifiers of the three built-in training personas. */
export const PersonaIdSchema = z.enum(['endurance-runner', 'peak-recovery', 'overreaching']);
export type PersonaId = z.infer<typeof PersonaIdSchema>;

/** Default seed used when callers do not specify one. */
export const DEFAULT_SEED = 42;

/** Default number of simulated days. */
export const SIMULATION_DAYS = 30;

/** Milliseconds in one minute. */
export const MS_PER_MINUTE = 60_000;

/** Milliseconds in one hour. */
export const MS_PER_HOUR = 3_600_000;

/** Milliseconds in one day. */
export const MS_PER_DAY = 86_400_000;

/** HR samples are generated on whole-minute boundaries. */
export const HR_CADENCE_MINUTES = 1;

/** Stress samples are generated every 5 minutes. */
export const STRESS_CADENCE_MINUTES = 5;

/** SpO2 samples are generated every 10 minutes. */
export const SPO2_CADENCE_MINUTES = 10;

interface WorkoutTemplate {
  readonly weekday: number;
  readonly startHour: number;
  readonly durationMin: number;
  readonly activityType: string;
  readonly targetHr: number;
}

interface PersonaParams {
  readonly restingHeartRateStart: number;
  readonly restingHeartRateDriftPerDay: number;
  readonly daytimeRestingHr: number;
  readonly sleepDurationMin: number;
  readonly sleepDurationDriftPerDay: number;
  readonly wakeHour: number;
  readonly stressBase: number;
  readonly stressDriftPerDay: number;
  readonly spo2Base: number;
  readonly workouts: readonly WorkoutTemplate[];
}

const PERSONA_PARAMS: Record<PersonaId, PersonaParams> = {
  'endurance-runner': {
    restingHeartRateStart: 48,
    restingHeartRateDriftPerDay: 0,
    daytimeRestingHr: 62,
    sleepDurationMin: 470,
    sleepDurationDriftPerDay: 0,
    wakeHour: 6,
    stressBase: 28,
    stressDriftPerDay: 0,
    spo2Base: 97,
    workouts: [
      { weekday: 0, startHour: 6.5, durationMin: 45, activityType: 'run', targetHr: 152 },
      { weekday: 1, startHour: 18, durationMin: 40, activityType: 'strength', targetHr: 118 },
      { weekday: 2, startHour: 6.5, durationMin: 60, activityType: 'cycling', targetHr: 138 },
      { weekday: 4, startHour: 6.5, durationMin: 60, activityType: 'run', targetHr: 158 },
      { weekday: 5, startHour: 7, durationMin: 90, activityType: 'run', targetHr: 145 },
      { weekday: 6, startHour: 18, durationMin: 20, activityType: 'recovery', targetHr: 105 },
    ],
  },
  'peak-recovery': {
    restingHeartRateStart: 52,
    restingHeartRateDriftPerDay: -0.15,
    daytimeRestingHr: 60,
    sleepDurationMin: 510,
    sleepDurationDriftPerDay: 0,
    wakeHour: 6.5,
    stressBase: 20,
    stressDriftPerDay: 0,
    spo2Base: 98,
    workouts: [
      { weekday: 1, startHour: 18, durationMin: 30, activityType: 'yoga', targetHr: 95 },
      { weekday: 3, startHour: 7, durationMin: 30, activityType: 'swim', targetHr: 115 },
      { weekday: 5, startHour: 8, durationMin: 30, activityType: 'run', targetHr: 125 },
    ],
  },
  overreaching: {
    restingHeartRateStart: 54,
    restingHeartRateDriftPerDay: 0.2,
    daytimeRestingHr: 68,
    sleepDurationMin: 400,
    sleepDurationDriftPerDay: -2,
    wakeHour: 5.5,
    stressBase: 45,
    stressDriftPerDay: 0.5,
    spo2Base: 96,
    workouts: [
      { weekday: 0, startHour: 6, durationMin: 60, activityType: 'run', targetHr: 162 },
      { weekday: 1, startHour: 18, durationMin: 45, activityType: 'strength', targetHr: 128 },
      { weekday: 2, startHour: 6, durationMin: 75, activityType: 'run', targetHr: 160 },
      { weekday: 3, startHour: 18, durationMin: 40, activityType: 'intervals', targetHr: 170 },
      { weekday: 4, startHour: 6, durationMin: 60, activityType: 'run', targetHr: 163 },
      { weekday: 5, startHour: 7, durationMin: 105, activityType: 'run', targetHr: 158 },
    ],
  },
};

/** Repeating ~90-minute sleep architecture block pattern. */
const SLEEP_BLOCK_PATTERN: ReadonlyArray<{ readonly stage: SleepStage; readonly minutes: number }> =
  [
    { stage: 'light', minutes: 25 },
    { stage: 'deep', minutes: 35 },
    { stage: 'light', minutes: 15 },
    { stage: 'rem', minutes: 25 },
    { stage: 'light', minutes: 15 },
    { stage: 'awake', minutes: 3 },
  ];

/** Options controlling dataset generation. */
export interface SimulatorOptions {
  readonly seed?: number | undefined;
  readonly persona: PersonaId;
  readonly anchorEpochMs: EpochMs;
  readonly days?: number | undefined;
}

/** Fully generated deterministic dataset. */
export interface SimulatedDataset {
  readonly persona: PersonaId;
  readonly seed: number;
  readonly anchorEpochMs: EpochMs;
  readonly days: number;
  readonly wakeTimes: readonly EpochMs[];
  readonly hrSamples: readonly HrSample[];
  readonly stressSamples: readonly StressSample[];
  readonly spo2Samples: readonly Spo2Sample[];
  readonly sleepSegments: readonly SleepSegment[];
  readonly workouts: readonly Workout[];
}

interface WorkoutWindow {
  readonly start: number;
  readonly end: number;
  readonly targetHr: number;
  readonly template: WorkoutTemplate;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Generate a deterministic biometric dataset.
 *
 * All random draws come from one mulberry32 stream consumed in a fixed
 * order, so identical options always yield identical output.
 */
export function generateDataset(options: SimulatorOptions): SimulatedDataset {
  const seed = options.seed ?? DEFAULT_SEED;
  const days = options.days ?? SIMULATION_DAYS;
  const params: PersonaParams = PERSONA_PARAMS[options.persona];
  const rng = createMulberry32(seed);

  const wakeTimes: EpochMs[] = [];
  const hrSamples: HrSample[] = [];
  const stressSamples: StressSample[] = [];
  const spo2Samples: Spo2Sample[] = [];
  const sleepSegments: SleepSegment[] = [];
  const workouts: Workout[] = [];

  for (let day = 0; day < days; day += 1) {
    const dayStart = options.anchorEpochMs + day * MS_PER_DAY;
    const wakeJitterMin = Math.round((rng.next() - 0.5) * 30);
    const wake = dayStart + params.wakeHour * MS_PER_HOUR + wakeJitterMin * MS_PER_MINUTE;
    wakeTimes.push(wake as EpochMs);

    const sleepDurationMin = Math.max(
      240,
      params.sleepDurationMin + params.sleepDurationDriftPerDay * day + (rng.next() - 0.5) * 30,
    );
    const bedtime = wake - sleepDurationMin * MS_PER_MINUTE;
    const rhrToday = params.restingHeartRateStart + params.restingHeartRateDriftPerDay * day;

    const nightSegments = buildNightSegments(bedtime, wake, rng);
    for (const segment of nightSegments) {
      sleepSegments.push(segment);
    }

    const dayWorkouts = buildDayWorkouts(dayStart, day, params.workouts, rng);
    const windows: WorkoutWindow[] = dayWorkouts.map((workout) => ({
      start: workout.start,
      end: workout.end,
      targetHr: workout.targetHr,
      template: workout.template,
    }));
    const workoutRecords = finalizeWorkouts(windows, rhrToday, rng, options.persona, day);
    for (const workout of workoutRecords) {
      workouts.push(workout);
    }

    const stressBase = params.stressBase + params.stressDriftPerDay * day;
    emitDaySamples({
      dayStart,
      rhrToday,
      daytimeRestingHr: params.daytimeRestingHr,
      spo2Base: params.spo2Base,
      stressBase,
      nightSegments,
      windows,
      rng,
      hrSamples,
      stressSamples,
      spo2Samples,
    });
  }

  return {
    persona: options.persona,
    seed,
    anchorEpochMs: options.anchorEpochMs,
    days,
    wakeTimes,
    hrSamples,
    stressSamples,
    spo2Samples,
    sleepSegments,
    workouts,
  };
}

function buildNightSegments(bedtime: number, wake: number, rng: Mulberry32): SleepSegment[] {
  const segments: SleepSegment[] = [];
  let cursor = bedtime;
  let blockIndex = 0;
  const patternLength = SLEEP_BLOCK_PATTERN.length;
  while (cursor < wake && patternLength > 0) {
    const block = SLEEP_BLOCK_PATTERN[
      blockIndex % patternLength
    ] as (typeof SLEEP_BLOCK_PATTERN)[number];
    const jitter = 1 + (rng.next() - 0.5) * 0.4;
    const blockEnd = Math.min(wake, cursor + block.minutes * jitter * MS_PER_MINUTE);
    if (blockEnd <= cursor) {
      break;
    }
    segments.push({
      start: cursor as EpochMs,
      end: blockEnd as EpochMs,
      stage: block.stage,
    });
    cursor = blockEnd;
    blockIndex += 1;
  }
  return segments;
}

interface PendingWorkout extends WorkoutWindow {
  readonly template: WorkoutTemplate;
}

function buildDayWorkouts(
  dayStart: number,
  day: number,
  templates: readonly WorkoutTemplate[],
  rng: Mulberry32,
): PendingWorkout[] {
  const weekday = day % 7;
  const pending: PendingWorkout[] = [];
  for (const template of templates) {
    if (template.weekday !== weekday) {
      continue;
    }
    const jitterMin = Math.round((rng.next() - 0.5) * 20);
    const start = dayStart + template.startHour * MS_PER_HOUR + jitterMin * MS_PER_MINUTE;
    const end = start + template.durationMin * MS_PER_MINUTE;
    pending.push({ start, end, targetHr: template.targetHr, template });
  }
  return pending;
}

function finalizeWorkouts(
  windows: readonly WorkoutWindow[],
  rhrToday: number,
  rng: Mulberry32,
  persona: PersonaId,
  day: number,
): Workout[] {
  return windows.map((window, index) => {
    const durationMin = Math.max(1, Math.round((window.end - window.start) / MS_PER_MINUTE));
    const averageHeartRate = clampInt(window.targetHr + (rng.next() - 0.5) * 6, 25, 240);
    const calories = Math.max(0, Math.round(durationMin * (8 + (window.targetHr - rhrToday) / 12)));
    return {
      id: `${persona}-d${String(day)}-${window.template.activityType}-${String(index)}`,
      start: window.start as EpochMs,
      end: window.end as EpochMs,
      activityType: window.template.activityType,
      averageHeartRate: averageHeartRate as Workout['averageHeartRate'],
      calories,
    };
  });
}

interface DayEmission {
  readonly dayStart: number;
  readonly rhrToday: number;
  readonly daytimeRestingHr: number;
  readonly spo2Base: number;
  readonly stressBase: number;
  readonly nightSegments: readonly SleepSegment[];
  readonly windows: readonly WorkoutWindow[];
  readonly rng: Mulberry32;
  readonly hrSamples: HrSample[];
  readonly stressSamples: StressSample[];
  readonly spo2Samples: Spo2Sample[];
}

function segmentAt(segments: readonly SleepSegment[], timestamp: number): SleepSegment | undefined {
  return segments.find((segment) => timestamp >= segment.start && timestamp < segment.end);
}

function windowAt(windows: readonly WorkoutWindow[], timestamp: number): WorkoutWindow | undefined {
  return windows.find((window) => timestamp >= window.start && timestamp < window.end);
}

function sleepStageHr(stage: SleepStage, rhrToday: number): number {
  switch (stage) {
    case 'deep':
      return rhrToday - 3;
    case 'rem':
      return rhrToday + 2;
    case 'light':
      return rhrToday + 1;
    case 'awake':
      return rhrToday + 8;
  }
}

function emitDaySamples(emission: DayEmission): void {
  const minutesPerDay = MS_PER_DAY / MS_PER_MINUTE;
  const activityBumps = buildActivityBumps(emission.dayStart, emission.rng);
  for (let minute = 0; minute < minutesPerDay; minute += 1) {
    const timestamp = emission.dayStart + minute * MS_PER_MINUTE;
    const segment = segmentAt(emission.nightSegments, timestamp);
    const window = windowAt(emission.windows, timestamp);
    let bpm: number;
    if (window) {
      bpm = window.targetHr + (emission.rng.next() - 0.5) * 10;
    } else if (segment) {
      bpm = sleepStageHr(segment.stage, emission.rhrToday) + (emission.rng.next() - 0.5) * 4;
    } else {
      const hour = (timestamp % MS_PER_DAY) / MS_PER_HOUR;
      const circadian = 3 * Math.sin((2 * Math.PI * (hour - 9)) / 24);
      const bump = activityBumps.some((range) => timestamp >= range.start && timestamp < range.end)
        ? 28
        : 0;
      bpm = emission.daytimeRestingHr + circadian + bump + (emission.rng.next() - 0.5) * 10;
    }
    emission.hrSamples.push({
      timestamp: timestamp as EpochMs,
      bpm: clampInt(bpm, 25, 240) as HrSample['bpm'],
    });

    if (minute % STRESS_CADENCE_MINUTES === 0) {
      const stress = window
        ? emission.stressBase + 25 + emission.rng.next() * 15
        : segment
          ? 12 + emission.rng.next() * 18
          : emission.stressBase + (emission.rng.next() - 0.5) * 16;
      emission.stressSamples.push({
        timestamp: timestamp as EpochMs,
        stress: clampInt(stress, 1, 99) as StressSample['stress'],
      });
    }

    if (minute % SPO2_CADENCE_MINUTES === 0) {
      const spo2 = segment
        ? emission.spo2Base - emission.rng.next() * 2
        : emission.spo2Base + 1 - emission.rng.next() * 1.5;
      emission.spo2Samples.push({
        timestamp: timestamp as EpochMs,
        spo2: clampInt(spo2, 70, 100) as Spo2Sample['spo2'],
      });
    }
  }
}

function buildActivityBumps(
  dayStart: number,
  rng: Mulberry32,
): ReadonlyArray<{ readonly start: number; readonly end: number }> {
  const bumps: Array<{ readonly start: number; readonly end: number }> = [];
  const count = 2 + Math.floor(rng.next() * 2);
  for (let i = 0; i < count; i += 1) {
    const startHour = 9 + rng.next() * 10;
    const durationMin = 15 + rng.next() * 25;
    const start = dayStart + startHour * MS_PER_HOUR;
    bumps.push({ start, end: start + durationMin * MS_PER_MINUTE });
  }
  return bumps;
}
