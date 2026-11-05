import { describe, expect, it } from 'vitest';
import { MockBleTransport } from './mock-transport.js';
import { encodePacket } from './packets.js';
import { CmfBleSession } from './session.js';
import { VENDOR_FFF1_NOTIFY_CHAR_UUID, VENDOR_FFF2_WRITE_CHAR_UUID } from './uuids.js';

const REQUEST = { cmd1: 0xffff, cmd2: 0x8005 };
const RESPONSE = { cmd1: 0xffff, cmd2: 0x0005 };

async function makeTransport(): Promise<MockBleTransport> {
  const transport = new MockBleTransport({
    [VENDOR_FFF2_WRITE_CHAR_UUID]: { value: new Uint8Array(), notify: false },
    [VENDOR_FFF1_NOTIFY_CHAR_UUID]: { value: new Uint8Array(), notify: true },
  });
  await transport.connect();
  return transport;
}

function mustEncode(
  command: { cmd1: number; cmd2: number },
  chunkCount: number,
  chunkIndex: number,
  payload: Uint8Array,
): Uint8Array {
  const encoded = encodePacket(command, chunkCount, chunkIndex, payload);
  if (!encoded.ok) {
    throw new Error(encoded.error);
  }
  return encoded.value;
}

describe('CmfBleSession', () => {
  it('writes a single-chunk command', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    expect((await session.start()).ok).toBe(true);
    expect((await session.send(REQUEST, new Uint8Array([1, 2, 3]))).ok).toBe(true);
    expect(transport.getWrites()).toHaveLength(1);
  });

  it('chunks and writes a payload larger than one chunk', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const payload = new Uint8Array(300);
    expect((await session.send(REQUEST, payload)).ok).toBe(true);
    expect(transport.getWrites()).toHaveLength(2);
  });

  it('reassembles and dispatches a single-chunk response', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const responsePayload = new Uint8Array([0xaa, 0xbb]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      mustEncode(RESPONSE, 1, 1, responsePayload),
    ]);
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([0xaa, 0xbb]);
    }
  });

  it('reassembles a multi-chunk response', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const responsePayload = new Uint8Array(300);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      mustEncode(RESPONSE, 2, 1, responsePayload.subarray(0, 227)),
      mustEncode(RESPONSE, 2, 2, responsePayload.subarray(227)),
    ]);
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([...responsePayload]);
    }
  });

  it('times out when no response arrives', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE, 50);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  });

  it('ignores malformed notification frames', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    transport.injectNotification(VENDOR_FFF1_NOTIFY_CHAR_UUID, new Uint8Array([0x00, 0x01]));
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      mustEncode(RESPONSE, 1, 1, new Uint8Array([0xaa])),
    ]);
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    expect(result.ok).toBe(true);
  });

  it('ignores notifications without a pending request', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    transport.injectNotification(VENDOR_FFF1_NOTIFY_CHAR_UUID, mustEncode(RESPONSE, 1, 1, new Uint8Array([0xaa])));
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      mustEncode(RESPONSE, 1, 1, new Uint8Array([0xbb])),
    ]);
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([0xbb]);
    }
  });

  it('fails the request when the transport cannot write', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    await transport.disconnect();
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TRANSPORT');
    }
  });
});
