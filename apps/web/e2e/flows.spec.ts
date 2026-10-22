import { expect, test } from '@playwright/test';

test('morning journal submission recalculates impact bars', async ({ page }) => {
  await page.goto('/journal');
  await page.getByLabel('alcohol').check();
  await page.getByTestId('journal-submit').click();
  await expect(page.getByTestId('journal-saved')).toContainText('Entry saved.');
  await expect(page.getByTestId('impact-bars')).toBeVisible();
});

test('mock WebBLE sync and push recovery to watch', async ({ page }) => {
  await page.goto('/sync?demo=true');
  await page.getByTestId('demo-sync').click();
  await expect(page.getByTestId('sync-status')).toContainText('Synced', { timeout: 30_000 });
  await page.getByTestId('push-recovery').click();
  await expect(page.getByTestId('sync-status')).toContainText('Recovery pushed to watch.');
});
