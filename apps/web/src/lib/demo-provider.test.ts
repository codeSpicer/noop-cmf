import { describe, expect, it } from 'vitest';
import { createDemoProvider, demoPersona, demoPersonas, isDemoMode } from './demo-provider';

describe('isDemoMode', () => {
  it('detects ?demo=true', () => {
    expect(isDemoMode('?demo=true')).toBe(true);
    expect(isDemoMode('?demo=true&persona=peak-recovery')).toBe(true);
  });

  it('rejects other values', () => {
    expect(isDemoMode('')).toBe(false);
    expect(isDemoMode('?demo=false')).toBe(false);
    expect(isDemoMode('?persona=endurance-runner')).toBe(false);
  });
});

describe('demoPersona', () => {
  it('parses each persona', () => {
    expect(demoPersona('?persona=endurance-runner')).toBe('endurance-runner');
    expect(demoPersona('?persona=peak-recovery')).toBe('peak-recovery');
    expect(demoPersona('?persona=overreaching')).toBe('overreaching');
  });

  it('defaults to endurance-runner', () => {
    expect(demoPersona('')).toBe('endurance-runner');
    expect(demoPersona('?persona=bogus')).toBe('endurance-runner');
  });

  it('lists all personas', () => {
    expect(demoPersonas()).toEqual(['endurance-runner', 'peak-recovery', 'overreaching']);
  });
});

describe('createDemoProvider', () => {
  it('returns a connected provider serving 30 days of HR', async () => {
    const provider = await createDemoProvider('?demo=true&persona=peak-recovery');
    expect(provider.id).toBe('simulator');
    const range = { start: 1_700_000_000_000, end: 1_700_000_000_000 + 86_400_000 };
    const hr = await provider.getHeartRateSamples(range as never);
    expect(hr.ok).toBe(true);
  }, 30000);

  it('honours the persona param', async () => {
    const runner = await createDemoProvider('?demo=true&persona=endurance-runner');
    const peak = await createDemoProvider('?demo=true&persona=peak-recovery');
    expect(runner.getDataset().persona).toBe('endurance-runner');
    expect(peak.getDataset().persona).toBe('peak-recovery');
    expect(runner.getDataset().hrSamples.length).toBe(peak.getDataset().hrSamples.length);
    expect(runner.getDataset().workouts.length).toBeGreaterThan(peak.getDataset().workouts.length);
  }, 30000);
});
