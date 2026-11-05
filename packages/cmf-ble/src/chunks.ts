/**
 * Per-chunk envelopes: CRC32 suffix for plaintext chunks, and
 * AES-128-CBC + PKCS#7 over `payload || CRC32` for encrypted chunks.
 *
 * CRC32 is the IEEE 802.3 variant (poly 0xEDB88320, reflected, init
 * 0xFFFFFFFF, final XOR 0xFFFFFFFF), serialised little-endian to match
 * Gadgetbridge's `BLETypeConversions.fromUint32`.
 */
import { ok, err, type Result } from '@noop-cmf/types';
import { decryptAes128Cbc, encryptAes128Cbc } from './crypto.js';
import { CHUNK_CRC_BYTES, CMF_AES_IV } from './packets.js';

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

/** CRC32 (IEEE 802.3) of `data`, returned as an unsigned 32-bit integer. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i] ?? 0;
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Encode a plaintext chunk: `payload || CRC32(payload)` little-endian.
 */
export function encodePlainChunk(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + CHUNK_CRC_BYTES);
  out.set(payload, 0);
  const sum = crc32(payload);
  const view = new DataView(out.buffer);
  view.setUint32(payload.length, sum, true);
  return out;
}

/**
 * Decode and verify a plaintext chunk, returning the payload.
 */
export function decodePlainChunk(chunk: Uint8Array): Result<Uint8Array, string> {
  if (chunk.length < CHUNK_CRC_BYTES) {
    return err(`Chunk too short for CRC: ${String(chunk.length)} bytes`);
  }
  const payload = chunk.slice(0, chunk.length - CHUNK_CRC_BYTES);
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  const stored = view.getUint32(chunk.length - CHUNK_CRC_BYTES, true);
  const computed = crc32(payload);
  if (stored !== computed) {
    return err(`CRC mismatch: stored 0x${stored.toString(16)} computed 0x${computed.toString(16)}`);
  }
  return ok(payload);
}

/**
 * Encode an encrypted chunk: AES-128-CBC/PKCS#7 (fixed `CMF_AES_IV`) over
 * `payload || CRC32(payload)`.
 */
export async function encodeEncryptedChunk(
  key: Uint8Array,
  payload: Uint8Array,
): Promise<Result<Uint8Array, string>> {
  const result = await encryptAes128Cbc(key, CMF_AES_IV, encodePlainChunk(payload));
  if (!result.ok) {
    return err(result.error.message);
  }
  return ok(result.value);
}

/**
 * Decrypt an encrypted chunk and verify its inner CRC32.
 */
export async function decodeEncryptedChunk(
  key: Uint8Array,
  chunk: Uint8Array,
): Promise<Result<Uint8Array, string>> {
  const result = await decryptAes128Cbc(key, CMF_AES_IV, chunk);
  if (!result.ok) {
    return err(result.error.message);
  }
  return decodePlainChunk(result.value);
}
