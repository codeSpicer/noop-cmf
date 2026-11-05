/**
 * SHA-256 helpers and AES-128-CBC session crypto.
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

/**
 * SHA-256 over the concatenation of the given byte chunks.
 */
export async function sha256(...parts: Uint8Array[]): Promise<Result<Uint8Array, CryptoError>> {
  const subtleCrypto = subtle();
  if (!subtleCrypto.ok) {
    return subtleCrypto;
  }
  try {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const material = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      material.set(part, offset);
      offset += part.length;
    }
    const digest = await subtleCrypto.value.digest('SHA-256', material);
    return ok(new Uint8Array(digest));
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
