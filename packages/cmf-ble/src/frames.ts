/**
 * Binary frame codec: sequence numbers, MTU chunking, CRC32 integrity.
 *
 * Wire format (little-endian, all multi-byte fields):
 *   magic u16 | version u8 | seq u16 | total u16 | index u16 | payload bytes | crc32 u32
 * CRC32 covers every byte before the trailing checksum (IEEE polynomial).
 */
import { ok, err, type Result } from '@noop-cmf/types';

/** Frame magic identifying noop-cmf bulk frames. */
export const FRAME_MAGIC = 0x4e43;

/** Current frame format version. */
export const FRAME_VERSION = 1;

/** Fixed header length in bytes. */
export const FRAME_HEADER_BYTES = 9;

/** Trailing CRC32 length in bytes. */
export const FRAME_CRC_BYTES = 4;

/** Minimum valid frame length (header + CRC, empty payload). */
export const FRAME_MIN_BYTES = FRAME_HEADER_BYTES + FRAME_CRC_BYTES;

/** Default ATT MTU used for chunking when the negotiated MTU is unknown. */
export const DEFAULT_MTU_BYTES = 23;

/** ATT-layer overhead subtracted to obtain the payload chunk size. */
export const ATT_OVERHEAD_BYTES = 3;

/** Decoded frame payload with reassembly coordinates. */
export interface DecodedFrame {
  readonly seq: number;
  readonly total: number;
  readonly index: number;
  readonly payload: Uint8Array;
}

/** CRC32 table for the IEEE polynomial. */
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

/**
 * Compute IEEE CRC32 over `data`.
 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Encode one frame chunk.
 */
export function encodeFrame(
  seq: number,
  total: number,
  index: number,
  payload: Uint8Array,
): Result<Uint8Array, string> {
  if (!Number.isInteger(seq) || seq < 0 || seq > 0xffff) {
    return err('seq must be a uint16');
  }
  if (!Number.isInteger(total) || total < 1 || total > 0xffff) {
    return err('total must be a uint16 >= 1');
  }
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    return err('index must satisfy 0 <= index < total');
  }
  const frame = new Uint8Array(FRAME_HEADER_BYTES + payload.length + FRAME_CRC_BYTES);
  const view = new DataView(frame.buffer);
  view.setUint16(0, FRAME_MAGIC, true);
  view.setUint8(2, FRAME_VERSION);
  view.setUint16(3, seq, true);
  view.setUint16(5, total, true);
  view.setUint16(7, index, true);
  frame.set(payload, FRAME_HEADER_BYTES);
  view.setUint32(
    FRAME_HEADER_BYTES + payload.length,
    crc32(frame.slice(0, FRAME_HEADER_BYTES + payload.length)),
    true,
  );
  return ok(frame);
}

/**
 * Decode and integrity-check one frame chunk.
 */
export function decodeFrame(frame: Uint8Array): Result<DecodedFrame, string> {
  if (frame.length < FRAME_MIN_BYTES) {
    return err(`Frame too short: ${String(frame.length)} bytes`);
  }
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  if (view.getUint16(0, true) !== FRAME_MAGIC) {
    return err('Bad frame magic');
  }
  if (view.getUint8(2) !== FRAME_VERSION) {
    return err(`Unsupported frame version ${String(view.getUint8(2))}`);
  }
  const seq = view.getUint16(3, true);
  const total = view.getUint16(5, true);
  const index = view.getUint16(7, true);
  const payload = frame.slice(FRAME_HEADER_BYTES, frame.length - FRAME_CRC_BYTES);
  const expected = view.getUint32(frame.length - FRAME_CRC_BYTES, true);
  const actual = crc32(frame.slice(0, frame.length - FRAME_CRC_BYTES));
  if (expected !== actual) {
    return err('CRC32 mismatch');
  }
  return ok({ seq, total, index, payload });
}

/**
 * Split `data` into MTU-sized frame chunks.
 *
 * Each wire frame carries {@link FRAME_HEADER_BYTES} of header plus
 * {@link FRAME_CRC_BYTES} of checksum on top of the ATT overhead, so the
 * per-chunk payload is `mtu - ATT_OVERHEAD_BYTES - FRAME_HEADER_BYTES -
 * FRAME_CRC_BYTES`.
 */
export function chunkForMtu(
  seq: number,
  data: Uint8Array,
  mtu: number = DEFAULT_MTU_BYTES,
): Result<Uint8Array[], string> {
  const payloadSize = mtu - ATT_OVERHEAD_BYTES - FRAME_HEADER_BYTES - FRAME_CRC_BYTES;
  if (!Number.isInteger(mtu) || payloadSize < 1) {
    return err(`MTU ${String(mtu)} leaves no room for payload`);
  }
  if (data.length === 0) {
    const single = encodeFrame(seq, 1, 0, data);
    return single.ok ? ok([single.value]) : single;
  }
  const total = Math.ceil(data.length / payloadSize);
  const chunks: Uint8Array[] = [];
  for (let index = 0; index < total; index += 1) {
    const slice = data.slice(index * payloadSize, (index + 1) * payloadSize);
    const encoded = encodeFrame(seq, total, index, slice);
    if (!encoded.ok) {
      return encoded;
    }
    chunks.push(encoded.value);
  }
  return ok(chunks);
}

/** Incremental frame reassembler keyed by sequence number. */
export class FrameReassembler {
  private readonly pending = new Map<number, Map<number, Uint8Array>>();

  /**
   * Feed one raw chunk; returns the joined payload once every chunk of the
   * sequence has arrived, `undefined` while still incomplete.
   */
  feed(raw: Uint8Array): Result<Uint8Array | undefined, string> {
    const decoded = decodeFrame(raw);
    if (!decoded.ok) {
      return decoded;
    }
    const { seq, total, index, payload } = decoded.value;
    let slots = this.pending.get(seq);
    if (!slots) {
      slots = new Map();
      this.pending.set(seq, slots);
    }
    slots.set(index, payload);
    if (slots.size !== total) {
      return ok(undefined);
    }
    const ordered = new Array<Uint8Array>(total);
    for (let i = 0; i < total; i += 1) {
      const part = slots.get(i);
      if (!part) {
        return ok(undefined);
      }
      ordered[i] = part;
    }
    this.pending.delete(seq);
    const length = ordered.reduce((sum, part) => sum + part.length, 0);
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const part of ordered) {
      joined.set(part, offset);
      offset += part.length;
    }
    return ok(joined);
  }

  /** Drop all buffered partial sequences. */
  reset(): void {
    this.pending.clear();
  }
}
