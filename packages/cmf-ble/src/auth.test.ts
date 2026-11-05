import { describe, expect, it } from 'vitest';
import {
  derivePairingAuthKey,
  deriveSessionKey,
  parseAuthKeyHex,
  parseShellSecret,
  signRandom,
  verifyPairSignature,
} from './auth.js';

/**
 * Vectors lifted from the live HCI capture (2026-10-23). If any derivation
 * regresses, these fail — they are the real watch's own outputs.
 */
const AUTH_RANDOM_1 = '47D0AAADA462A37F53AF3426355DBF0F';
const AUTH_RANDOM_2 = '9580962A368F00675CDE6BF4B72F33B8';
const APP_SECRET = '6E6DEC453F3C48BE85FFC0726A933C4F';
const SIGNED_RANDOM_1 = '5CD2CF223203DF2AE549DB51D6FA815990D3EB45ABD6223103BC413E2CF5AAF0';
const SIGNED_RANDOM_2 = 'F4AC8E26A131B64A85945DBFD386F3EC7FB44079E4C775397CA433CBF47217E9';
const AUTH_KEY = '570D5599E3919C99B3E218166170F4AE';
const NONCE = '0DA46D9F49FEE4085965E7ED196DAA0D';
const SESSION_KEY = 'B64406386BC1805E0D86DD0844A88E3D';

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

async function must<T>(promise: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>): Promise<T> {
  const result = await promise;
  if (!result.ok) {
    throw new Error(`unexpected failure: ${String(result.error)}`);
  }
  return result.value;
}

describe('parseAuthKeyHex', () => {
  it('parses a 32-char hex key', () => {
    const key = parseAuthKeyHex(AUTH_KEY);
    expect(key.ok).toBe(true);
    if (key.ok) {
      expect(toHex(key.value)).toBe(AUTH_KEY);
    }
  });

  it('tolerates a 0x prefix', () => {
    const key = parseAuthKeyHex(`0x${AUTH_KEY}`);
    expect(key.ok && toHex(key.value)).toBe(AUTH_KEY);
  });

  it('rejects wrong lengths and non-hex', () => {
    expect(parseAuthKeyHex('ABCD').ok).toBe(false);
    expect(parseAuthKeyHex('ZZ'.repeat(16)).ok).toBe(false);
  });
});

describe('parseShellSecret', () => {
  it('extracts the secret from a GETSECRET reply', () => {
    const secret = parseShellSecret(`GETSECRET:${APP_SECRET.toLowerCase()},OK\r\n`);
    expect(secret.ok && toHex(secret.value)).toBe(APP_SECRET);
  });

  it('rejects malformed replies', () => {
    expect(parseShellSecret('NOTHING').ok).toBe(false);
    expect(parseShellSecret(`GETSECRET:${APP_SECRET},FAIL`).ok).toBe(false);
  });
});

describe('capture-verified derivations', () => {
  it('signs authRandom1 to the captured signedRandom1', async () => {
    const signed = await must(signRandom(hex(AUTH_RANDOM_1), hex(APP_SECRET)));
    expect(toHex(signed)).toBe(SIGNED_RANDOM_1);
  });

  it('verifies the watch signature over authRandom2', async () => {
    const valid = await must(verifyPairSignature(hex(AUTH_RANDOM_2), hex(SIGNED_RANDOM_2), hex(APP_SECRET)));
    expect(valid).toBe(true);
  });

  it('rejects a tampered watch signature', async () => {
    const tampered = hex(SIGNED_RANDOM_2);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    const valid = await must(verifyPairSignature(hex(AUTH_RANDOM_2), tampered, hex(APP_SECRET)));
    expect(valid).toBe(false);
  });

  it('derives the captured auth key from a completed pairing', async () => {
    const key = await must(derivePairingAuthKey(hex(AUTH_RANDOM_1), hex(AUTH_RANDOM_2), hex(APP_SECRET)));
    expect(toHex(key)).toBe(AUTH_KEY);
  });

  it('derives the captured session key from the watch nonce', async () => {
    const session = await must(deriveSessionKey(hex(NONCE), hex(AUTH_KEY)));
    expect(toHex(session)).toBe(SESSION_KEY);
  });
});

describe('error handling', () => {
  it('rejects a signature of the wrong length', async () => {
    const valid = await must(verifyPairSignature(hex(AUTH_RANDOM_2), new Uint8Array(8), hex(APP_SECRET)));
    expect(valid).toBe(false);
  });

  it('propagates WebCrypto unavailability', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect((await signRandom(hex(AUTH_RANDOM_1), hex(APP_SECRET))).ok).toBe(false);
      expect((await verifyPairSignature(hex(AUTH_RANDOM_2), hex(SIGNED_RANDOM_2), hex(APP_SECRET))).ok).toBe(false);
      expect((await derivePairingAuthKey(hex(AUTH_RANDOM_1), hex(AUTH_RANDOM_2), hex(APP_SECRET))).ok).toBe(false);
      expect((await deriveSessionKey(hex(NONCE), hex(AUTH_KEY))).ok).toBe(false);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'crypto', original);
      }
    }
  });
});
