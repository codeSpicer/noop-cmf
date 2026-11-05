import { describe, expect, it } from 'vitest';
import { decryptAes128Cbc, encryptAes128Cbc, sha256 } from './crypto.js';

const KEY = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const IV = new Uint8Array([16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);

describe('sha256', () => {
  it('returns a deterministic 32-byte digest', async () => {
    const first = await sha256(new Uint8Array([1, 2, 3]));
    const second = await sha256(new Uint8Array([1, 2, 3]));
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.length).toBe(32);
      expect(first.value).toEqual(second.value);
    }
  });

  it('hashes the empty input to the known digest', async () => {
    const digest = await sha256();
    expect(digest.ok).toBe(true);
    if (digest.ok) {
      const hex = [...digest.value].map((b) => b.toString(16).padStart(2, '0')).join('');
      expect(hex).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    }
  });

  it('is order-sensitive over its chunks', async () => {
    const a = await sha256(new Uint8Array([1]), new Uint8Array([2]));
    const b = await sha256(new Uint8Array([2]), new Uint8Array([1]));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value).not.toEqual(b.value);
    }
  });

  it('reports WebCrypto unavailability', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect((await sha256(new Uint8Array([1]))).ok).toBe(false);
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
