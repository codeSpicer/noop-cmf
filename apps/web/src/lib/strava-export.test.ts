import { afterEach, describe, expect, it } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample, Workout } from '@noop-cmf/types';
import {
  buildWorkoutTcx,
  buildWorkoutTcxFilename,
  loadWorkoutExportData,
  mapActivityToTcxSport,
} from './strava-export';

function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}

const START = Date.UTC(2024, 0, 30, 12, 0, 0);
const END = Date.UTC(2024, 0, 30, 12, 10, 0);

const baseWorkout: Workout = {
  id: 'w-abc-123',
  start: EpochMsSchema.parse(START),
  end: EpochMsSchema.parse(END),
  activityType: 'indoor cycling',
};

describe('mapActivityToTcxSport', () => {
  it('maps running-like activities to Running', () => {
    expect(mapActivityToTcxSport('run')).toBe('Running');
    expect(mapActivityToTcxSport('Outdoor Running')).toBe('Running');
    expect(mapActivityToTcxSport('treadmill')).toBe('Running');
    expect(mapActivityToTcxSport('Jogging')).toBe('Running');
  });

  it('maps cycling-like activities to Biking', () => {
    expect(mapActivityToTcxSport('indoor cycling')).toBe('Biking');
    expect(mapActivityToTcxSport('Bike')).toBe('Biking');
    expect(mapActivityToTcxSport('ride')).toBe('Biking');
    expect(mapActivityToTcxSport('Spinning')).toBe('Biking');
  });

  it('defaults unknown activities to Other', () => {
    expect(mapActivityToTcxSport('walk')).toBe('Other');
    expect(mapActivityToTcxSport('swim')).toBe('Other');
    expect(mapActivityToTcxSport('strength')).toBe('Other');
    expect(mapActivityToTcxSport('')).toBe('Other');
  });
});

