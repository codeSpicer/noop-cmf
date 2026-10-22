/**
 * Web Worker: off-main-thread Gadgetbridge SQLite parsing and 30-day
 * rolling recovery math. Messages: { type: 'parse', file: Uint8Array } and
 * { type: 'recovery', ...inputs }. Responses mirror the request id.
 */
import { parseGadgetbridgeFile } from '@noop-cmf/cmf-ble';
import { computeOvernightMetrics, computeRecovery } from '@noop-cmf/physio-engine';
import { EpochMsSchema, MillisecondsSchema, RecoveryPercentSchema } from '@noop-cmf/types';
import type { HrSample, SleepSegment } from '@noop-cmf/types';

export interface WorkerParseRequest {
  readonly id: number;
  readonly type: 'parse';
  readonly file: Uint8Array;
}

export interface WorkerRecoveryRequest {
  readonly id: number;
  readonly type: 'recovery';
  readonly hrSamples: HrSample[];
  readonly sleepSegments: SleepSegment[];
  readonly baselineRhr: number;
  readonly sleepPerformance: number;
  readonly history: Array<{ ehrv: number; restingHeartRate: number }>;
}

export type WorkerRequest = WorkerParseRequest | WorkerRecoveryRequest;

export interface WorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly payload?: unknown;
  readonly error?: string;
}

/** Pure handler (exported for unit tests without a Worker runtime). */
export async function handleWorkerRequest(request: WorkerRequest): Promise<WorkerResponse> {
  try {
    if (request.type === 'parse') {
      const parsed = await parseGadgetbridgeFile(request.file);
      return {
        id: request.id,
        ok: true,
        payload: {
          hrCount: parsed.hrSamples.length,
          stressCount: parsed.stressSamples.length,
          spo2Count: parsed.spo2Samples.length,
          sleepCount: parsed.sleepSegments.length,
          workoutCount: parsed.workouts.length,
          stepCount: parsed.steps.length,
        },
      };
    }
    const overnight = computeOvernightMetrics(
      request.hrSamples,
      [],
      request.sleepSegments,
      request.baselineRhr,
    );
    const recovery = computeRecovery({
      ehrvToday: overnight.ehrv,
      rhrToday: overnight.restingHeartRate,
      sleepPerformance: request.sleepPerformance,
      history: request.history,
    });
    return {
      id: request.id,
      ok: true,
      payload: {
        ehrv: overnight.ehrv,
        restingHeartRate: overnight.restingHeartRate,
        recovery,
      },
    };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Worker failed',
    };
  }
}

/** Validate branded worker inputs before computing (exported for tests). */
export function validateWorkerInputs(hr: number, ehrv: number, recovery: number): boolean {
  return (
    EpochMsSchema.safeParse(hr).success ||
    MillisecondsSchema.safeParse(ehrv).success ||
    RecoveryPercentSchema.safeParse(recovery).success
  );
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleWorkerRequest(event.data).then((response: WorkerResponse) => {
    self.postMessage(response);
  });
};
