import { describe, expect, it } from 'vitest';
import { chunkForMtu, crc32, decodeFrame, encodeFrame, FrameReassembler } from './frames.js';

describe('crc32', () => {
  it('matches the IEEE reference vector', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('encodeFrame and decodeFrame', () => {
  it('round-trips a payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = encodeFrame(7, 1, 0, payload);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    const decoded = decodeFrame(encoded.value);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.seq).toBe(7);
      expect(decoded.value.total).toBe(1);
      expect(decoded.value.index).toBe(0);
      expect(decoded.value.payload).toEqual(payload);
    }
  });

  it('round-trips an empty payload', () => {
    const encoded = encodeFrame(0, 1, 0, new Uint8Array(0));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    const decoded = decodeFrame(encoded.value);
    expect(decoded.ok && decoded.value.payload.length).toBe(0);
  });

  it('rejects corrupted frames via CRC32', () => {
    const encoded = encodeFrame(3, 1, 0, new Uint8Array([9, 9, 9]));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    const corrupted = encoded.value.slice();
    corrupted[10] = (corrupted[10] ?? 0) ^ 0xff;
    expect(decodeFrame(corrupted).ok).toBe(false);
  });

  it('rejects bad magic, version, and truncation', () => {
    const encoded = encodeFrame(1, 1, 0, new Uint8Array([5]));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    const badMagic = encoded.value.slice();
    badMagic[0] = 0x00;
    expect(decodeFrame(badMagic).ok).toBe(false);
    const badVersion = encoded.value.slice();
    badVersion[2] = 0x7f;
    expect(decodeFrame(badVersion).ok).toBe(false);
    expect(decodeFrame(new Uint8Array(3)).ok).toBe(false);
  });

  it('validates encode bounds', () => {
    expect(encodeFrame(-1, 1, 0, new Uint8Array(0)).ok).toBe(false);
    expect(encodeFrame(0, 0, 0, new Uint8Array(0)).ok).toBe(false);
    expect(encodeFrame(0, 2, 2, new Uint8Array(0)).ok).toBe(false);
    expect(encodeFrame(0x10000, 1, 0, new Uint8Array(0)).ok).toBe(false);
  });
});

describe('chunkForMtu', () => {
  it('splits a bulk payload into MTU-sized wire frames', () => {
    const data = new Uint8Array(100).fill(0xab);
    const chunks = chunkForMtu(9, data, 23);
    expect(chunks.ok).toBe(true);
    if (!chunks.ok) {
      return;
    }
    expect(chunks.value.length).toBe(Math.ceil(100 / 7));
    for (const chunk of chunks.value) {
      expect(chunk.length).toBeLessThanOrEqual(23);
    }
    const assembler = new FrameReassembler();
    let joined: Uint8Array | undefined;
    for (const chunk of chunks.value) {
      const result = assembler.feed(chunk);
      if (result.ok && result.value) {
        joined = result.value;
      }
    }
    expect(joined).toEqual(data);
  });

  it('rejects payloads that exceed the uint16 chunk count', () => {
    const data = new Uint8Array(65_536 * 7).fill(0xcd);
    expect(chunkForMtu(2, data, 23).ok).toBe(false);
  });

  it('handles empty data as a single frame', () => {
    const chunks = chunkForMtu(1, new Uint8Array(0), 23);
    expect(chunks.ok && chunks.value.length).toBe(1);
  });

  it('rejects MTUs with no payload room', () => {
    expect(chunkForMtu(1, new Uint8Array(10), 3).ok).toBe(false);
    expect(chunkForMtu(1, new Uint8Array(10), 16).ok).toBe(false);
    expect(chunkForMtu(1, new Uint8Array(10), 0).ok).toBe(false);
  });
});

describe('FrameReassembler', () => {
  it('reassembles out-of-order fragmented chunks', () => {
    const data = new Uint8Array(64);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = i;
    }
    const chunks = chunkForMtu(42, data, 23);
    expect(chunks.ok).toBe(true);
    if (!chunks.ok) {
      return;
    }
    const assembler = new FrameReassembler();
    const reversed = [...chunks.value].reverse();
    let joined: Uint8Array | undefined;
    for (const chunk of reversed) {
      const result = assembler.feed(chunk);
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        joined = result.value;
      }
    }
    expect(joined).toEqual(data);
  });

  it('rejects corrupted chunks without losing state', () => {
    const assembler = new FrameReassembler();
    const good = encodeFrame(5, 1, 0, new Uint8Array([1]));
    expect(good.ok).toBe(true);
    if (!good.ok) {
      return;
    }
    const corrupted = good.value.slice();
    corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xff;
    expect(assembler.feed(corrupted).ok).toBe(false);
    const retry = assembler.feed(good.value);
    expect(retry.ok && retry.value).toEqual(new Uint8Array([1]));
  });

  it('resets buffered partials', () => {
    const assembler = new FrameReassembler();
    const chunks = chunkForMtu(8, new Uint8Array(60).fill(2), 23);
    expect(chunks.ok).toBe(true);
    if (!chunks.ok) {
      return;
    }
    const first = assembler.feed(chunks.value[0] as Uint8Array);
    expect(first.ok && first.value).toBeUndefined();
    assembler.reset();
    let joined: Uint8Array | undefined;
    for (const chunk of chunks.value) {
      const result = assembler.feed(chunk);
      if (result.ok && result.value) {
        joined = result.value;
      }
    }
    expect(joined?.length).toBe(60);
  });

  it('handles duplicate chunk delivery', () => {
    const assembler = new FrameReassembler();
    const chunks = chunkForMtu(11, new Uint8Array(30).fill(3), 23);
    expect(chunks.ok).toBe(true);
    if (!chunks.ok) {
      return;
    }
    let completed = 0;
    for (const chunk of chunks.value) {
      const result = assembler.feed(chunk);
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        completed += 1;
      }
    }
    expect(completed).toBe(1);
    const duplicate = assembler.feed(chunks.value[0] as Uint8Array);
    expect(duplicate.ok && duplicate.value).toBeUndefined();
  });
});
