import { describe, expect, it } from 'vitest';
import { encodeEncryptedChunk, encodePlainChunk } from './chunks.js';
import { AUTHENTICATED_CONFIRM_REPLY, AUTH_NONCE_REPLY, AUTH_PAIR_REPLY, AUTH_WATCH_MAC } from './commands.js';
import { MockBleTransport } from './mock-transport.js';
import { pairWatch } from './pair.js';
import { encodePacket } from './packets.js';
import { CmfBleSession } from './session.js';
import {
  VENDOR_77D4_NOTIFY_CHAR_UUID,
  VENDOR_77D4_WRITE_CHAR_UUID,
  VENDOR_FFF1_NOTIFY_CHAR_UUID,
  VENDOR_FFF2_WRITE_CHAR_UUID,
} from './uuids.js';

/** Real capture values: pairing with these must yield the captured auth key. */
const APP_SECRET = '6E6DEC453F3C48BE85FFC0726A933C4F';
const AUTH_RANDOM_1 = hex('47D0AAADA462A37F53AF3426355DBF0F');
const AUTH_RANDOM_2 = hex('9580962A368F00675CDE6BF4B72F33B8');
const SIGNED_RANDOM_2 = hex('F4AC8E26A131B64A85945DBFD386F3EC7FB44079E4C775397CA433CBF47217E9');
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

function toHex(value: Uint8Array): string {
  return [...value].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function makeRig(): Promise<{ transport: MockBleTransport; session: CmfBleSession }> {
  const transport = new MockBleTransport({
    [VENDOR_FFF2_WRITE_CHAR_UUID]: { value: new Uint8Array(), notify: false },
    [VENDOR_FFF1_NOTIFY_CHAR_UUID]: { value: new Uint8Array(), notify: true },
    [VENDOR_77D4_WRITE_CHAR_UUID]: { value: new Uint8Array(), notify: false },
    [VENDOR_77D4_NOTIFY_CHAR_UUID]: { value: new Uint8Array(), notify: true },
  });
  await transport.connect();
  const session = new CmfBleSession(transport);
  await session.start();
  return { transport, session };
}

function plainFrame(command: { cmd1: number; cmd2: number }, body: Uint8Array): Uint8Array {
  const packet = encodePacket(command, 1, 1, encodePlainChunk(body));
  if (!packet.ok) {
    throw new Error(packet.error);
  }
  return packet.value;
}

async function encryptedFrame(
  command: { cmd1: number; cmd2: number },
  body: Uint8Array,
  key: Uint8Array,
): Promise<Uint8Array> {
  const chunk = await encodeEncryptedChunk(key, body);
  if (!chunk.ok) {
    throw new Error(chunk.error);
  }
  const packet = encodePacket(command, 1, 1, chunk.value);
  if (!packet.ok) {
    throw new Error(packet.error);
  }
  return packet.value;
}

function scriptShellSecret(transport: MockBleTransport, reply: string): void {
  transport.scriptReply(VENDOR_77D4_WRITE_CHAR_UUID, [new TextEncoder().encode(reply)]);
}

describe('pairWatch', () => {
  it('pairs a fresh watch and derives the captured auth key', async () => {
    const { transport, session } = await makeRig();
    scriptShellSecret(transport, `GETSECRET:${APP_SECRET.toLowerCase()},OK`);
    const pairReplyBody = new Uint8Array(48);
    pairReplyBody.set(AUTH_RANDOM_2, 0);
    pairReplyBody.set(SIGNED_RANDOM_2, 16);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [plainFrame(AUTH_PAIR_REPLY, pairReplyBody)]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      await encryptedFrame(AUTH_WATCH_MAC, new Uint8Array([0x5a, ...WATCH_MAC]), AUTH_KEY),
    ]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [await encryptedFrame(AUTH_NONCE_REPLY, NONCE, AUTH_KEY)]);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [
      await encryptedFrame(AUTHENTICATED_CONFIRM_REPLY, new Uint8Array([0x5a]), SESSION_KEY),
    ]);

    const result = await pairWatch(session, transport, { model: 'Pixel 7a', authRandom: AUTH_RANDOM_1 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(toHex(result.value)).toBe('570D5599E3919C99B3E218166170F4AE');
    }
  });

  it('rejects a watch signature that does not verify', async () => {
    const { transport, session } = await makeRig();
    scriptShellSecret(transport, `GETSECRET:${APP_SECRET.toLowerCase()},OK`);
    const badSignature = SIGNED_RANDOM_2.slice();
    badSignature[0] = (badSignature[0] ?? 0) ^ 0xff;
    const pairReplyBody = new Uint8Array(48);
    pairReplyBody.set(AUTH_RANDOM_2, 0);
    pairReplyBody.set(badSignature, 16);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [plainFrame(AUTH_PAIR_REPLY, pairReplyBody)]);

    const result = await pairWatch(session, transport, { model: 'Pixel 7a', authRandom: AUTH_RANDOM_1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('HANDSHAKE');
    }
  });

  it('rejects a malformed shell reply', async () => {
    const { transport, session } = await makeRig();
    scriptShellSecret(transport, 'NOT A SECRET');

    const result = await pairWatch(session, transport, { model: 'Pixel 7a', authRandom: AUTH_RANDOM_1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SHELL');
    }
  });

  it('times out when the shell never answers', async () => {
    const { transport, session } = await makeRig();

    const result = await pairWatch(session, transport, {
      model: 'Pixel 7a',
      authRandom: AUTH_RANDOM_1,
      timeoutMs: 50,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  });

  it('rejects a short AUTH_PAIR_REPLY', async () => {
    const { transport, session } = await makeRig();
    scriptShellSecret(transport, `GETSECRET:${APP_SECRET.toLowerCase()},OK`);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [plainFrame(AUTH_PAIR_REPLY, new Uint8Array(16))]);

    const result = await pairWatch(session, transport, { model: 'Pixel 7a', authRandom: AUTH_RANDOM_1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('HANDSHAKE');
    }
  });

  it('times out when AUTH_PAIR_REPLY never arrives', async () => {
    const { transport, session } = await makeRig();
    scriptShellSecret(transport, `GETSECRET:${APP_SECRET.toLowerCase()},OK`);

    const result = await pairWatch(session, transport, {
      model: 'Pixel 7a',
      authRandom: AUTH_RANDOM_1,
      timeoutMs: 50,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  });

  it('fails when WebCrypto is unavailable', async () => {
    const { transport, session } = await makeRig();
    scriptShellSecret(transport, `GETSECRET:${APP_SECRET.toLowerCase()},OK`);
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const result = await pairWatch(session, transport, { model: 'Pixel 7a', authRandom: AUTH_RANDOM_1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CRYPTO');
      }
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'crypto', original);
      }
    }
  });

  it('fails when the follow-on handshake never answers', async () => {
    const { transport, session } = await makeRig();
    scriptShellSecret(transport, `GETSECRET:${APP_SECRET.toLowerCase()},OK`);
    const pairReplyBody = new Uint8Array(48);
    pairReplyBody.set(AUTH_RANDOM_2, 0);
    pairReplyBody.set(SIGNED_RANDOM_2, 16);
    transport.scriptReply(VENDOR_FFF2_WRITE_CHAR_UUID, [plainFrame(AUTH_PAIR_REPLY, pairReplyBody)]);

    const result = await pairWatch(session, transport, {
      model: 'Pixel 7a',
      authRandom: AUTH_RANDOM_1,
      timeoutMs: 50,
      attempts: 1,
      retryDelayMs: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  });
});
