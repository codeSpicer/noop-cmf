/**
 * CMF protocol session: chunking, reassembly, and request/response
 * correlation on top of a {@link BleTransport}.
 *
 * `send(options.encrypted)` selects the chunk envelope: plaintext chunks
 * carry a CRC32 suffix, encrypted chunks are AES-128-CBC over
 * `payload || CRC32` (see `chunks.ts`). Reception decodes whichever
 * envelope the trailing bytes imply (PKCS#7 padding bytes on decryption).
 */
import { ok, err, type Result } from '@noop-cmf/types';
import { decodeEncryptedChunk, decodePlainChunk, encodeEncryptedChunk, encodePlainChunk } from './chunks.js';
import { commandFromCodes, shouldEncrypt } from './commands.js';
import type { BleTransport, TransportError } from './mock-transport.js';
import {
  CHUNK_CRC_BYTES,
  PACKET_HEADER,
  PACKET_HEADER_BYTES,
  decodePacket,
  encodePacket,
  encryptedChunkPayloadSize,
  plaintextChunkSize,
  type CmfCommandRef,
} from './packets.js';
import { VENDOR_FFF1_NOTIFY_CHAR_UUID, VENDOR_FFF2_WRITE_CHAR_UUID } from './uuids.js';

/** Machine-readable session failure codes. */
export type SessionErrorCode = 'TRANSPORT' | 'PROTOCOL' | 'TIMEOUT' | 'CRYPTO';

/** Structured session failure. */
export interface SessionError {
  readonly code: SessionErrorCode;
  readonly message: string;
}

/** Options accepted by {@link CmfBleSession.send}. */
export interface SendOptions {
  /** True to wrap each chunk in the AES-128-CBC encrypted envelope. */
  readonly encrypted?: boolean;
}

interface Waiter {
  readonly resolve: (result: Result<Uint8Array, SessionError>) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Correlates outgoing CMF commands with reassembled notify responses. */
export class CmfBleSession {
  private readonly transport: BleTransport;
  private readonly waiters = new Map<string, Waiter>();
  private readonly chunkBuffers = new Map<string, Map<number, Uint8Array>>();
  private pending = new Uint8Array(0);
  private draining = false;
  private key: Uint8Array | undefined;

  constructor(transport: BleTransport) {
    this.transport = transport;
  }

  /** Install the AES session key (absent while unauthenticated). */
  setKey(key: Uint8Array | undefined): void {
    this.key = key;
  }

  /** Subscribe to the CMF notify characteristic and start reassembling frames. */
  start(): Promise<Result<void, TransportError>> {
    return this.transport.startNotifications(VENDOR_FFF1_NOTIFY_CHAR_UUID, (frame) => {
      this.handleFrame(frame);
    });
  }

  stop(): Promise<Result<void, TransportError>> {
    return this.transport.stopNotifications(VENDOR_FFF1_NOTIFY_CHAR_UUID);
  }

  /** Chunk (if needed), encode, and write one command's payload to the watch. */
  async send(
    command: CmfCommandRef,
    payload: Uint8Array,
    options: SendOptions = {},
  ): Promise<Result<void, SessionError>> {
    const encrypted = options.encrypted === true;
    if (encrypted && !this.key) {
      return err({ code: 'CRYPTO', message: 'No AES session key installed' });
    }
    const size = encrypted ? encryptedChunkPayloadSize() : ok(plaintextChunkSize());
    if (!size.ok) {
      return err({ code: 'PROTOCOL', message: size.error });
    }
    const chunkSize = size.value;
    const chunkCount = Math.max(1, Math.ceil(payload.length / chunkSize));
    for (let index = 0; index < chunkCount; index += 1) {
      const slice = payload.subarray(index * chunkSize, Math.min(payload.length, (index + 1) * chunkSize));
      let wirePayload = encodePlainChunk(slice);
      if (encrypted && this.key) {
        const encodedChunk = await encodeEncryptedChunk(this.key, slice);
        if (!encodedChunk.ok) {
          return err({ code: 'CRYPTO', message: encodedChunk.error });
        }
        wirePayload = encodedChunk.value;
      }
      const encoded = encodePacket(command, chunkCount, index + 1, wirePayload);
      if (!encoded.ok) {
        return err({ code: 'PROTOCOL', message: encoded.error });
      }
      const written = await this.transport.writeCharacteristic(VENDOR_FFF2_WRITE_CHAR_UUID, encoded.value);
      if (!written.ok) {
        return err({ code: 'TRANSPORT', message: written.error.message });
      }
    }
    return ok(undefined);
  }

