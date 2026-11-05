/**
 * In-memory BLE transport simulating watch GATT characteristics.
 *
 * Mirrors the live probe's channel layout: each writable characteristic has
 * a paired notifier, writes are captured for assertions, and canned replies
 * can be scripted per characteristic.
 */
import { ok, err, type Result } from '@noop-cmf/types';

/** Machine-readable transport failure codes. */
export type TransportErrorCode = 'NOT_CONNECTED' | 'UNKNOWN_CHAR' | 'NOTIFY_FAILED';

/** Structured transport failure. */
export interface TransportError {
  readonly code: TransportErrorCode;
  readonly message: string;
}

/** Notification callback for subscribed characteristics. */
export type NotifyHandler = (value: Uint8Array) => void;

/**
 * Minimal GATT transport contract shared by the mock and the future WebBLE
 * transport. Pure in/out bytes — framing and crypto live one layer up.
 */
export interface BleTransport {
  connect(): Promise<Result<void, TransportError>>;
  disconnect(): Promise<Result<void, TransportError>>;
  writeCharacteristic(uuid: string, value: Uint8Array): Promise<Result<void, TransportError>>;
  readCharacteristic(uuid: string): Promise<Result<Uint8Array, TransportError>>;
  startNotifications(uuid: string, handler: NotifyHandler): Promise<Result<void, TransportError>>;
  stopNotifications(uuid: string): Promise<Result<void, TransportError>>;
}

interface MockCharacteristic {
  value: Uint8Array;
  notify: boolean;
}

/**
 * In-memory transport pre-seeded with the live probe's readable values
 * (battery level, model/manufacturer strings, PnP ID).
 */
export class MockBleTransport implements BleTransport {
  private connected = false;
  private readonly characteristics = new Map<string, MockCharacteristic>();
  private readonly handlers = new Map<string, Set<NotifyHandler>>();
  private readonly writes: Array<{ uuid: string; value: Uint8Array }> = [];
  private readonly replyBatches = new Map<string, Uint8Array[][]>();

  constructor(seed: Readonly<Record<string, { value: Uint8Array; notify: boolean }>> = {}) {
    for (const [uuid, entry] of Object.entries(seed)) {
      this.characteristics.set(uuid, { value: entry.value, notify: entry.notify });
    }
  }

  /** All writes received so far, in order. */
  getWrites(): ReadonlyArray<{ uuid: string; value: Uint8Array }> {
    return this.writes;
  }

  /**
   * Queue one batch of notify payloads. Each subsequent write to `writeUuid`
   * emits the next batch, so multi-step handshakes can be scripted up front.
   */
  scriptReply(writeUuid: string, payloads: readonly Uint8Array[]): void {
    const queue = this.replyBatches.get(writeUuid) ?? [];
    queue.push([...payloads]);
    this.replyBatches.set(writeUuid, queue);
  }

  connect(): Promise<Result<void, TransportError>> {
    this.connected = true;
    return Promise.resolve(ok(undefined));
  }

  disconnect(): Promise<Result<void, TransportError>> {
    this.connected = false;
    this.handlers.clear();
    return Promise.resolve(ok(undefined));
  }

  writeCharacteristic(uuid: string, value: Uint8Array): Promise<Result<void, TransportError>> {
    if (!this.connected) {
      return Promise.resolve(err({ code: 'NOT_CONNECTED', message: 'Transport is not connected' }));
    }
    const entry = this.characteristics.get(uuid);
    if (!entry) {
      return Promise.resolve(
        err({ code: 'UNKNOWN_CHAR', message: `Unknown characteristic ${uuid}` }),
      );
    }
    this.writes.push({ uuid, value: value.slice() });
    const queue = this.replyBatches.get(uuid);
    const batch = queue?.shift();
    if (queue && queue.length === 0) {
      this.replyBatches.delete(uuid);
    }
    if (batch) {
      for (const reply of batch) {
        this.emitToAll(reply);
      }
    }
    return Promise.resolve(ok(undefined));
  }

  readCharacteristic(uuid: string): Promise<Result<Uint8Array, TransportError>> {
    if (!this.connected) {
      return Promise.resolve(err({ code: 'NOT_CONNECTED', message: 'Transport is not connected' }));
    }
    const entry = this.characteristics.get(uuid);
    if (!entry) {
      return Promise.resolve(
        err({ code: 'UNKNOWN_CHAR', message: `Unknown characteristic ${uuid}` }),
      );
    }
    return Promise.resolve(ok(entry.value.slice()));
  }

  startNotifications(uuid: string, handler: NotifyHandler): Promise<Result<void, TransportError>> {
    if (!this.connected) {
      return Promise.resolve(err({ code: 'NOT_CONNECTED', message: 'Transport is not connected' }));
    }
    const entry = this.characteristics.get(uuid);
    if (!entry || !entry.notify) {
      return Promise.resolve(err({ code: 'NOTIFY_FAILED', message: `Cannot notify on ${uuid}` }));
    }
    let set = this.handlers.get(uuid);
    if (!set) {
      set = new Set();
      this.handlers.set(uuid, set);
    }
    set.add(handler);
    return Promise.resolve(ok(undefined));
  }

  stopNotifications(uuid: string): Promise<Result<void, TransportError>> {
    if (!this.connected) {
      return Promise.resolve(err({ code: 'NOT_CONNECTED', message: 'Transport is not connected' }));
    }
    this.handlers.delete(uuid);
    return Promise.resolve(ok(undefined));
  }

  /** Inject an inbound notification as if it arrived from the watch. */
  injectNotification(uuid: string, value: Uint8Array): void {
    const set = this.handlers.get(uuid);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler(value.slice());
    }
  }

  private emitToAll(value: Uint8Array): void {
    for (const set of this.handlers.values()) {
      for (const handler of set) {
        handler(value.slice());
      }
    }
  }
}
