import { expect, test } from '@playwright/test';

test('morning journal submission recalculates impact bars', async ({ page }) => {
  await page.goto('/journal');
    await page.getByLabel('Alcohol').check();
  await page.getByTestId('journal-submit').click();
  await expect(page.getByTestId('journal-saved')).toContainText('Entry saved.');
  await expect(page.getByTestId('impact-bars')).toBeVisible();
});

test('push recovery to watch', async ({ page }) => {
  await page.goto('/sync');
  await page.getByTestId('push-recovery').click();
  await expect(page.getByTestId('sync-status')).toContainText('Recovery pushed to watch.', { timeout: 30_000 });
});
