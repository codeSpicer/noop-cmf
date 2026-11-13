/**
 * Export a synced workout as a Garmin TCX file for manual upload to Strava.
 * Local-first: builds the file in the browser from IndexedDB data (no backend).
 */
import type { HrSample, Workout } from '@noop-cmf/types';
import type { NoopCmfDatabase } from '@/db/database';
import { getDatabase } from '@/db/database';

/** Garmin TCX Sport_t values (TCX v2 schema). */
export type TcxSport = 'Running' | 'Biking' | 'Other';

/**
 * Map a CMF/watch activity type to a TCX Sport value.
 * TCX v2 only allows Running, Biking, or Other.
 */
export function mapActivityToTcxSport(activityType: string): TcxSport {
  const t = activityType.trim().toLowerCase();
  if (/(^|\b)(run|running|jog|jogging|treadmill)(\b|$)/.test(t)) {
    return 'Running';
  }
  if (/(^|\b)(bike|biking|cycl|cycling|ride|riding|spin|spinning)(\b|$)/.test(t)) {
    return 'Biking';
  }
  return 'Other';
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function formatSeconds(msStart: number, msEnd: number): string {
  const seconds = (msEnd - msStart) / 1000;
  return Number.isInteger(seconds) ? String(seconds) : String(Math.round(seconds * 1000) / 1000);
}

function avgOf(samples: readonly HrSample[]): number | undefined {
  if (samples.length === 0) return undefined;
  let sum = 0;
  for (const s of samples) sum += s.bpm;
  return sum / samples.length;
}

function maxOf(samples: readonly HrSample[]): number | undefined {
  if (samples.length === 0) return undefined;
  let max = -Infinity;
  for (const s of samples) {
    if (s.bpm > max) max = s.bpm;
  }
  return max === -Infinity ? undefined : max;
}

function hrValueTag(bpm: number): string {
  return `<HeartRateBpm><Value>${String(Math.round(bpm))}</Value></HeartRateBpm>`;
}

function trackpoint(timeIso: string, bpm: number | undefined): string {
  const hr = bpm === undefined ? '' : hrValueTag(bpm);
  return `<Trackpoint><Time>${timeIso}</Time>${hr}</Trackpoint>`;
}

export interface BuildWorkoutTcxInput {
  readonly workout: Workout;
  readonly hrSamples: readonly HrSample[];
}

/**
 * Build a Garmin TCX (v2) document for a single workout.
 * GPS-less by default (no <Position>); GPS trackpoints are a future extension.
 * Always produces a valid TCX, even when there are no HR samples.
 */
export function buildWorkoutTcx({ workout, hrSamples }: BuildWorkoutTcxInput): string {
  const sorted = [...hrSamples]
    .filter((s) => s.timestamp >= workout.start && s.timestamp <= workout.end)
    .sort((a, b) => a.timestamp - b.timestamp);

  const sport = mapActivityToTcxSport(workout.activityType);
  const id = toIso(workout.start);
  const startIso = toIso(workout.start);
  const endIso = toIso(workout.end);
  const totalTimeSeconds = formatSeconds(workout.start, workout.end);

  const sampleAvg = avgOf(sorted);
  const sampleMax = maxOf(sorted);
  const avgBpm =
    sampleAvg ?? (workout.averageHeartRate !== undefined ? workout.averageHeartRate : undefined);
  const maxBpm =
    sampleMax ?? (workout.averageHeartRate !== undefined ? workout.averageHeartRate : undefined);

  const caloriesTag =
    workout.calories !== undefined ? `<Calories>${String(workout.calories)}</Calories>` : '';
  const avgTag =
    avgBpm !== undefined
      ? `<AverageHeartRateBpm><Value>${String(Math.round(avgBpm))}</Value></AverageHeartRateBpm>`
      : '';
  const maxTag =
    maxBpm !== undefined
      ? `<MaximumHeartRateBpm><Value>${String(Math.round(maxBpm))}</Value></MaximumHeartRateBpm>`
      : '';

  let trackpoints: string;
  if (sorted.length > 0) {
    trackpoints = sorted.map((s) => trackpoint(toIso(s.timestamp), s.bpm)).join('');
  } else if (avgBpm !== undefined) {
    trackpoints = trackpoint(startIso, avgBpm) + trackpoint(endIso, avgBpm);
  } else {
    trackpoints = trackpoint(startIso, undefined) + trackpoint(endIso, undefined);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2.xsd">',
    '<Activities>',
    `<Activity Sport="${sport}">`,
    `<Id>${id}</Id>`,
    `<Lap StartTime="${startIso}">`,
    `<TotalTimeSeconds>${totalTimeSeconds}</TotalTimeSeconds>`,
    '<DistanceMeters>0</DistanceMeters>',
    caloriesTag,
    avgTag,
    maxTag,
    '<Intensity>Active</Intensity>',
    '<TriggerMethod>Manual</TriggerMethod>',
    '<Track>',
    trackpoints,
    '</Track>',
    '</Lap>',
    '</Activity>',
    '</Activities>',
    '</TrainingCenterDatabase>',
  ].join('');
}

/** Loaded data required to export a single workout as TCX. */
export interface WorkoutExportData {
  readonly workout: Workout;
  readonly hrSamples: readonly HrSample[];
}

/**
 * Load a workout and its HR samples on demand for export.
 * Returns null if the workout does not exist.
 */
export async function loadWorkoutExportData(
  workoutId: string,
  db: NoopCmfDatabase = getDatabase(),
): Promise<WorkoutExportData | null> {
  const workout = await db.workouts.get(workoutId);
  if (!workout) {
    return null;
  }
  const hrSamples = await db.hrSamples
    .where('timestamp')
    .between(workout.start, workout.end, true, true)
    .sortBy('timestamp');
  const filtered = hrSamples.filter(
    (s) => s.timestamp >= workout.start && s.timestamp <= workout.end,
  );
  return { workout, hrSamples: filtered };
}

function sanitizeFilenamePart(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'workout';
}

/** Build a safe, descriptive filename for a workout TCX export. */
export function buildWorkoutTcxFilename(
  workout: Pick<Workout, 'id' | 'start' | 'activityType'>,
): string {
  const activity = sanitizeFilenamePart(workout.activityType);
  const date = toIso(workout.start).slice(0, 10);
  const shortId = sanitizeFilenamePart(workout.id).slice(0, 8) || 'id';
  return `noop-cmf-${activity}-${date}-${shortId}.tcx`;
}

/** Trigger a browser download of a TCX document. */
export function downloadWorkoutTcx(filename: string, tcxXml: string): void {
  const blob = new Blob([tcxXml], { type: 'application/vnd.garmin.tcx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Load, build, and download a TCX file for a workout. Returns false if missing. */
export async function exportWorkoutAsTcx(
  workoutId: string,
  db: NoopCmfDatabase = getDatabase(),
): Promise<boolean> {
  const data = await loadWorkoutExportData(workoutId, db);
  if (!data) {
    return false;
  }
  const tcx = buildWorkoutTcx(data);
  downloadWorkoutTcx(buildWorkoutTcxFilename(data.workout), tcx);
  return true;
}
