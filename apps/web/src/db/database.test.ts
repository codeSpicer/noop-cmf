import { describe, expect, it } from 'vitest';
import { BpmSchema, EpochMsSchema, SpO2PercentSchema, StressScoreSchema } from '@noop-cmf/types';
import { NoopCmfDatabase, clearDatabase } from './database';

describe('NoopCmfDatabase', () => {
  it('stores and reads HR samples by timestamp', async () => {
    const db = new NoopCmfDatabase(`test-hr-${String(Date.now())}`);
    try {
      const timestamp = EpochMsSchema.parse(1_700_000_000_000);
      await db.hrSamples.put({ timestamp, bpm: BpmSchema.parse(72) });
      const rows = await db.hrSamples.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.bpm).toBe(72);
    } finally {
      db.close();
    }
  });

  it('stores workouts, journal entries, and cycles', async () => {
    const db = new NoopCmfDatabase(`test-mixed-${String(Date.now())}`);
    try {
      const start = EpochMsSchema.parse(1_700_000_000_000);
      const end = EpochMsSchema.parse(1_700_001_800_000);
      await db.workouts.put({ id: 'w-1', start, end, activityType: 'run' });
      await db.journalEntries.put({ date: '2024-01-01', habits: { alcohol: false } });
      await db.cycles.put({ id: 'c-1', startWake: start, endWake: end });
      expect(await db.workouts.count()).toBe(1);
      expect(await db.journalEntries.count()).toBe(1);
      expect(await db.cycles.count()).toBe(1);
    } finally {
      db.close();
    }
  });

  it('stores stress, SpO2, and sleep segments', async () => {
    const db = new NoopCmfDatabase(`test-sleep-${String(Date.now())}`);
    try {
      const start = EpochMsSchema.parse(1_700_000_000_000);
      const end = EpochMsSchema.parse(1_700_000_600_000);
      await db.stressSamples.put({ timestamp: start, stress: StressScoreSchema.parse(30) });
      await db.spo2Samples.put({ timestamp: start, spo2: SpO2PercentSchema.parse(98) });
      await db.sleepSegments.put({ start, end, stage: 'deep' });
      expect(await db.stressSamples.count()).toBe(1);
      expect(await db.spo2Samples.count()).toBe(1);
      const overlapping = await db.sleepSegments.where('start').below(end).toArray();
      expect(overlapping).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('stores step samples', async () => {
    const db = new NoopCmfDatabase(`test-steps-${String(Date.now())}`);
    try {
      const timestamp = EpochMsSchema.parse(1_700_000_000_000);
      await db.steps.put({ timestamp, steps: 420 });
      const rows = await db.steps.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.steps).toBe(420);
    } finally {
      db.close();
    }
  });

  it('clearDatabase empties every table', async () => {
    const db = new NoopCmfDatabase(`test-clear-${String(Date.now())}`);
    try {
      const timestamp = EpochMsSchema.parse(1_700_000_000_000);
      await db.hrSamples.put({ timestamp, bpm: BpmSchema.parse(70) });
      await db.journalEntries.put({ date: '2024-01-02', habits: {} });
      await db.steps.put({ timestamp, steps: 100 });
      await clearDatabase(db);
      expect(await db.hrSamples.count()).toBe(0);
      expect(await db.journalEntries.count()).toBe(0);
      expect(await db.workouts.count()).toBe(0);
      expect(await db.cycles.count()).toBe(0);
      expect(await db.steps.count()).toBe(0);
    } finally {
      db.close();
    }
  });
});
