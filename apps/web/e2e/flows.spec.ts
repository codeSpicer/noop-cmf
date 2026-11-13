import { expect, test } from '@playwright/test';

test('morning journal submission recalculates impact bars', async ({ page }) => {
  await page.goto('/journal');
  await page.getByLabel('Alcohol').check();
  await page.getByTestId('journal-submit').click();
  await expect(page.getByTestId('journal-saved')).toContainText('Entry saved.');
  await expect(page.getByTestId('impact-bars')).toBeVisible();
});

test('offline page loads from cache @offline', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveURL(/(localhost|127\.0\.0\.1)/);
  await context.setOffline(false);
});