describe('buildWorkoutTcx', () => {
  it('builds a GPS-less TCX with HR trackpoints and lap stats from samples', () => {
    const tcx = buildWorkoutTcx({
      workout: baseWorkout,
      hrSamples: [hr(START, 120), hr(START + 60_000, 140), hr(END, 130)],
    });

    expect(tcx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(tcx).toContain('<TrainingCenterDatabase');
    expect(tcx).toContain('<Activity Sport="Biking">');
    expect(tcx).toContain(`<Id>${new Date(START).toISOString()}</Id>`);
    expect(tcx).toContain(`<Lap StartTime="${new Date(START).toISOString()}">`);
    expect(tcx).toContain('<TotalTimeSeconds>600</TotalTimeSeconds>');
    expect(tcx).toContain('<DistanceMeters>0</DistanceMeters>');
    expect(tcx).toContain('<Intensity>Active</Intensity>');
    expect(tcx).toContain('<TriggerMethod>Manual</TriggerMethod>');
    expect(tcx).not.toContain('<Position>');
    expect(tcx).not.toContain('<Calories>');

    const trackpointCount = (tcx.match(/<Trackpoint>/g) ?? []).length;
    expect(trackpointCount).toBe(3);
    expect(tcx).toContain(`<Time>${new Date(START).toISOString()}</Time><HeartRateBpm><Value>120</Value></HeartRateBpm>`);
    expect(tcx).toContain(`<Time>${new Date(START + 60_000).toISOString()}</Time><HeartRateBpm><Value>140</Value></HeartRateBpm>`);
    expect(tcx).toContain(`<Time>${new Date(END).toISOString()}</Time><HeartRateBpm><Value>130</Value></HeartRateBpm>`);

    // avg of 120,140,130 = 130, max 140
    expect(tcx).toContain('<AverageHeartRateBpm><Value>130</Value></AverageHeartRateBpm>');
    expect(tcx).toContain('<MaximumHeartRateBpm><Value>140</Value></MaximumHeartRateBpm>');
  });

  it('includes calories and uses sample HR stats over workout average when samples exist', () => {
    const tcx = buildWorkoutTcx({
      workout: {
        ...baseWorkout,
        calories: 321,
        averageHeartRate: 150 as Workout['averageHeartRate'],
      },
      hrSamples: [hr(START + 1000, 110), hr(START + 2000, 130)],
    });

    expect(tcx).toContain('<Calories>321</Calories>');
    expect(tcx).toContain('<AverageHeartRateBpm><Value>120</Value></AverageHeartRateBpm>');
    expect(tcx).toContain('<MaximumHeartRateBpm><Value>130</Value></MaximumHeartRateBpm>');
  });

  it('exports a valid TCX with no HR samples using workout average heart rate', () => {
    const tcx = buildWorkoutTcx({
      workout: {
        ...baseWorkout,
        activityType: 'run',
        averageHeartRate: 142 as Workout['averageHeartRate'],
      },
      hrSamples: [],
    });

    expect(tcx).toContain('<Activity Sport="Running">');
    expect(tcx).toContain('<TotalTimeSeconds>600</TotalTimeSeconds>');
    expect(tcx).toContain('<DistanceMeters>0</DistanceMeters>');
    expect(tcx).toContain('<AverageHeartRateBpm><Value>142</Value></AverageHeartRateBpm>');
    expect(tcx).toContain('<MaximumHeartRateBpm><Value>142</Value></MaximumHeartRateBpm>');

    const trackpointCount = (tcx.match(/<Trackpoint>/g) ?? []).length;
    expect(trackpointCount).toBe(2);
    expect(tcx).toContain(`<Time>${new Date(START).toISOString()}</Time><HeartRateBpm><Value>142</Value></HeartRateBpm>`);
    expect(tcx).toContain(`<Time>${new Date(END).toISOString()}</Time><HeartRateBpm><Value>142</Value></HeartRateBpm>`);
  });

  it('exports a valid TCX with no HR samples and no average heart rate', () => {
    const tcx = buildWorkoutTcx({ workout: baseWorkout, hrSamples: [] });

    expect(tcx).toContain('<Track>');
    expect(tcx).not.toContain('<AverageHeartRateBpm>');
    expect(tcx).not.toContain('<MaximumHeartRateBpm>');
    expect(tcx).not.toContain('<HeartRateBpm>');
    const trackpointCount = (tcx.match(/<Trackpoint>/g) ?? []).length;
    expect(trackpointCount).toBe(2);
    expect(tcx).toContain(`<Trackpoint><Time>${new Date(START).toISOString()}</Time></Trackpoint>`);
    expect(tcx).toContain(`<Trackpoint><Time>${new Date(END).toISOString()}</Time></Trackpoint>`);
  });

  it('filters samples outside the workout window and keeps timestamps in ISO UTC', () => {
    const tcx = buildWorkoutTcx({
      workout: baseWorkout,
      hrSamples: [hr(START - 1000, 90), hr(START + 5000, 111), hr(END + 1000, 200)],
    });

    const trackpointCount = (tcx.match(/<Trackpoint>/g) ?? []).length;
    expect(trackpointCount).toBe(1);
    expect(tcx).toContain('2024-01-30T12:00:05.000Z');
    expect(tcx).toContain('<Value>111</Value>');
  });
});

describe('buildWorkoutTcxFilename', () => {
  it('builds a safe, descriptive filename', () => {
    expect(buildWorkoutTcxFilename(baseWorkout)).toBe(
      'noop-cmf-indoor-cycling-2024-01-30-w-abc-12.tcx',
    );
  });
});

describe('loadWorkoutExportData', () => {
  afterEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('loads the workout and HR samples in its window', async () => {
    const db = getDatabase();
    await db.workouts.put(baseWorkout);
    await db.hrSamples.bulkPut([
      hr(START - 1000, 90),
      hr(START + 2000, 120),
      hr(START + 1000, 110),
      hr(END + 1000, 200),
    ]);

    const data = await loadWorkoutExportData('w-abc-123', db);
    expect(data).not.toBeNull();
    expect(data?.workout.id).toBe('w-abc-123');
    expect(data?.hrSamples.map((s) => s.bpm)).toEqual([110, 120]);
  });

  it('returns null for a missing workout', async () => {
    const data = await loadWorkoutExportData('missing', getDatabase());
    expect(data).toBeNull();
  });
});
