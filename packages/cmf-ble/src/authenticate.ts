/**
 * CMF reconnect handshake driver.
 *
 * Runs the authenticated-session sequence over a {@link CmfBleSession}:
 *   AUTH_PHONE_NAME -> AUTH_WATCH_MAC
 *   -> AUTH_NONCE_REQUEST -> AUTH_NONCE_REPLY
 *   -> sessionKey = SHA-256(nonce || authKey)[0:16]
 *   -> AUTHENTICATED_CONFIRM_REQUEST -> AUTHENTICATED_CONFIRM_REPLY
 *
 * On success the session's AES key is the derived per-connection session key.
 * First-time pairing (the `AT GETSECRET` shell exchange) is a separate flow.
 */
import { ok, err, type Result } from '@noop-cmf/types';
import { AUTH_MARKER, WATCH_MARKER, deriveSessionKey } from './auth.js';
import {
  AUTHENTICATED_CONFIRM_REPLY,
  AUTHENTICATED_CONFIRM_REQUEST,
  AUTH_NONCE_REPLY,
  AUTH_NONCE_REQUEST,
  AUTH_PHONE_NAME,
  AUTH_WATCH_MAC,
} from './commands.js';
import type { CmfBleSession, SessionError, SessionErrorCode } from './session.js';

/** Machine-readable handshake failure codes. */
export type AuthenticateErrorCode = SessionErrorCode | 'HANDSHAKE';

/** Structured handshake failure. */
export interface AuthenticateError {
  readonly code: AuthenticateErrorCode;
  readonly message: string;
}

/** Options for {@link authenticate}. */
export interface AuthenticateOptions {
  /** Phone model string advertised in `AUTH_PHONE_NAME`. */
  readonly model: string;
  /** Persistent 16-byte auth key from a completed pairing. */
  readonly authKey: Uint8Array;
  /** Per-step timeout in milliseconds. */
  readonly timeoutMs?: number;
}

function fromSession(error: SessionError): Result<never, AuthenticateError> {
  return err({ code: error.code, message: error.message });
}

/**
 * Run the reconnect handshake and install the derived session key.
 */
export async function authenticate(
  session: CmfBleSession,
  options: AuthenticateOptions,
): Promise<Result<void, AuthenticateError>> {
  const timeoutMs = options.timeoutMs ?? 5000;
  session.setKey(options.authKey);

  const modelBytes = new TextEncoder().encode(options.model);
  const phoneName = new Uint8Array(1 + modelBytes.length);
  phoneName[0] = AUTH_MARKER;
  phoneName.set(modelBytes, 1);

  const macReply = await session.request(AUTH_PHONE_NAME, phoneName, AUTH_WATCH_MAC, {
    encrypted: true,
    timeoutMs,
  });
  if (!macReply.ok) {
    return fromSession(macReply.error);
  }

  const marker = new Uint8Array([AUTH_MARKER]);
  const nonceReply = await session.request(AUTH_NONCE_REQUEST, marker, AUTH_NONCE_REPLY, {
    encrypted: true,
    timeoutMs,
  });
  if (!nonceReply.ok) {
    return fromSession(nonceReply.error);
  }

  const sessionKey = await deriveSessionKey(nonceReply.value, options.authKey);
  if (!sessionKey.ok) {
    return err({ code: 'CRYPTO', message: sessionKey.error.message });
  }
  session.setKey(sessionKey.value);

  const confirm = await session.request(AUTHENTICATED_CONFIRM_REQUEST, marker, AUTHENTICATED_CONFIRM_REPLY, {
    encrypted: true,
    timeoutMs,
  });
  if (!confirm.ok) {
    return fromSession(confirm.error);
  }
  if (confirm.value[0] !== WATCH_MARKER) {
    return err({
      code: 'HANDSHAKE',
      message: `Unexpected confirm reply 0x${(confirm.value[0] ?? 0).toString(16)}`,
    });
  }
  return ok(undefined);
}
