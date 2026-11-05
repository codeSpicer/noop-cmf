/**
 * CMF protocol session: chunking, reassembly, and request/response
 * correlation on top of a {@link BleTransport}.
 *
 * Crypto (CRC32 + AES chunk encryption) is layered on separately once the
 * auth handshake is validated against a live watch; this file owns the
 * framing mechanics only.
 */
import { ok, err, type Result } from '@noop-cmf/types';
import type { BleTransport, TransportError } from './mock-transport.js';
import {
  decodePacket,
  encodePacket,
  PacketReassembler,
  plaintextChunkSize,
  type CmfCommandRef,
} from './packets.js';
import { VENDOR_FFF1_NOTIFY_CHAR_UUID, VENDOR_FFF2_WRITE_CHAR_UUID } from './uuids.js';

/** Machine-readable session failure codes. */
export type SessionErrorCode = 'TRANSPORT' | 'PROTOCOL' | 'TIMEOUT';

/** Structured session failure. */
export interface SessionError {
  readonly code: SessionErrorCode;
  readonly message: string;
}

interface Waiter {
  readonly resolve: (result: Result<Uint8Array, SessionError>) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Correlates outgoing CMF commands with reassembled notify responses. */
export class CmfBleSession {
  private readonly transport: BleTransport;
  private readonly reassembler = new PacketReassembler();
  private readonly waiters = new Map<string, Waiter>();

  constructor(transport: BleTransport) {
    this.transport = transport;
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
  async send(command: CmfCommandRef, payload: Uint8Array): Promise<Result<void, SessionError>> {
    const chunkSize = plaintextChunkSize();
    const chunkCount = Math.max(1, Math.ceil(payload.length / chunkSize));
    for (let index = 0; index < chunkCount; index += 1) {
      const slice = payload.subarray(index * chunkSize, Math.min(payload.length, (index + 1) * chunkSize));
      const encoded = encodePacket(command, chunkCount, index + 1, slice);
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
    timeoutMs = 5000,
  ): Promise<Result<Uint8Array, SessionError>> {
    return new Promise((resolve) => {
      const key = this.key(responseCommand);
      const timer = setTimeout(() => {
        this.waiters.delete(key);
        resolve(err({ code: 'TIMEOUT', message: `Timed out waiting for ${key}` }));
      }, timeoutMs);
      this.waiters.set(key, { resolve, timer });
      void this.send(command, payload).then((sent) => {
        if (!sent.ok) {
          clearTimeout(timer);
          this.waiters.delete(key);
          resolve(sent);
        }
      });
    });
  }

  private handleFrame(frame: Uint8Array): void {
    const decoded = decodePacket(frame);
    if (!decoded.ok) {
      return;
    }
    const reassembled = this.reassembler.feed(frame);
    if (!reassembled.ok || !reassembled.value) {
      return;
    }
    const command: CmfCommandRef = { cmd1: decoded.value.header.cmd1, cmd2: decoded.value.header.cmd2 };
    const key = this.key(command);
    const waiter = this.waiters.get(key);
    if (!waiter) {
      return;
    }
    clearTimeout(waiter.timer);
    this.waiters.delete(key);
    waiter.resolve(ok(reassembled.value));
  }

  private key(command: CmfCommandRef): string {
    return `${command.cmd1.toString(16)}:${command.cmd2.toString(16)}`;
  }
}
