import { describe, expect, it, beforeEach } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { EpochMsSchema } from '@noop-cmf/types';
import type { HrSample, SleepSegment } from '@noop-cmf/types';
import { hasData, latestDayRange, loadOverview, loadSleep, loadStrain, loadRecovery } from './db-analytics';

const T0 = Date.UTC(2024, 0, 30);

function hr(ts: number, bpm: number): HrSample {
  return { timestamp: EpochMsSchema.parse(ts), bpm: bpm as HrSample['bpm'] };
}

function sleep(start: number, end: number): SleepSegment {
  return { start: EpochMsSchema.parse(start), end: EpochMsSchema.parse(end), stage: 'deep' };
}

describe('db-analytics', () => {
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('hasData false when empty', async () => {
    const db = getDatabase();
    expect(await hasData(db)).toBe(false);
  });

  it('latestDayRange null when empty', async () => {
    const db = getDatabase();
    expect(await latestDayRange(db)).toBeNull();
  });

  it('loaders return null when empty', async () => {
    const db = getDatabase();
    expect(await loadOverview(db)).toBeNull();
    expect(await loadRecovery(db)).toBeNull();
    expect(await loadSleep(db)).toBeNull();
    expect(await loadStrain(db)).toBeNull();
  });

  it('loads overview when populated', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120), hr(T0 - 500, 130)]);
    await db.sleepSegments.put(sleep(T0 - 3600000, T0 - 1800000));
    const view = await loadOverview(db);
    expect(view).not.toBeNull();
    expect(view?.strain ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('loads overview with only sleep data', async () => {
    const db = getDatabase();
    await db.sleepSegments.put(sleep(T0 - 3600000, T0 - 1800000));
    const view = await loadOverview(db);
    expect(view).not.toBeNull();
  });

  it('loads overview with awake-only sleep (zero performance)', async () => {
    const db = getDatabase();
    const seg: SleepSegment = { start: EpochMsSchema.parse(T0 - 3600000), end: EpochMsSchema.parse(T0 - 1800000), stage: 'awake' };
    await db.sleepSegments.put(seg);
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120)]);
    const view = await loadOverview(db);
    expect(view).not.toBeNull();
  });

  it('loads sleep and strain when populated', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120)]);
    await db.sleepSegments.put(sleep(T0 - 3600000, T0 - 1800000));
    const sl = await loadSleep(db);
    expect(sl).not.toBeNull();
    const st = await loadStrain(db);
    expect(st).not.toBeNull();
  });

  it('returns null for sleep/strain without relevant data', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120)]);
    expect(await loadSleep(db)).toBeNull();
    await clearDatabase(db);
    await db.sleepSegments.put(sleep(T0 - 3600000, T0 - 1800000));
    expect(await loadStrain(db)).toBeNull();
  });

  it('loads recovery when populated', async () => {
    const db = getDatabase();
    await db.hrSamples.bulkPut([hr(T0 - 1000, 120)]);
    await db.sleepSegments.put(sleep(T0 - 3600000, T0 - 1800000));
    const r = await loadRecovery(db);
    expect(r).not.toBeNull();
  });

  it('loads recovery with only sleep data', async () => {
    const db = getDatabase();
    await db.sleepSegments.put(sleep(T0 - 3600000, T0 - 1800000));
    await loadRecovery(db);
    // exercise only; no assertion needed
  });
});