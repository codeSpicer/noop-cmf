import { describe, expect, it, vi } from 'vitest';
import { BATTERY_LEVEL_UUID } from './uuids.js';
import { MockBleTransport } from './mock-transport.js';

const WRITE_UUID = '0000ffd1-0000-1000-8000-00805f9b34fb';
const NOTIFY_UUID = '0000ffd2-0000-1000-8000-00805f9b34fb';

function seeded(): MockBleTransport {
  return new MockBleTransport({
    [BATTERY_LEVEL_UUID]: { value: new Uint8Array([100]), notify: true },
    [WRITE_UUID]: { value: new Uint8Array(0), notify: false },
    [NOTIFY_UUID]: { value: new Uint8Array(0), notify: true },
  });
}

describe('MockBleTransport', () => {
  it('requires connection for every operation', async () => {
    const transport = seeded();
    expect((await transport.writeCharacteristic(WRITE_UUID, new Uint8Array([1]))).ok).toBe(false);
    expect((await transport.readCharacteristic(BATTERY_LEVEL_UUID)).ok).toBe(false);
    expect((await transport.startNotifications(NOTIFY_UUID, () => {})).ok).toBe(false);
    expect((await transport.stopNotifications(NOTIFY_UUID)).ok).toBe(false);
  });

  it('connects and reads seeded battery level', async () => {
    const transport = seeded();
    expect((await transport.connect()).ok).toBe(true);
    const read = await transport.readCharacteristic(BATTERY_LEVEL_UUID);
    expect(read.ok && read.value).toEqual(new Uint8Array([100]));
    expect((await transport.disconnect()).ok).toBe(true);
  });

  it('rejects unknown characteristics', async () => {
    const transport = seeded();
    await transport.connect();
    const write = await transport.writeCharacteristic('nope', new Uint8Array([1]));
    expect(write.ok).toBe(false);
    if (!write.ok) {
      expect(write.error.code).toBe('UNKNOWN_CHAR');
    }
    expect((await transport.readCharacteristic('nope')).ok).toBe(false);
  });

  it('records writes for assertion', async () => {
    const transport = seeded();
    await transport.connect();
    const payload = new TextEncoder().encode('AT GETSECRET\r\n');
    expect((await transport.writeCharacteristic(WRITE_UUID, payload)).ok).toBe(true);
    expect(transport.getWrites()).toHaveLength(1);
    expect(transport.getWrites()[0]?.uuid).toBe(WRITE_UUID);
    expect(transport.getWrites()[0]?.value).toEqual(payload);
  });

  it('delivers notifications to subscribers', async () => {
    const transport = seeded();
    await transport.connect();
    const handler = vi.fn();
    expect((await transport.startNotifications(NOTIFY_UUID, handler)).ok).toBe(true);
    transport.injectNotification(NOTIFY_UUID, new Uint8Array([1, 2, 3]));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect((await transport.stopNotifications(NOTIFY_UUID)).ok).toBe(true);
    transport.injectNotification(NOTIFY_UUID, new Uint8Array([4]));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects notify on write-only characteristics', async () => {
    const transport = seeded();
    await transport.connect();
    expect((await transport.startNotifications(WRITE_UUID, () => {})).ok).toBe(false);
  });

  it('ignores injections with no subscribers', async () => {
    const transport = seeded();
    await transport.connect();
    expect(() => {
      transport.injectNotification(NOTIFY_UUID, new Uint8Array([1]));
    }).not.toThrow();
  });

  it('emits scripted replies on write', async () => {
    const transport = seeded();
    await transport.connect();
    const handler = vi.fn();
    await transport.startNotifications(NOTIFY_UUID, handler);
    transport.scriptReply(WRITE_UUID, [new Uint8Array([0xaa]), new Uint8Array([0xbb])]);
    await transport.writeCharacteristic(WRITE_UUID, new Uint8Array([9]));
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
