import { describe, expect, it } from 'vitest';
import { CmfBleProvider } from './cmf-ble-provider.js';
import { encodeEncryptedChunk } from './chunks.js';
import { MockBleTransport } from './mock-transport.js';
import { encodePacket } from './packets.js';
import { VENDOR_FFF1_NOTIFY_CHAR_UUID, VENDOR_FFF2_WRITE_CHAR_UUID } from './uuids.js';

const AUTH_KEY = hex('570D5599E3919C99B3E218166170F4AE');
const NONCE = hex('0DA46D9F49FEE4085965E7ED196DAA0D');
const SESSION_KEY = hex('B64406386BC1805E0D86DD0844A88E3D');
const WATCH_MAC = hex('3CB0EDE0ED9B');

function hex(value: string): Uint8Array {
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function encryptedFrame(
  command: { cmd1: number; cmd2: number },
  plaintext: Uint8Array,
  key: Uint8Array,
): Promise<Uint8Array> {
  const chunk = await encodeEncryptedChunk(key, plaintext);
  if (!chunk.ok) throw new Error(chunk.error);
  const packet = encodePacket(command, 1, 1, chunk.value);
  if (!packet.ok) throw new Error(packet.error);
  return packet.value;
}

function makeTransport(): MockBleTransport {
  return new MockBleTransport({
    [VENDOR_FFF2_WRITE_CHAR_UUID]: { value: new Uint8Array(), notify: false },
    [VENDOR_FFF1_NOTIFY_CHAR_UUID]: { value: new Uint8Array(), notify: true },
  });
}

describe('CmfBleProvider', () => {
  it('reports NOT_CONNECTED before connect', async () => {
    const transport = makeTransport();
    const provider = new CmfBleProvider({ authKey: AUTH_KEY, transport });
    const result = await provider.getHeartRateSamples({ start: 0 as never, end: 1 as never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_CONNECTED');
  });

  it('connects with a persisted auth key and exposes it', async () => {
    const transport = makeTransport();
    await transport.connect();
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [await encryptedFrame({ cmd1: 0xffff, cmd2: 0x0049 }, new Uint8Array([0x5a, ...WATCH_MAC]), AUTH_KEY)]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [await encryptedFrame({ cmd1: 0xffff, cmd2: 0x004c }, NONCE, AUTH_KEY)]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [await encryptedFrame({ cmd1: 0xffff, cmd2: 0x0004 }, new Uint8Array([0x5a]), SESSION_KEY)]);

    const provider = new CmfBleProvider({ model: 'Pixel 7a', authKey: AUTH_KEY, transport });
    const connected = await provider.connect();
    expect(connected.ok).toBe(true);
    expect(provider.authKey).toBeDefined();

    // fetch runs against the mock (no data replies), yielding empty arrays
    const hr = await provider.getHeartRateSamples({ start: 0 as never, end: 1 as never });
    expect(hr.ok).toBe(true);
    if (hr.ok) expect(hr.value).toEqual([]);

    const pushed = await provider.pushRecoveryNotification({ recovery: 72, ehrv: 110, strainTarget: 14.3 });
    expect(pushed.ok).toBe(true);
    expect(provider.lastPushedNotification).toBeDefined();

    const disconnected = await provider.disconnect();
    expect(disconnected.ok).toBe(true);
  }, 30000);

  it('fails connect when no transport is configured', async () => {
    const provider = new CmfBleProvider({ authKey: AUTH_KEY });
    const result = await provider.connect();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_CONNECTED');
  });
});