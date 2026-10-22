/**
 * CMF packet framing: build and parse the 11-byte-header wire format.
 *
 * Derived from Gadgetbridge's `CmfCharacteristic` (GPL-3.0, José Rebelo):
 * every packet is BIG-ENDIAN
 *   `0xF5 | u16 payloadLength | u16 cmd1 | u16 chunkCount | u16 chunkIndex | u16 cmd2 | payload...`
 * Plaintext chunks append CRC32 to the payload; encrypted chunks are
 * AES-128-CBC/PKCS7 over `payload || CRC32` with the fixed IV below.
 */
import { ok, err, type Result } from '@noop-cmf/types';

/** First byte of every CMF packet. */
export const PACKET_HEADER = 0xf5;

/** Fixed packet header length in bytes. */
export const PACKET_HEADER_BYTES = 11;

/** Fixed AES-128-CBC IV used for all encrypted chunks. */
export const CMF_AES_IV = new Uint8Array([
  0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x5a,
]);

/** Negotiated ATT MTU observed on the live watch. */
export const CMF_DEFAULT_MTU = 247;

/** Plaintext chunk budget: MTU minus 20 bytes of ATT/GATT overhead. */
export const PLAINTEXT_OVERHEAD_BYTES = 20;

/** Encrypted chunk header overhead on the wire. */
export const ENCRYPTED_HEADER_BYTES = 11;

/** AES block size; encrypted chunks are block-aligned. */
export const CMF_AES_BLOCK_BYTES = 16;

/** CRC32 appended to each chunk payload. */
export const CHUNK_CRC_BYTES = 4;

/** Decoded packet header with reassembly coordinates. */
export interface PacketHeader {
  readonly payloadLength: number;
  readonly cmd1: number;
  readonly cmd2: number;
  readonly chunkCount: number;
  readonly chunkIndex: number;
}

/** Named command pair identifying a CMF operation. */
export interface CmfCommandRef {
  readonly cmd1: number;
  readonly cmd2: number;
}

/**
 * Encode one packet: header plus raw (already chunked/encrypted) payload.
 */
export function encodePacket(
  command: CmfCommandRef,
  chunkCount: number,
  chunkIndex: number,
  payload: Uint8Array,
): Result<Uint8Array, string> {
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 0xffff) {
    return err('chunkCount must be a uint16 >= 1');
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 1 || chunkIndex > chunkCount) {
    return err('chunkIndex must satisfy 1 <= chunkIndex <= chunkCount');
  }
  const out = new Uint8Array(PACKET_HEADER_BYTES + payload.length);
  const view = new DataView(out.buffer);
  view.setUint8(0, PACKET_HEADER);
  view.setUint16(1, payload.length, false);
  view.setUint16(3, command.cmd1, false);
  view.setUint16(5, chunkCount, false);
  view.setUint16(7, chunkIndex, false);
  view.setUint16(9, command.cmd2, false);
  out.set(payload, PACKET_HEADER_BYTES);
  return ok(out);
}

/**
 * Decode one packet header and slice the payload bytes.
 */
export function decodePacket(
  packet: Uint8Array,
): Result<{ header: PacketHeader; payload: Uint8Array }, string> {
  if (packet.length < PACKET_HEADER_BYTES) {
    return err(`Packet too short: ${String(packet.length)} bytes`);
  }
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  if (view.getUint8(0) !== PACKET_HEADER) {
    return err('Bad packet header byte');
  }
  const header: PacketHeader = {
    payloadLength: view.getUint16(1, false),
    cmd1: view.getUint16(3, false),
    chunkCount: view.getUint16(5, false),
    chunkIndex: view.getUint16(7, false),
    cmd2: view.getUint16(9, false),
  };
  const payload = packet.slice(PACKET_HEADER_BYTES);
  return ok({ header, payload });
}

/**
 * Maximum plaintext bytes per chunk for a given MTU.
 */
export function plaintextChunkSize(mtu: number = CMF_DEFAULT_MTU): number {
  return mtu - PLAINTEXT_OVERHEAD_BYTES;
}

/**
 * Maximum raw payload bytes per encrypted chunk for a given MTU.
 */
export function encryptedChunkPayloadSize(mtu: number = CMF_DEFAULT_MTU): Result<number, string> {
  const maxEncrypted =
    Math.floor((mtu - ENCRYPTED_HEADER_BYTES) / CMF_AES_BLOCK_BYTES) * CMF_AES_BLOCK_BYTES;
  const maxPayload = maxEncrypted - CHUNK_CRC_BYTES - 1;
  if (maxPayload < 1) {
    return err(`MTU ${String(mtu)} leaves no room for encrypted payload`);
  }
  return ok(maxPayload);
}

/** Incremental multi-chunk command reassembler. */
export class PacketReassembler {
  private readonly buffers = new Map<string, Map<number, Uint8Array>>();

  private static key(cmd1: number, cmd2: number): string {
    return `${cmd1.toString(16)}:${cmd2.toString(16)}`;
  }

  /**
   * Feed one raw packet; returns the concatenated chunk payloads once every
   * chunk of the command has arrived, `undefined` while still incomplete.
   */
  feed(packet: Uint8Array): Result<Uint8Array | undefined, string> {
    const decoded = decodePacket(packet);
    if (!decoded.ok) {
      return decoded;
    }
    const { header, payload } = decoded.value;
    const key = PacketReassembler.key(header.cmd1, header.cmd2);
    let slots = this.buffers.get(key);
    if (!slots) {
      slots = new Map();
      this.buffers.set(key, slots);
    }
    slots.set(header.chunkIndex, payload);
    if (slots.size !== header.chunkCount) {
      return ok(undefined);
    }
    const ordered: Uint8Array[] = [];
    for (let i = 1; i <= header.chunkCount; i += 1) {
      const part = slots.get(i);
      if (!part) {
        return ok(undefined);
      }
      ordered.push(part);
    }
    this.buffers.delete(key);
    const length = ordered.reduce((sum, part) => sum + part.length, 0);
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const part of ordered) {
      joined.set(part, offset);
      offset += part.length;
    }
    return ok(joined);
  }

  /** Drop all buffered partial commands. */
  reset(): void {
    this.buffers.clear();
  }
}
