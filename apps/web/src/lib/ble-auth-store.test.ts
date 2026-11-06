import { describe, expect, it, beforeEach } from 'vitest';
import { clearDatabase, getDatabase } from '@/db/database';
import { clearAuthKey, loadAuthKey, saveAuthKey } from './ble-auth-store';

describe('ble-auth-store', () => {
  beforeEach(async () => {
    await clearDatabase(getDatabase());
  });

  it('round-trips an auth key', async () => {
    const key = new Uint8Array([1, 2, 3, 4, 5]);
    await saveAuthKey('cmf-ble', key);
    const loaded = await loadAuthKey('cmf-ble');
    expect(loaded).toBeDefined();
    expect(Array.from(loaded as Uint8Array)).toEqual(Array.from(key));
  });

  it('returns undefined when missing', async () => {
    const loaded = await loadAuthKey('nope');
    expect(loaded).toBeUndefined();
  });

  it('clears a stored key', async () => {
    await saveAuthKey('cmf-ble', new Uint8Array([9, 9]));
    await clearAuthKey('cmf-ble');
    const loaded = await loadAuthKey('cmf-ble');
    expect(loaded).toBeUndefined();
  });
});