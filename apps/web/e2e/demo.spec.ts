import { expect, test } from '@playwright/test';

test('demo mode boots and renders the overview gauges', async ({ page }) => {
  await page.goto('/?demo=true&persona=endurance-runner');
  await expect(page.getByTestId('strain-ring')).toBeVisible();
  await expect(page.getByTestId('recovery-ring')).toBeVisible();
  await expect(page.getByTestId('sleep-ring')).toBeVisible();
  await expect(page.getByTestId('strain-target')).toContainText('Optimal strain target:');
});

test('switching personas changes the demo dataset', async ({ page }) => {
  await page.goto('/sync?demo=true');
  await page.getByTestId('persona-select').selectOption('peak-recovery');
  await page.getByTestId('demo-sync').click();
  await expect(page.getByTestId('sync-status')).toContainText('Synced', { timeout: 30_000 });
});

test('strain route shows TRIMP and zone bars', async ({ page }) => {
  await page.goto('/strain?demo=true');
  await expect(page.getByTestId('trimp-value')).toContainText('Workout TRIMP:');
  await expect(page.getByTestId('zone-bars')).toBeVisible();
});

test('recovery route shows score, eHRV, and RHR', async ({ page }) => {
  await page.goto('/recovery?demo=true');
  await expect(page.getByTestId('recovery-value')).toContainText('Recovery:');
  await expect(page.getByTestId('ehrv-value')).toContainText('Overnight eHRV:');
  await expect(page.getByTestId('rhr-value')).toContainText('Overnight RHR:');
});

test('sleep route shows the hypnogram and tonight need', async ({ page }) => {
  await page.goto('/sleep?demo=true');
  await expect(page.getByTestId('hypnogram')).toBeVisible();
  await expect(page.getByTestId('sleep-need')).toContainText("Tonight's sleep need:");
});
