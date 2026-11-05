import { describe, expect, it } from 'vitest';
import {
  crc32,
  decodeEncryptedChunk,
  decodePlainChunk,
  encodeEncryptedChunk,
  encodePlainChunk,
} from './chunks.js';

const KEY = new Uint8Array(16).fill(0x2a);

describe('crc32', () => {
  it('produces the known IEEE 802.3 check value for "123456789"', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('plaintext chunk envelope', () => {
  it('round-trips a payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const decoded = decodePlainChunk(encodePlainChunk(payload));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect([...decoded.value]).toEqual([...payload]);
    }
  });

  it('appends a big-endian CRC', () => {
    const payload = new TextEncoder().encode('123456789');
    const chunk = encodePlainChunk(payload);
    expect(chunk.length).toBe(payload.length + 4);
    const view = new DataView(chunk.buffer);
    expect(view.getUint32(payload.length, false)).toBe(0xcbf43926);
  });

  it('rejects tampered payloads', () => {
    const chunk = encodePlainChunk(new Uint8Array([1, 2, 3]));
    chunk[0] = (chunk[0] ?? 0) ^ 0xff;
    expect(decodePlainChunk(chunk).ok).toBe(false);
  });

  it('rejects truncated chunks', () => {
    expect(decodePlainChunk(new Uint8Array([1, 2])).ok).toBe(false);
  });
});

describe('encrypted chunk envelope', () => {
  it('round-trips a payload', async () => {
    const payload = new Uint8Array(Array.from({ length: 64 }, (_, i) => i));
    const encoded = await encodeEncryptedChunk(KEY, payload);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    expect(encoded.value.length).toBe(80);
    const decoded = await decodeEncryptedChunk(KEY, encoded.value);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect([...decoded.value]).toEqual([...payload]);
    }
  });

  it('rejects the wrong key', async () => {
    const encoded = await encodeEncryptedChunk(KEY, new Uint8Array([1, 2, 3]));
    if (!encoded.ok) {
      return;
    }
    const decoded = await decodeEncryptedChunk(new Uint8Array(16).fill(0x00), encoded.value);
    expect(decoded.ok).toBe(false);
  });

  it('passes through crypto errors', async () => {
    const decoded = await decodeEncryptedChunk(new Uint8Array([1, 2]), new Uint8Array(16));
    expect(decoded.ok).toBe(false);
  });
});
