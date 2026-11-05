import { describe, expect, it } from 'vitest';
import {
  WebBleTransport,
  type BluetoothCharacteristicLike,
  type BluetoothDeviceLike,
  type BluetoothLike,
  type BluetoothServerLike,
  type BluetoothServiceLike,
} from './webble-transport.js';
import {
  VENDOR_FFF1_NOTIFY_CHAR_UUID,
  VENDOR_FFF2_WRITE_CHAR_UUID,
} from './uuids.js';

interface FakeBluetooth {
  readonly bluetooth: BluetoothLike;
  readonly writes: Uint8Array[];
  emitNotification(value: Uint8Array): void;
}

function makeFakeBluetooth(): FakeBluetooth {
  const writes: Uint8Array[] = [];
  let notifyHandler: ((event: Event) => void) | undefined;

  const writeChar: BluetoothCharacteristicLike = {
    writeValue: (value) => {
      writes.push(value instanceof Uint8Array ? value : new Uint8Array(value));
      return Promise.resolve();
    },
    startNotifications: () => Promise.resolve(writeChar),
    addEventListener: () => undefined,
  };

  const notifyChar: BluetoothCharacteristicLike = {
    writeValue: () => Promise.resolve(),
    startNotifications: () => Promise.resolve(notifyChar),
    addEventListener: (_type, handler) => {
      notifyHandler = handler;
    },
  };

  const service: BluetoothServiceLike = {
    getCharacteristic: (uuid) =>
      Promise.resolve(uuid === VENDOR_FFF2_WRITE_CHAR_UUID ? writeChar : notifyChar),
  };

  const server: BluetoothServerLike = {
    connected: true,
    disconnect: () => undefined,
    getPrimaryService: () => Promise.resolve(service),
  };

  const device: BluetoothDeviceLike = {
    gatt: { connect: () => Promise.resolve(server) },
  };

  const bluetooth: BluetoothLike = {
    requestDevice: () => Promise.resolve(device),
  };

  return {
    bluetooth,
    writes,
    emitNotification(value) {
      const dataView = new DataView(value.buffer, value.byteOffset, value.byteLength);
      const event = { target: { value: dataView } } as unknown as Event;
      notifyHandler?.(event);
    },
  };
}

describe('WebBleTransport', () => {
  it('connects and writes to the CMF write characteristic', async () => {
    const fake = makeFakeBluetooth();
    const transport = new WebBleTransport(fake.bluetooth);
    expect((await transport.connect()).ok).toBe(true);
    expect(
      (await transport.writeCharacteristic(VENDOR_FFF2_WRITE_CHAR_UUID, new Uint8Array([0xf5]))).ok,
    ).toBe(true);
    expect(fake.writes).toHaveLength(1);
    expect([...(fake.writes[0] ?? new Uint8Array())]).toEqual([0xf5]);
  });

  it('subscribes to notifications and forwards payloads', async () => {
    const fake = makeFakeBluetooth();
    const transport = new WebBleTransport(fake.bluetooth);
    await transport.connect();
    const received: Uint8Array[] = [];
    const started = await transport.startNotifications(VENDOR_FFF1_NOTIFY_CHAR_UUID, (value) => {
      received.push(value);
    });
    expect(started.ok).toBe(true);
    fake.emitNotification(new Uint8Array([0x10, 0x20]));
    expect(received).toHaveLength(1);
    expect([...(received[0] ?? new Uint8Array())]).toEqual([0x10, 0x20]);
  });

  it('rejects unsupported reads and unknown writes', async () => {
    const fake = makeFakeBluetooth();
    const transport = new WebBleTransport(fake.bluetooth);
    await transport.connect();
    expect((await transport.readCharacteristic('nope')).ok).toBe(false);
    expect((await transport.writeCharacteristic('nope', new Uint8Array())).ok).toBe(false);
  });

  it('fails to connect when the chooser throws', async () => {
    const bluetooth: BluetoothLike = {
      requestDevice: () => Promise.reject(new Error('user cancelled')),
    };
    const transport = new WebBleTransport(bluetooth);
    expect((await transport.connect()).ok).toBe(false);
  });
});