  /** Send a command and resolve with the reassembled payload of `responseCommand`. */
  request(
    command: CmfCommandRef,
    payload: Uint8Array,
    responseCommand: CmfCommandRef,
    options: SendOptions & { timeoutMs?: number } = {},
  ): Promise<Result<Uint8Array, SessionError>> {
    return new Promise((resolve) => {
      const key = this.keyFor(responseCommand);
      const timer = setTimeout(() => {
        this.waiters.delete(key);
        resolve(err({ code: 'TIMEOUT', message: `Timed out waiting for ${key}` }));
      }, options.timeoutMs ?? 5000);
      this.waiters.set(key, { resolve, timer });
      void this.send(command, payload, options).then((sent) => {
        if (!sent.ok) {
          clearTimeout(timer);
          this.waiters.delete(key);
          resolve(sent);
        }
      });
    });
  }

  /**
   * A single frame is routinely split across several BLE notifications when
   * the MTU is small, so buffer raw bytes and emit only whole frames.
   */
  private handleFrame(frame: Uint8Array): void {
    if (this.draining) {
      this.append(frame);
      return;
    }
    this.append(frame);
    void this.drainFrames();
  }

  private append(frame: Uint8Array): void {
    const merged = new Uint8Array(this.pending.length + frame.length);
    merged.set(this.pending, 0);
    merged.set(frame, this.pending.length);
    this.pending = merged;
  }

  private async drainFrames(): Promise<void> {
    this.draining = true;
    try {
      while (this.pending.length >= PACKET_HEADER_BYTES) {
        if (this.pending[0] !== PACKET_HEADER) {
          const next = this.pending.indexOf(PACKET_HEADER, 1);
          this.pending = next === -1 ? new Uint8Array(0) : this.pending.slice(next);
          continue;
        }
        const view = new DataView(this.pending.buffer, this.pending.byteOffset, this.pending.byteLength);
        const declared = view.getUint16(1, false);
        // The watch omits the trailing CRC32 on plaintext frames but still
        // declares its length, so a plaintext frame is 4 bytes shorter than
        // the header claims (cf. Gadgetbridge CmfCharacteristic).
        const cmd = commandFromCodes(view.getUint16(3, false), view.getUint16(9, false));
        const plaintext = cmd !== undefined && !shouldEncrypt(cmd.name);
        const payloadBytes = plaintext ? Math.max(0, declared - CHUNK_CRC_BYTES) : declared;
        const total = PACKET_HEADER_BYTES + payloadBytes;
        if (this.pending.length < total) {
          return;
        }
        const frame = this.pending.slice(0, total);
        this.pending = this.pending.slice(total);
        await this.processFrame(frame);
      }
    } finally {
      this.draining = false;
    }
  }

  private async processFrame(frame: Uint8Array): Promise<void> {
    const decoded = decodePacket(frame);
    if (!decoded.ok) {
      return;
    }
    const { header, payload } = decoded.value;
    const cmd = commandFromCodes(header.cmd1, header.cmd2);
    // Plaintext frames carry no trailing CRC32, so pass the bytes through.
    const decodedChunk =
      cmd !== undefined && !shouldEncrypt(cmd.name) ? ok(payload) : await this.decodeChunk(payload);
    if (!decodedChunk.ok) {
      return;
    }
    const reassembled = this.reassemble(
      header.cmd1,
      header.cmd2,
      header.chunkCount,
      header.chunkIndex,
      decodedChunk.value,
    );
    if (!reassembled) {
      return;
    }
    const key = this.keyFor({ cmd1: header.cmd1, cmd2: header.cmd2 });
    const waiter = this.waiters.get(key);
    if (!waiter) {
      return;
    }
    clearTimeout(waiter.timer);
    this.waiters.delete(key);
    waiter.resolve(ok(reassembled));
  }

  private async decodeChunk(chunk: Uint8Array): Promise<Result<Uint8Array, string>> {
    if (this.key) {
      const decrypted = await decodeEncryptedChunk(this.key, chunk);
      if (decrypted.ok) {
        return decrypted;
      }
    }
    return decodePlainChunk(chunk);
  }

  private reassemble(
    cmd1: number,
    cmd2: number,
    chunkCount: number,
    chunkIndex: number,
    payload: Uint8Array,
  ): Uint8Array | undefined {
    const key = this.keyFor({ cmd1, cmd2 });
    let buffer = this.chunkBuffers.get(key);
    if (!buffer) {
      buffer = new Map();
      this.chunkBuffers.set(key, buffer);
    }
    buffer.set(chunkIndex, payload);
    if (buffer.size !== chunkCount) {
      return undefined;
    }
    const ordered = [...buffer.entries()].sort((a, b) => a[0] - b[0]).map(([, part]) => part);
    this.chunkBuffers.delete(key);
    const length = ordered.reduce((sum, part) => sum + part.length, 0);
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const part of ordered) {
      joined.set(part, offset);
      offset += part.length;
    }
    return joined;
  }

  private keyFor(command: CmfCommandRef): string {
    return `${command.cmd1.toString(16)}:${command.cmd2.toString(16)}`;
  }
}
