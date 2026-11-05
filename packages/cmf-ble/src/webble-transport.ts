/**
 * Web Bluetooth transport for the CMF Watch Pro 2.
 *
 * Implements {@link BleTransport} using `navigator.bluetooth` (Chromium only,
 * not iOS Safari). The CMF 0xF5 protocol runs on the FFF0 service (write FFF2,
 * notify FFF1). First-time pairing additionally uses the 77D4 shell channel
 * (`AT GETSECRET`), so that channel is requested as an optional service and
 * wired up when the watch exposes it.
 */
import { ok, err, type Result } from '@noop-cmf/types';
import type { BleTransport, NotifyHandler, TransportError } from './mock-transport.js';
import {
  VENDOR_77D4_NOTIFY_CHAR_UUID,
  VENDOR_77D4_SERVICE_UUID,
  VENDOR_77D4_WRITE_CHAR_UUID,
  VENDOR_FFF0_SERVICE_UUID,
  VENDOR_FFF1_NOTIFY_CHAR_UUID,
  VENDOR_FFF2_WRITE_CHAR_UUID,
} from './uuids.js';

/** Device name prefix used to surface only CMF watches in the chooser. */
export const CMF_DEVICE_NAME_PREFIX = 'CMF Watch Pro';

/** Minimal Web Bluetooth API surface (Chromium-only, absent from lib.dom). */
export interface BluetoothDeviceLike {
  readonly gatt: { connect(): Promise<BluetoothServerLike> };
}

export interface BluetoothServerLike {
  readonly connected: boolean;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothServiceLike>;
}

export interface BluetoothServiceLike {
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike>;
}

export interface BluetoothCharacteristicLike {
  writeValue(value: ArrayBuffer | Uint8Array): Promise<void>;
  startNotifications(): Promise<BluetoothCharacteristicLike>;
  addEventListener(type: string, handler: (event: Event) => void): void;
}

export interface BluetoothLike {
  requestDevice(options: {
    readonly filters: ReadonlyArray<{ readonly namePrefix?: string; readonly services?: readonly string[] }>;
    readonly optionalServices: readonly string[];
  }): Promise<BluetoothDeviceLike>;
}

/** Read `navigator.bluetooth`, or `undefined` when unavailable (SSR / non-Chromium). */
export function getNavigatorBluetooth(): BluetoothLike | undefined {
  const nav = globalThis as unknown as { navigator?: { bluetooth?: BluetoothLike } };
  return nav.navigator?.bluetooth;
}

/** Live Web Bluetooth transport backed by the CMF vendor channels. */
export class WebBleTransport implements BleTransport {
  private readonly bluetooth: BluetoothLike;
  private server: BluetoothServerLike | undefined;
  private writeChar: BluetoothCharacteristicLike | undefined;
  private notifyChar: BluetoothCharacteristicLike | undefined;
  private shellWriteChar: BluetoothCharacteristicLike | undefined;
  private shellNotifyChar: BluetoothCharacteristicLike | undefined;
  private readonly handlers = new Set<NotifyHandler>();

  constructor(bluetooth: BluetoothLike) {
    this.bluetooth = bluetooth;
  }

  async connect(): Promise<Result<void, TransportError>> {
    try {
      const device = await this.bluetooth.requestDevice({
        filters: [{ namePrefix: CMF_DEVICE_NAME_PREFIX }],
        optionalServices: [VENDOR_FFF0_SERVICE_UUID, VENDOR_77D4_SERVICE_UUID],
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(VENDOR_FFF0_SERVICE_UUID);
      this.writeChar = await service.getCharacteristic(VENDOR_FFF2_WRITE_CHAR_UUID);
      this.notifyChar = await service.getCharacteristic(VENDOR_FFF1_NOTIFY_CHAR_UUID);
      await this.connectShell(server);
      this.server = server;
      return ok(undefined);
    } catch (error) {
      return err({
        code: 'NOT_CONNECTED',
        message: error instanceof Error ? error.message : 'Web Bluetooth connect failed',
      });
    }
  }

  /** Best-effort: the shell channel is only needed for first-time pairing. */
  private async connectShell(server: BluetoothServerLike): Promise<void> {
    try {
      const shell = await server.getPrimaryService(VENDOR_77D4_SERVICE_UUID);
      this.shellWriteChar = await shell.getCharacteristic(VENDOR_77D4_WRITE_CHAR_UUID);
      this.shellNotifyChar = await shell.getCharacteristic(VENDOR_77D4_NOTIFY_CHAR_UUID);
    } catch {
      this.shellWriteChar = undefined;
      this.shellNotifyChar = undefined;
    }
  }

  disconnect(): Promise<Result<void, TransportError>> {
    try {
      this.server?.disconnect();
    } catch {
      // Ignore disconnect teardown failures.
    }
    this.server = undefined;
    this.writeChar = undefined;
    this.notifyChar = undefined;
    this.shellWriteChar = undefined;
    this.shellNotifyChar = undefined;
    this.handlers.clear();
    return Promise.resolve(ok(undefined));
  }

  private writeTarget(uuid: string): BluetoothCharacteristicLike | undefined {
    if (uuid === VENDOR_FFF2_WRITE_CHAR_UUID) {
      return this.writeChar;
    }
    if (uuid === VENDOR_77D4_WRITE_CHAR_UUID) {
      return this.shellWriteChar;
    }
    return undefined;
  }

  private notifyTarget(uuid: string): BluetoothCharacteristicLike | undefined {
    if (uuid === VENDOR_FFF1_NOTIFY_CHAR_UUID) {
      return this.notifyChar;
    }
    if (uuid === VENDOR_77D4_NOTIFY_CHAR_UUID) {
      return this.shellNotifyChar;
    }
    return undefined;
  }

  async writeCharacteristic(
    uuid: string,
    value: Uint8Array,
  ): Promise<Result<void, TransportError>> {
    const target = this.writeTarget(uuid);
    if (!target || !this.server?.connected) {
      return err({ code: 'NOT_CONNECTED', message: `Cannot write ${uuid}` });
    }
    try {
      await target.writeValue(value);
      return ok(undefined);
    } catch (error) {
      return err({
        code: 'NOT_CONNECTED',
        message: error instanceof Error ? error.message : 'Write failed',
      });
    }
  }

  readCharacteristic(uuid: string): Promise<Result<Uint8Array, TransportError>> {
    return Promise.resolve(err({ code: 'UNKNOWN_CHAR', message: `Read not supported for ${uuid}` }));
  }

  async startNotifications(
    uuid: string,
    handler: NotifyHandler,
  ): Promise<Result<void, TransportError>> {
    const target = this.notifyTarget(uuid);
    if (!target || !this.server?.connected) {
      return err({ code: 'NOTIFY_FAILED', message: `Cannot notify on ${uuid}` });
    }
    try {
      await target.startNotifications();
      target.addEventListener('characteristicvaluechanged', (event) => {
        const source = event.target as { value?: DataView } | null;
        const value = source?.value;
        if (value) {
          handler(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        }
      });
      this.handlers.add(handler);
      return ok(undefined);
    } catch (error) {
      return err({
        code: 'NOTIFY_FAILED',
        message: error instanceof Error ? error.message : 'Notify subscribe failed',
      });
    }
  }

  stopNotifications(uuid: string): Promise<Result<void, TransportError>> {
    if (!this.notifyTarget(uuid)) {
      return Promise.resolve(err({ code: 'NOTIFY_FAILED', message: `Cannot stop ${uuid}` }));
    }
    this.handlers.clear();
    return Promise.resolve(ok(undefined));
  }
}
