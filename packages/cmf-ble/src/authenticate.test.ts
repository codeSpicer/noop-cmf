import { describe, expect, it } from 'vitest';
import { authenticate } from './authenticate.js';
import { encodeEncryptedChunk } from './chunks.js';
import {
  AUTHENTICATED_CONFIRM_REPLY,
  AUTH_NONCE_REPLY,
  AUTH_WATCH_MAC,
} from './commands.js';
import { MockBleTransport } from './mock-transport.js';
import { encodePacket } from './packets.js';
import { CmfBleSession } from './session.js';
import { VENDOR_FFF1_NOTIFY_CHAR_UUID, VENDOR_FFF2_WRITE_CHAR_UUID } from './uuids.js';

/** Capture values: authenticating with this key + nonce must yield this session key. */
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

async function makeSession(): Promise<{ transport: MockBleTransport; session: CmfBleSession }> {
  const transport = new MockBleTransport({
    [VENDOR_FFF2_WRITE_CHAR_UUID]: { value: new Uint8Array(), notify: false },
    [VENDOR_FFF1_NOTIFY_CHAR_UUID]: { value: new Uint8Array(), notify: true },
  });
  await transport.connect();
  const session = new CmfBleSession(transport);
  await session.start();
  return { transport, session };
}

async function encryptedFrame(
  command: { cmd1: number; cmd2: number },
  plaintext: Uint8Array,
  key: Uint8Array,
): Promise<Uint8Array> {
  const chunk = await encodeEncryptedChunk(key, plaintext);
  if (!chunk.ok) {
    throw new Error(chunk.error);
  }
  const packet = encodePacket(command, 1, 1, chunk.value);
  if (!packet.ok) {
    throw new Error(packet.error);
  }
  return packet.value;
}

describe('authenticate', () => {
  it('runs the handshake and derives the captured session key', async () => {
    const { transport, session } = await makeSession();
    const macPayload = new Uint8Array([0x5a, ...WATCH_MAC]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [await encryptedFrame(AUTH_WATCH_MAC, macPayload, AUTH_KEY)]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [await encryptedFrame(AUTH_NONCE_REPLY, NONCE, AUTH_KEY)]);
    // Encrypted with the *expected* session key: success proves the derivation.
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      await encryptedFrame(AUTHENTICATED_CONFIRM_REPLY, new Uint8Array([0x5a]), SESSION_KEY),
    ]);

    const result = await authenticate(session, { model: 'Pixel 7a', authKey: AUTH_KEY });
    expect(result.ok).toBe(true);
  });

  it('fails when the watch sends an unexpected confirm reply', async () => {
    const { transport, session } = await makeSession();
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      await encryptedFrame(AUTH_WATCH_MAC, new Uint8Array([0x5a, ...WATCH_MAC]), AUTH_KEY),
    ]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [await encryptedFrame(AUTH_NONCE_REPLY, NONCE, AUTH_KEY)]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      await encryptedFrame(AUTHENTICATED_CONFIRM_REPLY, new Uint8Array([0x00]), SESSION_KEY),
    ]);

    const result = await authenticate(session, { model: 'Pixel 7a', authKey: AUTH_KEY });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('HANDSHAKE');
    }
  });

  it('times out when the confirm reply never arrives', async () => {
    const { transport, session } = await makeSession();
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      await encryptedFrame(AUTH_WATCH_MAC, new Uint8Array([0x5a, ...WATCH_MAC]), AUTH_KEY),
    ]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [await encryptedFrame(AUTH_NONCE_REPLY, NONCE, AUTH_KEY)]);

    const result = await authenticate(session, { model: 'Pixel 7a', authKey: AUTH_KEY, timeoutMs: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  });

  it('times out when the nonce reply never arrives', async () => {
    const { transport, session } = await makeSession();
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      await encryptedFrame(AUTH_WATCH_MAC, new Uint8Array([0x5a, ...WATCH_MAC]), AUTH_KEY),
    ]);

    const result = await authenticate(session, { model: 'Pixel 7a', authKey: AUTH_KEY, timeoutMs: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  });

  it('fails when the transport drops before the handshake writes', async () => {
    const { transport, session } = await makeSession();
    await transport.disconnect();

    const result = await authenticate(session, { model: 'Pixel 7a', authKey: AUTH_KEY });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TRANSPORT');
    }
  });
});
