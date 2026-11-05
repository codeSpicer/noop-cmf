/**
 * Web Bluetooth transport for the CMF Watch Pro 2 data channel.
 *
 * Implements {@link BleTransport} using `navigator.bluetooth` (Chromium only,
 * not iOS Safari). The CMF 0xF5 protocol runs on the FFF0 service: writes go
 * to FFF2 and notifications arrive on FFF1 (confirmed against the live HCI
 * snoop capture, ATT handles 0x38 and 0x3A).
 */
import { ok, err, type Result } from '@noop-cmf/types';
import type { BleTransport, NotifyHandler, TransportError } from './mock-transport.js';
import {
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

/** Live Web Bluetooth transport backed by the FFF0 vendor channel. */
export class WebBleTransport implements BleTransport {
  private readonly bluetooth: BluetoothLike;
  private server: BluetoothServerLike | undefined;
  private writeChar: BluetoothCharacteristicLike | undefined;
  private notifyChar: BluetoothCharacteristicLike | undefined;
  private readonly handlers = new Set<NotifyHandler>();

  constructor(bluetooth: BluetoothLike) {
    this.bluetooth = bluetooth;
  }

  async connect(): Promise<Result<void, TransportError>> {
    try {
      const device = await this.bluetooth.requestDevice({
        filters: [{ namePrefix: CMF_DEVICE_NAME_PREFIX }],
        optionalServices: [VENDOR_FFF0_SERVICE_UUID],
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(VENDOR_FFF0_SERVICE_UUID);
      const writeChar = await service.getCharacteristic(VENDOR_FFF2_WRITE_CHAR_UUID);
      const notifyChar = await service.getCharacteristic(VENDOR_FFF1_NOTIFY_CHAR_UUID);
      this.server = server;
      this.writeChar = writeChar;
      this.notifyChar = notifyChar;
      return ok(undefined);
    } catch (error) {
      return err({
        code: 'NOT_CONNECTED',
        message: error instanceof Error ? error.message : 'Web Bluetooth connect failed',
      });
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
    this.handlers.clear();
    return Promise.resolve(ok(undefined));
  }

  async writeCharacteristic(
    uuid: string,
    value: Uint8Array,
  ): Promise<Result<void, TransportError>> {
    if (uuid !== VENDOR_FFF2_WRITE_CHAR_UUID || !this.writeChar || !this.server?.connected) {
      return err({ code: 'NOT_CONNECTED', message: `Cannot write ${uuid}` });
    }
    try {
      await this.writeChar.writeValue(value);
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
    if (uuid !== VENDOR_FFF1_NOTIFY_CHAR_UUID || !this.notifyChar || !this.server?.connected) {
      return err({ code: 'NOTIFY_FAILED', message: `Cannot notify on ${uuid}` });
    }
    try {
      await this.notifyChar.startNotifications();
      this.notifyChar.addEventListener('characteristicvaluechanged', (event) => {
        const target = event.target as { value?: DataView } | null;
        const value = target?.value;
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
    if (uuid !== VENDOR_FFF1_NOTIFY_CHAR_UUID) {
      return Promise.resolve(err({ code: 'NOTIFY_FAILED', message: `Cannot stop ${uuid}` }));
    }
    this.handlers.clear();
    return Promise.resolve(ok(undefined));
  }
}
