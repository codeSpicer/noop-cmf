import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ROUTES = ['/', '/strain', '/recovery', '/sleep', '/journal', '/sync'] as const;

for (const route of ROUTES) {
  test(`WCAG AA: ${route} has no serious or critical violations`, async ({ page }) => {
    await page.goto(`${route}?demo=true`);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(
      blocking,
      blocking.map((violation) => `${violation.id}: ${violation.description}`).join('\n'),
    ).toEqual([]);
  });
}
