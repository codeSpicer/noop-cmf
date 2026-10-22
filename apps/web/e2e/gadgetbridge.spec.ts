import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(
  here,
  '..',
  '..',
  '..',
  'packages',
  'cmf-ble',
  'fixtures',
  'real-gadgetbridge-cmf-pro2.db',
);

test('Gadgetbridge upload persists across reload', async ({ page }) => {
  test.skip(!dbExists(), 'real fixture DB is required');
  await page.goto('/sync');
  await page.getByLabel('Upload Gadgetbridge database').setInputFiles(DB_PATH);
  await expect(page.getByTestId('sync-status')).toContainText(/Imported \d+ HR samples/, {
    timeout: 30_000,
  });
  await page.reload();
  await expect(page.getByTestId('sync-status')).toContainText(/HR samples/, {
    timeout: 30_000,
  });

  function dbExists(): boolean {
    try {
      return readFileSync(DB_PATH).length > 0;
    } catch {
      return false;
    }
  }
});
