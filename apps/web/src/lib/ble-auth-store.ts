/**
 * Persist CMF BLE auth keys in IndexedDB so reconnect works across reloads.
 */
import { getDatabase } from '@/db/database';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export async function loadAuthKey(id: string): Promise<Uint8Array | undefined> {
  const db = getDatabase();
  const row = await db.authKeys.get(id);
  if (!row) {
    return undefined;
  }
  try {
    return fromBase64(row.key);
  } catch {
    return undefined;
  }
}

export async function saveAuthKey(id: string, key: Uint8Array): Promise<void> {
  const db = getDatabase();
  await db.authKeys.put({ id, key: toBase64(key) });
}

export async function clearAuthKey(id: string): Promise<void> {
  const db = getDatabase();
  await db.authKeys.delete(id);
}