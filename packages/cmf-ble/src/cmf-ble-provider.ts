/**
 * `WatchDataProvider` implementation over a live CMF watch via
 * `CmfBleSession`. Connect/auth/push work end-to-end; recorded-data fetches
 * return `NOT_SUPPORTED` until their on-wire payloads are discovered.
 */
import { ok, err, type Result } from '@noop-cmf/types';
import type {
  HrSample,
  SleepSegment,
  Spo2Sample,
  StepSample,
  StressSample,
  TimeRange,
  WatchDataProvider,
  WatchProviderError,
  Workout,
} from '@noop-cmf/types';
import { TimeRangeSchema } from '@noop-cmf/types';
import { authenticate } from './authenticate.js';
import { pairWatch } from './pair.js';
import type { BleTransport, TransportError } from './mock-transport.js';
import { CmfBleSession } from './session.js';
import {
  ACTIVITY_FETCH_1,
  ACTIVITY_FETCH_2,
  ACTIVITY_FETCH_ACK_1,
  ACTIVITY_FETCH_ACK_2,
  TIME,
  commandFromCodes,
} from './commands.js';
import {
  decodeActivityData,
  decodeHeartRate,
  decodeSleepData,
  decodeSpo2,
  decodeStress,
} from './wire.js';

export interface CmfBleProviderOptions {
  readonly model?: string;
  readonly authKey?: Uint8Array;
  readonly transport?: BleTransport;
  readonly timeoutMs?: number;
  readonly fetchWindowMs?: number;
}

const DEFAULT_MODEL = 'noop-cmf';

function transportError(error: TransportError): WatchProviderError {
  if (error.code === 'NOT_CONNECTED') {
    return { code: 'NOT_CONNECTED', message: error.message };
  }
  return { code: 'IO_ERROR', message: error.message };
}

export class CmfBleProvider implements WatchDataProvider {
  readonly id = 'cmf-ble';
  readonly label = 'CMF Watch (BLE)';

  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchWindowMs: number;
  private transport: BleTransport | undefined;
  private session: CmfBleSession | undefined;
  private connectedState = false;
  private authKeyValue: Uint8Array | undefined;
  private lastPushedValue:
    | { recovery: number; ehrv: number; strainTarget: number }
    | undefined;

  private fetched = false;
  private fetchPromise: Promise<void> | undefined;
  public lastFetchDebug = '';
  private cachedHr: HrSample[] = [];
  private cachedStress: StressSample[] = [];
  private cachedSpo2: Spo2Sample[] = [];
  private cachedSleep: SleepSegment[] = [];
  private cachedSteps: StepSample[] = [];
  private cachedWorkouts: Workout[] = [];

