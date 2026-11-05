/**
 * CMF Watch Pro pairing and authentication derivations.
 *
 * Ported from Gadgetbridge's `CmfWatchProSupport` (GPL-3.0). Every step is a
 * SHA-256 over concatenated byte strings; the outputs below are verified
 * against the live HCI capture of 2026-10-23 (see `auth.test.ts`).
 *
 * Reconnect flow (auth key already stored):
 *   AUTH_PHONE_NAME -> AUTH_WATCH_MAC -> AUTH_NONCE_REQUEST (0xA5)
 *   -> AUTH_NONCE_REPLY -> sessionKey = SHA-256(nonce || authKey)[0:16]
 *   -> AUTHENTICATED_CONFIRM_REQUEST (0xA5)
 *
 * First-time pairing flow (no auth key):
 *   shell "AT GETSECRET" -> "GETSECRET:<hex>,OK" -> appSecret
 *   -> AUTH_PAIR_REQUEST(authRandom1 || signedRandom1)
 *   -> AUTH_PAIR_REPLY(authRandom2 || signedAuthRandom2)
 *   -> authKey = SHA-256(authRandom1 || authRandom2 || appSecret)[0:16]
 */
import { ok, err, type Result } from '@noop-cmf/types';
import { AES_128_KEY_BYTES, sha256, type CryptoError } from './crypto.js';

/** Random nonce length exchanged during pairing. */
export const AUTH_RANDOM_BYTES = 16;

/** Marker byte the phone prefixes to auth command payloads. */
export const AUTH_MARKER = 0xa5;

/** Random (16) and signature (32) halves of an `AUTH_PAIR_REPLY` payload. */
export const PAIR_REPLY_RANDOM_BYTES = 16;

/** Random (16) and signature (32) halves of an `AUTH_PAIR_REPLY` payload. */
export const PAIR_REPLY_SIGNATURE_BYTES = 32;

/**
 * Parse a 16-byte auth key from hex. A leading `0x` is tolerated.
 */
export function parseAuthKeyHex(hex: string): Result<Uint8Array, string> {
  const trimmed = hex.trim();
  const body = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed;
  if (body.length !== AES_128_KEY_BYTES * 2 || !/^[0-9a-fA-F]+$/.test(body)) {
    return err(`Auth key must be ${String(AES_128_KEY_BYTES * 2)} hex characters`);
  }
  const out = new Uint8Array(AES_128_KEY_BYTES);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  }
  return ok(out);
}

/**
 * Parse the 16-byte app secret from a `GETSECRET:<hex>,OK` shell reply.
 */
export function parseShellSecret(reply: string): Result<Uint8Array, string> {
  const trimmed = reply.trim();
  const prefix = 'GETSECRET:';
  const suffix = ',OK';
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(suffix)) {
    return err('Malformed GETSECRET reply');
  }
  return parseAuthKeyHex(trimmed.slice(prefix.length, trimmed.length - suffix.length));
}

/**
 * Phone-side signature over a random nonce: `SHA-256(random || appSecret)`.
 */
export function signRandom(
  random: Uint8Array,
  appSecret: Uint8Array,
): Promise<Result<Uint8Array, CryptoError>> {
  return sha256(random, appSecret);
}

/**
 * Verify the watch's signature over `authRandom2`:
 * `SHA-256(random || appSecret)` must equal the 32-byte signature.
 */
export async function verifyPairSignature(
  random: Uint8Array,
  signature: Uint8Array,
  appSecret: Uint8Array,
): Promise<Result<boolean, CryptoError>> {
  const expected = await sha256(random, appSecret);
  if (!expected.ok) {
    return expected;
  }
  if (expected.value.length !== signature.length) {
    return ok(false);
  }
  let diff = 0;
  for (let i = 0; i < expected.value.length; i += 1) {
    diff |= (expected.value[i] ?? 0) ^ (signature[i] ?? 0);
  }
  return ok(diff === 0);
}

/**
 * Derive the persistent auth key from a completed pairing:
 * `SHA-256(authRandom1 || authRandom2 || appSecret)[0:16]`.
 */
export async function derivePairingAuthKey(
  authRandom1: Uint8Array,
  authRandom2: Uint8Array,
  appSecret: Uint8Array,
): Promise<Result<Uint8Array, CryptoError>> {
  const k1 = await sha256(authRandom1, authRandom2, appSecret);
  if (!k1.ok) {
    return k1;
  }
  return ok(k1.value.slice(0, AES_128_KEY_BYTES));
}

/**
 * Derive the per-connection session key from the watch nonce:
 * `SHA-256(nonce || authKey)[0:16]`.
 */
export async function deriveSessionKey(
  nonce: Uint8Array,
  authKey: Uint8Array,
): Promise<Result<Uint8Array, CryptoError>> {
  const digest = await sha256(nonce, authKey);
  if (!digest.ok) {
    return digest;
  }
  return ok(digest.value.slice(0, AES_128_KEY_BYTES));
}
