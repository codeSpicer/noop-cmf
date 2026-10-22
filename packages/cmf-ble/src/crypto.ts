/**
 * SHA-256 challenge-response derivation and AES-128-CBC session crypto.
 *
 * Uses Web Crypto (`crypto.subtle`), available in browsers, Node 19+, and
 * Deno without extra dependencies. All failures surface as `Result` errors.
 */
import { ok, err, type Result } from '@noop-cmf/types';

/** AES-128 key length in bytes. */
export const AES_128_KEY_BYTES = 16;

/** AES block / IV length in bytes. */
export const AES_BLOCK_BYTES = 16;

/** SHA-256 digest length in bytes. */
export const SHA256_BYTES = 32;

/** Challenge length expected from the watch in bytes. */
export const CHALLENGE_BYTES = 16;

/** Domain separator mixed into the challenge response derivation. */
export const CHALLENGE_DOMAIN_SEPARATOR = 'noop-cmf-pairing-v1';

/** Error codes for the crypto layer. */
export type CryptoErrorCode = 'BAD_INPUT' | 'WEBCRYPTO_UNAVAILABLE' | 'OPERATION_FAILED';

/** Structured crypto failure. */
export interface CryptoError {
  readonly code: CryptoErrorCode;
  readonly message: string;
}

function subtle(): Result<SubtleCrypto, CryptoError> {
  const cryptoObject = (globalThis as unknown as { crypto?: { subtle?: SubtleCrypto } }).crypto;
  if (!cryptoObject || !cryptoObject.subtle) {
    return err({ code: 'WEBCRYPTO_UNAVAILABLE', message: 'Web Crypto subtle is unavailable' });
  }
  return ok(cryptoObject.subtle);
}

function toBytes(input: Uint8Array | string): Uint8Array {
  if (typeof input === 'string') {
    return new TextEncoder().encode(input);
  }
  return input;
}

/**
 * Derive the 16-byte pairing response from `secret || separator || challenge`.
 *
 * The first 16 bytes of SHA-256(secret || separator || challenge) form the
 * response sent back to the watch.
 */
export async function deriveChallengeResponse(
  secret: Uint8Array | string,
  challenge: Uint8Array,
): Promise<Result<Uint8Array, CryptoError>> {
  if (challenge.length !== CHALLENGE_BYTES) {
    return err({
      code: 'BAD_INPUT',
      message: `Challenge must be ${String(CHALLENGE_BYTES)} bytes`,
    });
  }
  const subtleCrypto = subtle();
  if (!subtleCrypto.ok) {
    return subtleCrypto;
  }
  try {
    const secretBytes = toBytes(secret);
    const separatorBytes = new TextEncoder().encode(CHALLENGE_DOMAIN_SEPARATOR);
    const material = new Uint8Array(secretBytes.length + separatorBytes.length + challenge.length);
    material.set(secretBytes, 0);
    material.set(separatorBytes, secretBytes.length);
    material.set(challenge, secretBytes.length + separatorBytes.length);
    const digest = await subtleCrypto.value.digest('SHA-256', material);
    return ok(new Uint8Array(digest).slice(0, AES_128_KEY_BYTES));
  } catch (error) {
    return err({
      code: 'OPERATION_FAILED',
      message: error instanceof Error ? error.message : 'Digest failed',
    });
  }
}

/**
 * Encrypt `plaintext` with AES-128-CBC under `key` and `iv`.
 */
export async function encryptAes128Cbc(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Promise<Result<Uint8Array, CryptoError>> {
  const keyCheck = checkKeyIv(key, iv);
  if (keyCheck) {
    return keyCheck;
  }
  const subtleCrypto = subtle();
  if (!subtleCrypto.ok) {
    return subtleCrypto;
  }
  try {
    const cryptoKey = await subtleCrypto.value.importKey(
      'raw',
      key as unknown as BufferSource,
      'AES-CBC',
      false,
      ['encrypt'],
    );
    const ciphertext = await subtleCrypto.value.encrypt(
      { name: 'AES-CBC', iv: iv as unknown as BufferSource },
      cryptoKey,
      plaintext as unknown as BufferSource,
    );
    return ok(new Uint8Array(ciphertext));
  } catch (error) {
    return err({
      code: 'OPERATION_FAILED',
      message: error instanceof Error ? error.message : 'Encrypt failed',
    });
  }
}

/**
 * Decrypt `ciphertext` with AES-128-CBC under `key` and `iv`.
 */
export async function decryptAes128Cbc(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Result<Uint8Array, CryptoError>> {
  const keyCheck = checkKeyIv(key, iv);
  if (keyCheck) {
    return keyCheck;
  }
  const subtleCrypto = subtle();
  if (!subtleCrypto.ok) {
    return subtleCrypto;
  }
  try {
    const cryptoKey = await subtleCrypto.value.importKey(
      'raw',
      key as unknown as BufferSource,
      'AES-CBC',
      false,
      ['decrypt'],
    );
    const plaintext = await subtleCrypto.value.decrypt(
      { name: 'AES-CBC', iv: iv as unknown as BufferSource },
      cryptoKey,
      ciphertext as unknown as BufferSource,
    );
    return ok(new Uint8Array(plaintext));
  } catch (error) {
    return err({
      code: 'OPERATION_FAILED',
      message: error instanceof Error ? error.message : 'Decrypt failed',
    });
  }
}

function checkKeyIv(key: Uint8Array, iv: Uint8Array): Result<never, CryptoError> | undefined {
  if (key.length !== AES_128_KEY_BYTES) {
    return err({
      code: 'BAD_INPUT',
      message: `Key must be ${String(AES_128_KEY_BYTES)} bytes`,
    });
  }
  if (iv.length !== AES_BLOCK_BYTES) {
    return err({
      code: 'BAD_INPUT',
      message: `IV must be ${String(AES_BLOCK_BYTES)} bytes`,
    });
  }
  return undefined;
}
