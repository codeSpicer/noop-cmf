import { describe, expect, it } from 'vitest';
import { encodeEncryptedChunk, encodePlainChunk } from './chunks.js';
import { AUTH_PAIR_REPLY, AUTH_PAIR_REQUEST } from './commands.js';
import { MockBleTransport } from './mock-transport.js';
import { encodePacket, encryptedChunkPayloadSize, plaintextChunkSize } from './packets.js';
import { CmfBleSession } from './session.js';
import { VENDOR_FFF1_NOTIFY_CHAR_UUID, VENDOR_FFF2_WRITE_CHAR_UUID } from './uuids.js';

const REQUEST = { cmd1: 0xffff, cmd2: 0x8005 };
const RESPONSE = { cmd1: 0xffff, cmd2: 0x0005 };
const KEY = new Uint8Array(16).fill(0x2a);

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

/** Split `payload` the same way `CmfBleSession.send` does, wrapping each part. */
function plainFrames(payload: Uint8Array, command: { cmd1: number; cmd2: number } = RESPONSE): Uint8Array[] {
  const chunkSize = plaintextChunkSize();
  const chunkCount = Math.max(1, Math.ceil(payload.length / chunkSize));
  const frames: Uint8Array[] = [];
  for (let i = 0; i < chunkCount; i += 1) {
    frames.push(mustEncode(command, chunkCount, i + 1, encodePlainChunk(payload.subarray(i * chunkSize, Math.min(payload.length, (i + 1) * chunkSize)))));
  }
  return frames;
}

async function encryptedFrames(payload: Uint8Array, command: { cmd1: number; cmd2: number } = RESPONSE): Promise<Uint8Array[]> {
  const size = encryptedChunkPayloadSize();
  if (!size.ok) {
    throw new Error(size.error);
  }
  const chunkSize = size.value;
  const chunkCount = Math.max(1, Math.ceil(payload.length / chunkSize));
  const frames: Uint8Array[] = [];
  for (let i = 0; i < chunkCount; i += 1) {
    const slice = payload.subarray(i * chunkSize, Math.min(payload.length, (i + 1) * chunkSize));
    const chunk = await encodeEncryptedChunk(KEY, slice);
    if (!chunk.ok) {
      throw new Error(chunk.error);
    }
    frames.push(mustEncode(command, chunkCount, i + 1, chunk.value));
  }
  return frames;
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

  it('fails encrypted send without a key', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const result = await session.send(REQUEST, new Uint8Array([1]), { encrypted: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CRYPTO');
    }
  });

  it('reassembles and dispatches a single-chunk plaintext response', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const responsePayload = new Uint8Array([0xaa, 0xbb]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, plainFrames(responsePayload));
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([0xaa, 0xbb]);
    }
  });

  it('reassembles a multi-chunk plaintext response', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const responsePayload = new Uint8Array(300);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, plainFrames(responsePayload));
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([...responsePayload]);
    }
  });

  it('reassembles an encrypted response', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    session.setKey(KEY);
    await session.start();
    const responsePayload = new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256));
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, await encryptedFrames(responsePayload));
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE, { encrypted: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([...responsePayload]);
    }
  });

  it('times out when no response arrives', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE, { timeoutMs: 50 });
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
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, plainFrames(new Uint8Array([0xaa])));
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    expect(result.ok).toBe(true);
  });

  it('ignores notifications without a pending request', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const stray = { cmd1: 0xffff, cmd2: 0x0007 };
    transport.injectNotification(
      VENDOR_FFF1_NOTIFY_CHAR_UUID,
      mustEncode(stray, 1, 1, encodePlainChunk(new Uint8Array([0xaa]))),
    );
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, plainFrames(new Uint8Array([0xbb])));
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([0xbb]);
    }
  });

  it('ignores frames that fail to decode', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    session.setKey(KEY);
    await session.start();
    const stray = { cmd1: 0xffff, cmd2: 0x0008 };
    transport.injectNotification(
      VENDOR_FFF1_NOTIFY_CHAR_UUID,
      mustEncode(stray, 1, 1, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])),
    );
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, await encryptedFrames(new Uint8Array([0xbb])));
    const result = await session.request(REQUEST, new Uint8Array([1]), RESPONSE, { encrypted: true });
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

  it('reassembles one frame split across several notifications', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const frame = mustEncode(RESPONSE, 1, 1, encodePlainChunk(new Uint8Array([0xaa, 0xbb])));
    const pending = session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    transport.injectNotification(VENDOR_FFF1_NOTIFY_CHAR_UUID, frame.slice(0, 9));
    transport.injectNotification(VENDOR_FFF1_NOTIFY_CHAR_UUID, frame.slice(9));
    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([0xaa, 0xbb]);
    }
  });

  it('accepts a plaintext frame whose declared length counts an unsent CRC', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const body = new Uint8Array([1, 2, 3, 4]);
    const frame = new Uint8Array(11 + body.length);
    const view = new DataView(frame.buffer);
    view.setUint8(0, 0xf5);
    view.setUint16(1, body.length + 4, false);
    view.setUint16(3, 0xffff, false);
    view.setUint16(5, 1, false);
    view.setUint16(7, 1, false);
    view.setUint16(9, 0x0048, false);
    frame.set(body, 11);
    const pending = session.request(AUTH_PAIR_REQUEST, new Uint8Array([1]), AUTH_PAIR_REPLY);
    transport.injectNotification(VENDOR_FFF1_NOTIFY_CHAR_UUID, frame);
    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([1, 2, 3, 4]);
    }
  });

  it('waits for the rest of a frame that is still arriving', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const frame = mustEncode(RESPONSE, 1, 1, encodePlainChunk(new Uint8Array([0x11])));
    const pending = session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    // A lone header is not enough to emit a frame; the body arrives later.
    transport.injectNotification(VENDOR_FFF1_NOTIFY_CHAR_UUID, frame.slice(0, 11));
    transport.injectNotification(VENDOR_FFF1_NOTIFY_CHAR_UUID, frame.slice(11));
    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([0x11]);
    }
  });

  it('recovers from a stray non-header byte between frames', async () => {
    const transport = await makeTransport();
    const session = new CmfBleSession(transport);
    await session.start();
    const frame = mustEncode(RESPONSE, 1, 1, encodePlainChunk(new Uint8Array([0xcc])));
    transport.injectNotification(VENDOR_FFF1_NOTIFY_CHAR_UUID, new Uint8Array([0x00, 0x11]));
    const pending = session.request(REQUEST, new Uint8Array([1]), RESPONSE);
    transport.injectNotification(VENDOR_FFF1_NOTIFY_CHAR_UUID, frame);
    const result = await pending;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.value]).toEqual([0xcc]);
    }
  });
});
