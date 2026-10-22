import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_BYTES,
  decryptAes128Cbc,
  deriveChallengeResponse,
  encryptAes128Cbc,
} from './crypto.js';

const KEY = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const IV = new Uint8Array([16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);

describe('deriveChallengeResponse', () => {
  it('derives a deterministic 16-byte response', async () => {
    const challenge = new Uint8Array(CHALLENGE_BYTES).fill(7);
    const first = await deriveChallengeResponse('secret', challenge);
    const second = await deriveChallengeResponse('secret', challenge);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.length).toBe(16);
      expect(first.value).toEqual(second.value);
    }
  });

  it('differs across secrets and challenges', async () => {
    const a = await deriveChallengeResponse('one', new Uint8Array(CHALLENGE_BYTES).fill(1));
    const b = await deriveChallengeResponse('two', new Uint8Array(CHALLENGE_BYTES).fill(1));
    const c = await deriveChallengeResponse('one', new Uint8Array(CHALLENGE_BYTES).fill(2));
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(a.value).not.toEqual(b.value);
      expect(a.value).not.toEqual(c.value);
    }
  });

  it('accepts a Uint8Array secret', async () => {
    const challenge = new Uint8Array(CHALLENGE_BYTES).fill(3);
    const fromBytes = await deriveChallengeResponse(new Uint8Array([1, 2, 3]), challenge);
    const fromString = await deriveChallengeResponse(
      new TextDecoder().decode(new Uint8Array([1, 2, 3])),
      challenge,
    );
    expect(fromBytes.ok && fromString.ok).toBe(true);
  });

  it('rejects wrong-length challenges', async () => {
    const result = await deriveChallengeResponse('secret', new Uint8Array(8));
    expect(result.ok).toBe(false);
  });

  it('reports WebCrypto unavailability', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const derived = await deriveChallengeResponse('secret', new Uint8Array(CHALLENGE_BYTES));
      expect(derived.ok).toBe(false);
      const encrypted = await encryptAes128Cbc(
        new Uint8Array(16),
        new Uint8Array(16),
        new Uint8Array(16),
      );
      expect(encrypted.ok).toBe(false);
      const decrypted = await decryptAes128Cbc(
        new Uint8Array(16),
        new Uint8Array(16),
        new Uint8Array(16),
      );
      expect(decrypted.ok).toBe(false);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'crypto', original);
      }
    }
  });
});

describe('AES-128-CBC round trip', () => {
  it('encrypts and decrypts a frame payload', async () => {
    const plaintext = new TextEncoder().encode('recovery:72,ehrv:110');
    const encrypted = await encryptAes128Cbc(KEY, IV, plaintext);
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) {
      return;
    }
    expect(encrypted.value.length % 16).toBe(0);
    expect(encrypted.value).not.toEqual(plaintext);
    const decrypted = await decryptAes128Cbc(KEY, IV, encrypted.value);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(new TextDecoder().decode(decrypted.value)).toBe('recovery:72,ehrv:110');
    }
  });

  it('rejects bad key and IV lengths', async () => {
    const data = new Uint8Array(16);
    expect((await encryptAes128Cbc(new Uint8Array(8), IV, data)).ok).toBe(false);
    expect((await encryptAes128Cbc(KEY, new Uint8Array(8), data)).ok).toBe(false);
    expect((await decryptAes128Cbc(new Uint8Array(8), IV, data)).ok).toBe(false);
    expect((await decryptAes128Cbc(KEY, new Uint8Array(8), data)).ok).toBe(false);
  });

  it('fails decryption under the wrong key', async () => {
    const plaintext = new TextEncoder().encode('0123456789abcdef');
    const encrypted = await encryptAes128Cbc(KEY, IV, plaintext);
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) {
      return;
    }
    const wrongKey = KEY.slice();
    wrongKey[0] = 99;
    const decrypted = await decryptAes128Cbc(wrongKey, IV, encrypted.value);
    expect(decrypted.ok).toBe(false);
  });
});
