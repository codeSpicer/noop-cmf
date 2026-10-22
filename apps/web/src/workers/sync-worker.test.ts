import { describe, expect, it } from 'vitest';
import { BpmSchema, EpochMsSchema } from '@noop-cmf/types';
import { buildGadgetbridgeFixture } from '@noop-cmf/cmf-ble';
import { handleWorkerRequest, validateWorkerInputs } from './sync-worker';

describe('handleWorkerRequest', () => {
  it('parses a fixture database off the main thread', async () => {
    const start = EpochMsSchema.parse(1_700_000_000_000);
    const file = await buildGadgetbridgeFixture({
      points: [{ timestampMs: start, bpm: 72, stress: 30, spo2: 98 }],
    });
    const response = await handleWorkerRequest({ id: 1, type: 'parse', file });
    expect(response.ok).toBe(true);
    expect(response.id).toBe(1);
    expect(response.payload).toMatchObject({ hrCount: 1, stressCount: 1, spo2Count: 1 });
  });

  it('computes rolling recovery inputs', async () => {
    const start = EpochMsSchema.parse(1_700_000_000_000);
    const response = await handleWorkerRequest({
      id: 2,
      type: 'recovery',
      hrSamples: [
        { timestamp: start, bpm: BpmSchema.parse(48) },
        { timestamp: EpochMsSchema.parse(1_700_000_060_000), bpm: BpmSchema.parse(47) },
      ],
      sleepSegments: [{ start, end: EpochMsSchema.parse(1_700_002_000_000), stage: 'deep' }],
      baselineRhr: 50,
      sleepPerformance: 90,
      history: [],
    });
    expect(response.ok).toBe(true);
    expect(response.payload).toMatchObject({ recovery: 53 });
  });

  it('reports errors instead of throwing', async () => {
    const response = await handleWorkerRequest({
      id: 3,
      type: 'parse',
      file: new Uint8Array([0, 1, 2]),
    });
    expect(response.ok).toBe(false);
    expect(response.error).toBeDefined();
  });
});

describe('validateWorkerInputs', () => {
  it('accepts any valid branded value', () => {
    expect(validateWorkerInputs(1_700_000_000_000, 0, 0)).toBe(true);
    expect(validateWorkerInputs(0, 110, 0)).toBe(true);
    expect(validateWorkerInputs(0, 0, 72)).toBe(true);
  });

  it('rejects all-invalid inputs', () => {
    expect(validateWorkerInputs(-1, 0, 0)).toBe(false);
  });
});
