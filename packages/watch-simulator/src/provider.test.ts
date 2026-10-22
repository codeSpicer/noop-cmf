import { describe, expect, it, vi } from 'vitest';
import {
  EpochMsSchema,
  MillisecondsSchema,
  RecoveryPercentSchema,
  StrainScoreSchema,
} from '@noop-cmf/types';
import type { TimeRange } from '@noop-cmf/types';
import {
  SIMULATED_PROVIDER_ID,
  SIMULATED_PROVIDER_LABEL,
  SimulatedWatchProvider,
} from './provider.js';

const ANCHOR = EpochMsSchema.parse(1_700_000_000_000);

function fullRange(): TimeRange {
  return {
    start: ANCHOR,
    end: EpochMsSchema.parse(ANCHOR + 30 * 86_400_000),
  };
}

describe('SimulatedWatchProvider', () => {
  it('exposes the simulator identity', () => {
    const provider = new SimulatedWatchProvider({
      persona: 'endurance-runner',
      anchorEpochMs: ANCHOR,
    });
    expect(provider.id).toBe(SIMULATED_PROVIDER_ID);
    expect(provider.label).toBe(SIMULATED_PROVIDER_LABEL);
  });

  it('requires connection before querying', async () => {
    const provider = new SimulatedWatchProvider({
      persona: 'endurance-runner',
      anchorEpochMs: ANCHOR,
    });
    const result = await provider.getHeartRateSamples(fullRange());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_CONNECTED');
    }
  });

  it('connects and disconnects idempotently', async () => {
    const provider = new SimulatedWatchProvider({
      persona: 'endurance-runner',
      anchorEpochMs: ANCHOR,
    });
    expect((await provider.connect()).ok).toBe(true);
    expect((await provider.connect()).ok).toBe(true);
    expect((await provider.getHeartRateSamples(fullRange())).ok).toBe(true);
    expect((await provider.disconnect()).ok).toBe(true);
    expect((await provider.disconnect()).ok).toBe(true);
    expect((await provider.getHeartRateSamples(fullRange())).ok).toBe(false);
  });

  it('serves every data kind over the full range', async () => {
    const provider = new SimulatedWatchProvider({
      persona: 'endurance-runner',
      anchorEpochMs: ANCHOR,
    });
    await provider.connect();
    const range = fullRange();
    const hr = await provider.getHeartRateSamples(range);
    const stress = await provider.getStressSamples(range);
    const spo2 = await provider.getSpo2Samples(range);
    const sleep = await provider.getSleepSegments(range);
    const workouts = await provider.getWorkouts(range);
    expect(hr.ok ? hr.value.length : -1).toBe(30 * 1440);
    expect(stress.ok ? stress.value.length : -1).toBeGreaterThan(0);
    expect(spo2.ok ? spo2.value.length : -1).toBeGreaterThan(0);
    expect(sleep.ok ? sleep.value.length : -1).toBeGreaterThan(0);
    expect(workouts.ok ? workouts.value.length : -1).toBeGreaterThan(0);
  });

  it('filters to the requested range', async () => {
    const provider = new SimulatedWatchProvider({
      persona: 'endurance-runner',
      anchorEpochMs: ANCHOR,
    });
    await provider.connect();
    const oneHour = {
      start: ANCHOR,
      end: EpochMsSchema.parse(ANCHOR + 3_600_000),
    };
    const hr = await provider.getHeartRateSamples(oneHour);
    expect(hr.ok ? hr.value.length : -1).toBe(60);
    const full = await provider.getHeartRateSamples(fullRange());
    expect(hr.ok && full.ok ? hr.value.length : Number.MAX_SAFE_INTEGER).toBeLessThan(
      full.ok ? full.value.length : 0,
    );
  });

  it('rejects malformed ranges with DECODE_ERROR', async () => {
    const provider = new SimulatedWatchProvider({
      persona: 'endurance-runner',
      anchorEpochMs: ANCHOR,
    });
    await provider.connect();
    const invalid: TimeRange = { start: ANCHOR, end: EpochMsSchema.parse(ANCHOR - 1) };
    for (const query of [
      await provider.getHeartRateSamples(invalid),
      await provider.getStressSamples(invalid),
      await provider.getSpo2Samples(invalid),
      await provider.getSleepSegments(invalid),
      await provider.getWorkouts(invalid),
    ]) {
      expect(query.ok).toBe(false);
      if (!query.ok) {
        expect(query.error.code).toBe('DECODE_ERROR');
      }
    }
  });

  it('rejects sleep and workout queries when disconnected', async () => {
    const provider = new SimulatedWatchProvider({
      persona: 'endurance-runner',
      anchorEpochMs: ANCHOR,
    });
    const sleep = await provider.getSleepSegments(fullRange());
    expect(sleep.ok).toBe(false);
    const workouts = await provider.getWorkouts(fullRange());
    expect(workouts.ok).toBe(false);
  });

  it('records recovery notifications and validates payloads', async () => {
    const provider = new SimulatedWatchProvider({
      persona: 'peak-recovery',
      anchorEpochMs: ANCHOR,
    });
    await provider.connect();
    const notification = {
      recovery: RecoveryPercentSchema.parse(72),
      ehrv: MillisecondsSchema.parse(110),
      strainTarget: StrainScoreSchema.parse(12.5),
    };
    const valid = await provider.pushRecoveryNotification(notification);
    expect(valid.ok).toBe(true);
    expect(provider.getLastNotification()).toEqual(notification);
    const invalid = await provider.pushRecoveryNotification({
      recovery: RecoveryPercentSchema.parse(72),
      ehrv: MillisecondsSchema.parse(110),
      strainTarget: 99 as never,
    });
    expect(invalid.ok).toBe(false);
  });

  it('requires connection for notifications', async () => {
    const provider = new SimulatedWatchProvider({
      persona: 'peak-recovery',
      anchorEpochMs: ANCHOR,
    });
    const result = await provider.pushRecoveryNotification({
      recovery: RecoveryPercentSchema.parse(72),
      ehrv: MillisecondsSchema.parse(110),
      strainTarget: StrainScoreSchema.parse(12.5),
    });
    expect(result.ok).toBe(false);
  });

  it('routes logs through the injected logger', async () => {
    const info = vi.fn();
    const provider = new SimulatedWatchProvider({
      persona: 'peak-recovery',
      anchorEpochMs: ANCHOR,
      logger: { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() },
    });
    await provider.connect();
    await provider.disconnect();
    expect(info).toHaveBeenCalledTimes(2);
  });

  it('honours artificial latency', async () => {
    const provider = new SimulatedWatchProvider({
      persona: 'peak-recovery',
      anchorEpochMs: ANCHOR,
      latencyMs: 15,
    });
    const started = Date.now();
    await provider.connect();
    expect(Date.now() - started).toBeGreaterThanOrEqual(10);
  });

  it('exposes the backing dataset', () => {
    const provider = new SimulatedWatchProvider({
      persona: 'overreaching',
      seed: 42,
      anchorEpochMs: ANCHOR,
      days: 2,
    });
    expect(provider.getDataset().persona).toBe('overreaching');
    expect(provider.getDataset().hrSamples).toHaveLength(2 * 1440);
  });
});
