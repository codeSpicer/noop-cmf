/**
 * CMF first-time pairing flow.
 *
 * Reconnect auth (`authenticate`) assumes an auth key already exists. A brand
 * new watch has none, so pairing bootstraps it over the 77D4 shell channel:
 *
 *   1. write `AT GETSECRET`  ->  read `GETSECRET:<hex>,OK`  ->  appSecret
 *   2. send AUTH_PAIR_REQUEST(authRandom1 || SHA256(authRandom1 || appSecret))
 *   3. read AUTH_PAIR_REPLY(authRandom2 || SHA256(authRandom2 || appSecret))
 *   4. verify the watch signature, then
 *      authkey = SHA256(authRandom1 || authRandom2 || appSecret)[0:16]
 *   5. run the normal reconnect handshake with the new auth key
 *
 * Ported from Gadgetbridge's `CmfWatchProSupport` (GPL-3.0).
 */
import { ok, err, type Result } from '@noop-cmf/types';
import { authenticate } from './authenticate.js';
import type { AuthenticateErrorCode } from './authenticate.js';
import {
  AUTH_RANDOM_BYTES,
  PAIR_REPLY_RANDOM_BYTES,
  derivePairingAuthKey,
  parseShellSecret,
  signRandom,
  verifyPairSignature,
} from './auth.js';
import { AUTH_PAIR_REPLY, AUTH_PAIR_REQUEST } from './commands.js';
import type { BleTransport } from './mock-transport.js';
import type { CmfBleSession } from './session.js';
import { VENDOR_77D4_NOTIFY_CHAR_UUID, VENDOR_77D4_WRITE_CHAR_UUID } from './uuids.js';

/** Shell command that returns the per-device app secret. */
export const SHELL_GET_SECRET = 'AT GETSECRET';

/** Total length of an `AUTH_PAIR_REPLY` payload: random (16) + signature (32). */
export const PAIR_REPLY_BYTES = PAIR_REPLY_RANDOM_BYTES + 32;

/** Machine-readable pairing failure codes. */
export type PairErrorCode = AuthenticateErrorCode | 'SHELL';

/** Structured pairing failure. */
export interface PairError {
  readonly code: PairErrorCode;
  readonly message: string;
}

/** Options for {@link pairWatch}. */
export interface PairWatchOptions {
  /** Phone model string advertised in `AUTH_PHONE_NAME`. */
  readonly model: string;
  /** Per-step timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Fixed 16-byte `authRandom1` (testing only). */
  readonly authRandom?: Uint8Array;
  /** Attempts for the opening `AUTH_PHONE_NAME` of the follow-on handshake. */
  readonly attempts?: number;
  /** Delay between `AUTH_PHONE_NAME` attempts, in milliseconds. */
  readonly retryDelayMs?: number;
}

function randomAuthBytes(): Uint8Array {
  const out = new Uint8Array(AUTH_RANDOM_BYTES);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Read the app secret by running `AT GETSECRET` over the shell channel. */
async function requestShellSecret(
  transport: BleTransport,
  timeoutMs: number,
): Promise<Result<Uint8Array, PairError>> {
  let settle: (result: Result<Uint8Array, PairError>) => void = () => undefined;
  const received = new Promise<Result<Uint8Array, PairError>>((resolve) => {
    settle = resolve;
  });
  const timer = setTimeout(() => {
    settle(err({ code: 'TIMEOUT', message: 'Timed out waiting for GETSECRET' }));
  }, timeoutMs);

  const started = await transport.startNotifications(VENDOR_77D4_NOTIFY_CHAR_UUID, (value) => {
    clearTimeout(timer);
    const parsed = parseShellSecret(new TextDecoder().decode(value));
    settle(parsed.ok ? ok(parsed.value) : err({ code: 'SHELL', message: 'Malformed GETSECRET reply' }));
  });
  if (!started.ok) {
    clearTimeout(timer);
    return err({ code: 'TRANSPORT', message: started.error.message });
  }

  const written = await transport.writeCharacteristic(
    VENDOR_77D4_WRITE_CHAR_UUID,
    new TextEncoder().encode(SHELL_GET_SECRET),
  );
  if (!written.ok) {
    clearTimeout(timer);
    return err({ code: 'TRANSPORT', message: written.error.message });
  }
  return received;
}

/**
 * Pair with a fresh watch and return the derived 16-byte auth key. The session
 * key is installed on success.
 */
export async function pairWatch(
  session: CmfBleSession,
  transport: BleTransport,
  options: PairWatchOptions,
): Promise<Result<Uint8Array, PairError>> {
  const timeoutMs = options.timeoutMs ?? 5000;

  const secret = await requestShellSecret(transport, timeoutMs);
  if (!secret.ok) {
    return secret;
  }

  const authRandom1 = options.authRandom ?? randomAuthBytes();
  const signedRandom1 = await signRandom(authRandom1, secret.value);
  if (!signedRandom1.ok) {
    return err({ code: 'CRYPTO', message: signedRandom1.error.message });
  }
  const requestPayload = new Uint8Array(authRandom1.length + signedRandom1.value.length);
  requestPayload.set(authRandom1, 0);
  requestPayload.set(signedRandom1.value, authRandom1.length);

  const reply = await session.request(AUTH_PAIR_REQUEST, requestPayload, AUTH_PAIR_REPLY, { timeoutMs });
  if (!reply.ok) {
    return err({ code: reply.error.code, message: reply.error.message });
  }
  if (reply.value.length < PAIR_REPLY_BYTES) {
    return err({ code: 'HANDSHAKE', message: `Short AUTH_PAIR_REPLY (${String(reply.value.length)} bytes)` });
  }

  const authRandom2 = reply.value.slice(0, PAIR_REPLY_RANDOM_BYTES);
  const signedAuthRandom2 = reply.value.slice(PAIR_REPLY_RANDOM_BYTES, PAIR_REPLY_BYTES);
  const verified = await verifyPairSignature(authRandom2, signedAuthRandom2, secret.value);
  if (!verified.ok) {
    return err({ code: 'CRYPTO', message: verified.error.message });
  }
  if (!verified.value) {
    return err({ code: 'HANDSHAKE', message: 'Watch signature over authRandom2 did not verify' });
  }

  const authKey = await derivePairingAuthKey(authRandom1, authRandom2, secret.value);
  if (!authKey.ok) {
    return err({ code: 'CRYPTO', message: authKey.error.message });
  }
  session.setKey(authKey.value);

  const authed = await authenticate(session, {
    model: options.model,
    authKey: authKey.value,
    timeoutMs,
    ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
    ...(options.retryDelayMs === undefined ? {} : { retryDelayMs: options.retryDelayMs }),
  });
  if (!authed.ok) {
    return err({ code: authed.error.code, message: authed.error.message });
  }
  return ok(authKey.value);
}