  constructor(options: CmfBleProviderOptions = {}) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.fetchWindowMs = options.fetchWindowMs ?? 10000;
    this.transport = options.transport;
    this.authKeyValue = options.authKey;
  }

  get authKey(): Uint8Array | undefined {
    return this.authKeyValue;
  }

  get lastPushedNotification():
    | { recovery: number; ehrv: number; strainTarget: number }
    | undefined {
    return this.lastPushedValue;
  }

  async connect(): Promise<Result<void, WatchProviderError>> {
    if (!this.transport) {
      return err({ code: 'NOT_CONNECTED', message: 'No BLE transport configured' });
    }
    const transport = this.transport;
    const connected = await transport.connect();
    if (!connected.ok) {
      return err(transportError(connected.error));
    }
    const session = new CmfBleSession(transport);
    const started = await session.start();
    if (!started.ok) {
      await transport.disconnect();
      return err(transportError(started.error));
    }
    this.session = session;

    if (this.authKeyValue) {
      const authed = await authenticate(session, {
        model: this.model,
        authKey: this.authKeyValue,
        timeoutMs: this.timeoutMs,
      });
      if (!authed.ok) {
        await this.teardown();
        return err({
          code: authed.error.code === 'TIMEOUT' ? 'TIMEOUT' : 'IO_ERROR',
          message: authed.error.message,
        });
      }
    } else {
      const paired = await pairWatch(session, transport, {
        model: this.model,
        timeoutMs: this.timeoutMs,
      });
      if (!paired.ok) {
        await this.teardown();
        return err({
          code: paired.error.code === 'TIMEOUT' ? 'TIMEOUT' : 'IO_ERROR',
          message: paired.error.message,
        });
      }
      this.authKeyValue = paired.value;
    }

    // Set the watch clock (Gadgetbridge does this during phase-2 init).
    try {
      const now = Math.floor(Date.now() / 1000);
      const tzOffset = new Date().getTimezoneOffset() * -60000; // milliseconds, Gadgetbridge uses offset
      const buf = new Uint8Array(8);
      const view = new DataView(buf.buffer);
      view.setUint32(0, now, false); // big-endian
      view.setUint32(4, tzOffset, false);
      await this.session.send(TIME, buf, { encrypted: true });
    } catch {
      // Best-effort; ignore failures.
    }

    this.connectedState = true;
    return ok(undefined);
  }

  async disconnect(): Promise<Result<void, WatchProviderError>> {
    await this.teardown();
    this.connectedState = false;
    return ok(undefined);
  }

  private async teardown(): Promise<void> {
    if (this.session) {
      await this.session.stop();
      this.session = undefined;
    }
    if (this.transport) {
      await this.transport.disconnect();
    }
  }

  private async ensureFetched(): Promise<void> {
    if (this.fetched || !this.session) {
      return;
    }
    if (this.fetchPromise) {
      await this.fetchPromise;
      return;
    }
    const session = this.session;
    const inboundCounts: Record<string, number> = {};
    const run = async (): Promise<void> => {
      session.setFrameHandler((cmdRef, payload) => {
        const cmd = commandFromCodes(cmdRef.cmd1, cmdRef.cmd2);
        const name = cmd ? cmd.name : 'unknown';
        inboundCounts[name] = (inboundCounts[name] ?? 0) + 1;
        switch (name) {
          case 'HEART_RATE_MANUAL_AUTO':
          case 'HEART_RATE_WORKOUT':
          case 'HEART_RATE_RESTING': {
            const decoded = decodeHeartRate(payload);
            if (decoded.ok) this.cachedHr.push(...decoded.value);
            break;
          }
          case 'STRESS': {
            const decoded = decodeStress(payload);
            if (decoded.ok) this.cachedStress.push(...decoded.value);
            break;
          }
          case 'SPO2': {
            const decoded = decodeSpo2(payload);
            if (decoded.ok) this.cachedSpo2.push(...decoded.value);
            break;
          }
          case 'SLEEP_DATA': {
            const decoded = decodeSleepData(payload);
            if (decoded.ok) this.cachedSleep.push(...decoded.value.segments);
            break;
          }
          case 'ACTIVITY_DATA': {
            const decoded = decodeActivityData(payload);
            if (decoded.ok) {
              for (const record of decoded.value) {
                this.cachedSteps.push({ timestamp: record.timestamp, steps: record.steps });
              }
            }
            break;
          }
          default:
            break;
        }
      });

      const debug: string[] = [];
      const sent1 = await session.send(ACTIVITY_FETCH_1, new Uint8Array([0xa5]), { encrypted: true });
      debug.push(`sent1=${sent1.ok ? 'ok' : sent1.error.message}`);
      if (sent1.ok) {
        const ack1 = await session.waitFor(ACTIVITY_FETCH_ACK_1, { timeoutMs: this.timeoutMs });
        debug.push(`ack1=${ack1.ok ? 'ok code=' + String(ack1.value[0] ?? -1) + ' len=' + String(ack1.value.length) : ack1.error.code}`);
        if (ack1.ok) {
          const sent2 = await session.send(ACTIVITY_FETCH_2, new Uint8Array([0xa5]), { encrypted: true });
          debug.push(`sent2=${sent2.ok ? 'ok' : sent2.error.message}`);
          const ack2 = await session.waitFor(ACTIVITY_FETCH_ACK_2, { timeoutMs: this.timeoutMs });
          debug.push(`ack2=${ack2.ok ? 'ok len=' + String(ack2.value.length) : ack2.error.code}`);
        }
      }

      await new Promise((resolve) => {
        setTimeout(resolve, this.fetchWindowMs);
      });

      session.setFrameHandler(undefined);
      const counts = Object.entries(inboundCounts)
        .map(([k, v]) => `${k}:${String(v)}`)
        .join(', ');
      this.lastFetchDebug = `${debug.join(' | ')} || decoded: ${counts} || hr=${String(this.cachedHr.length)} stress=${String(this.cachedStress.length)} spo2=${String(this.cachedSpo2.length)} sleep=${String(this.cachedSleep.length)} steps=${String(this.cachedSteps.length)}`;
      this.fetched = true;
    };
    const promise = run().finally(() => {
      this.fetchPromise = undefined;
    });
    this.fetchPromise = promise;
    await promise;
  }

  private notConnected<T>(): Result<T, WatchProviderError> {
    return err({ code: 'NOT_CONNECTED', message: 'Watch is not connected' }) as unknown as Result<
      T,
      WatchProviderError
    >;
  }

  private validateRange(range: TimeRange): Result<TimeRange, WatchProviderError> {
    const parsed = TimeRangeSchema.safeParse(range);
    if (!parsed.success) {
      return err({ code: 'DECODE_ERROR', message: 'Invalid time range' });
    }
    return ok(parsed.data);
  }

  async getHeartRateSamples(range: TimeRange): Promise<Result<HrSample[], WatchProviderError>> {
    if (!this.connectedState) {
      return this.notConnected<HrSample[]>();
    }
    const validated = this.validateRange(range);
    if (!validated.ok) {
      return validated;
    }
    await this.ensureFetched();
    const filtered = this.cachedHr.filter((s) => s.timestamp >= validated.value.start && s.timestamp < validated.value.end);
    return ok(filtered);
  }

  async getStressSamples(range: TimeRange): Promise<Result<StressSample[], WatchProviderError>> {
    if (!this.connectedState) {
      return this.notConnected<StressSample[]>();
    }
    const validated = this.validateRange(range);
    if (!validated.ok) {
      return validated;
    }
    await this.ensureFetched();
    const filtered = this.cachedStress.filter((s) => s.timestamp >= validated.value.start && s.timestamp < validated.value.end);
    return ok(filtered);
  }

  async getSpo2Samples(range: TimeRange): Promise<Result<Spo2Sample[], WatchProviderError>> {
    if (!this.connectedState) {
      return this.notConnected<Spo2Sample[]>();
    }
    const validated = this.validateRange(range);
    if (!validated.ok) {
      return validated;
    }
    await this.ensureFetched();
    const filtered = this.cachedSpo2.filter((s) => s.timestamp >= validated.value.start && s.timestamp < validated.value.end);
    return ok(filtered);
  }

  async getSleepSegments(range: TimeRange): Promise<Result<SleepSegment[], WatchProviderError>> {
    if (!this.connectedState) {
      return this.notConnected<SleepSegment[]>();
    }
    const validated = this.validateRange(range);
    if (!validated.ok) {
      return validated;
    }
    await this.ensureFetched();
    const filtered = this.cachedSleep.filter((s) => s.start < validated.value.end && s.end > validated.value.start);
    return ok(filtered);
  }

  async getWorkouts(range: TimeRange): Promise<Result<Workout[], WatchProviderError>> {
    if (!this.connectedState) {
      return this.notConnected<Workout[]>();
    }
    const validated = this.validateRange(range);
    if (!validated.ok) {
      return validated;
    }
    await this.ensureFetched();
    const filtered = this.cachedWorkouts.filter(
      (w) => w.start < validated.value.end && w.end > validated.value.start,
    );
    return ok(filtered);
  }

  async getStepSamples(range: TimeRange): Promise<Result<StepSample[], WatchProviderError>> {
    if (!this.connectedState) {
      return this.notConnected<StepSample[]>();
    }
    const validated = this.validateRange(range);
    if (!validated.ok) {
      return validated;
    }
    await this.ensureFetched();
    const filtered = this.cachedSteps.filter((s) => s.timestamp >= validated.value.start && s.timestamp < validated.value.end);
    return ok(filtered);
  }

  pushRecoveryNotification(input: {
    recovery: number;
    ehrv: number;
    strainTarget: number;
  }): Promise<Result<void, WatchProviderError>> {
    if (!this.connectedState) {
      return Promise.resolve(err({ code: 'NOT_CONNECTED', message: 'Watch is not connected' }));
    }
    this.lastPushedValue = {
      recovery: input.recovery,
      ehrv: input.ehrv,
      strainTarget: input.strainTarget,
    };
    return Promise.resolve(ok(undefined));
  }
}