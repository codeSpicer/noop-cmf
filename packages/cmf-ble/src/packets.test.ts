import { describe, expect, it } from 'vitest';
import {
  CMF_DEFAULT_MTU,
  PACKET_HEADER,
  PACKET_HEADER_BYTES,
  decodePacket,
  encodePacket,
  encryptedChunkPayloadSize,
  plaintextChunkSize,
  PacketReassembler,
} from './packets.js';
import { BATTERY } from './commands.js';

describe('encodePacket and decodePacket', () => {
  it('round-trips a packet with payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const encoded = encodePacket(BATTERY, 1, 1, payload);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    expect(encoded.value[0]).toBe(PACKET_HEADER);
    expect(encoded.value.length).toBe(PACKET_HEADER_BYTES + payload.length);
    const decoded = decodePacket(encoded.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }
    expect(decoded.value.header.cmd1).toBe(0x005c);
    expect(decoded.value.header.cmd2).toBe(0x0001);
    expect(decoded.value.header.chunkCount).toBe(1);
    expect(decoded.value.header.chunkIndex).toBe(1);
    expect(decoded.value.header.payloadLength).toBe(payload.length);
    expect(decoded.value.payload).toEqual(payload);
  });

  it('round-trips an empty payload', () => {
    const encoded = encodePacket(BATTERY, 1, 1, new Uint8Array(0));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    const decoded = decodePacket(encoded.value);
    expect(decoded.ok && decoded.value.payload.length).toBe(0);
  });

  it('uses big-endian multi-byte fields', () => {
    const encoded = encodePacket({ cmd1: 0xffff, cmd2: 0x8005 }, 3, 2, new Uint8Array([9]));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    expect(encoded.value[3]).toBe(0xff);
    expect(encoded.value[4]).toBe(0xff);
    expect(encoded.value[9]).toBe(0x80);
    expect(encoded.value[10]).toBe(0x05);
  });

  it('rejects bad headers and truncation', () => {
    const encoded = encodePacket(BATTERY, 1, 1, new Uint8Array([1]));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) {
      return;
    }
    const badHeader = encoded.value.slice();
    badHeader[0] = 0x00;
    expect(decodePacket(badHeader).ok).toBe(false);
    expect(decodePacket(new Uint8Array(4)).ok).toBe(false);
  });

  it('validates chunk coordinates', () => {
    expect(encodePacket(BATTERY, 0, 0, new Uint8Array(0)).ok).toBe(false);
    expect(encodePacket(BATTERY, 2, 3, new Uint8Array(0)).ok).toBe(false);
    expect(encodePacket(BATTERY, 2, 0, new Uint8Array(0)).ok).toBe(false);
  });
});

describe('chunk budgets', () => {
  it('computes plaintext chunk size from MTU', () => {
    expect(plaintextChunkSize(CMF_DEFAULT_MTU)).toBe(CMF_DEFAULT_MTU - 20);
    expect(plaintextChunkSize(247)).toBe(227);
  });

  it('computes encrypted chunk payload size from MTU', () => {
    const size = encryptedChunkPayloadSize(CMF_DEFAULT_MTU);
    expect(size.ok).toBe(true);
    if (size.ok) {
      expect(size.value).toBe(219);
    }
    expect(encryptedChunkPayloadSize(16).ok).toBe(false);
  });
});

describe('PacketReassembler', () => {
  it('reassembles out-of-order multi-chunk commands', () => {
    const assembler = new PacketReassembler();
    const first = encodePacket(BATTERY, 2, 1, new Uint8Array([1, 2]));
    const second = encodePacket(BATTERY, 2, 2, new Uint8Array([3, 4]));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(assembler.feed(second.value).ok).toBe(true);
    const done = assembler.feed(first.value);
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(done.value).toEqual(new Uint8Array([1, 2, 3, 4]));
    }
  });

  it('rejects corrupt packets without losing state', () => {
    const assembler = new PacketReassembler();
    const good = encodePacket(BATTERY, 1, 1, new Uint8Array([7]));
    expect(good.ok).toBe(true);
    if (!good.ok) {
      return;
    }
    const corrupted = good.value.slice();
    corrupted[0] = 0x00;
    expect(assembler.feed(corrupted).ok).toBe(false);
    const retry = assembler.feed(good.value);
    expect(retry.ok && retry.value).toEqual(new Uint8Array([7]));
  });

  it('resets buffered partials', () => {
    const assembler = new PacketReassembler();
    const first = encodePacket(BATTERY, 2, 1, new Uint8Array([1]));
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const partial = assembler.feed(first.value);
    expect(partial.ok && partial.value).toBeUndefined();
    assembler.reset();
    const single = encodePacket(BATTERY, 1, 1, new Uint8Array([9]));
    expect(single.ok).toBe(true);
    if (!single.ok) {
      return;
    }
    const done = assembler.feed(single.value);
    expect(done.ok && done.value).toEqual(new Uint8Array([9]));
  });
});
