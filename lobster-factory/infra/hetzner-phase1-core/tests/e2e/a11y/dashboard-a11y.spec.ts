/**
 * A11y — WCAG 2.1 AA accessibility audit
 *
 * Uses @axe-core/playwright to scan key pages for accessibility violations.
 * Only "critical" and "serious" violations cause test failure — "moderate"
 * and "minor" are logged as warnings so the build doesn't break on cosmetic
 * issues while surfacing actionable problems.
 *
 * Run: /playwright a11y
 */
import { test, expect } from '@playwright/test';
import AxeBuilder       from '@axe-core/playwright';

const PAGES = [
  { name: 'root',        path: '/' },
  { name: 'ops-clients', path: '/ops/clients' },
  { name: 'ops-repairs', path: '/ops/repairs' },
];

const FAIL_IMPACTS = ['critical', 'serious'] as const;

test.describe('WCAG 2.1 AA accessibility', () => {
  for (const pg of PAGES) {
    test(`${pg.name} (${pg.path}) — no critical/serious violations`, async ({ page }) => {
      const res = await page.goto(pg.path, { waitUntil: 'domcontentloaded' });

      // If auth-redirected, skip rather than scan the login page as if it were the target
      const finalUrl = page.url();
      if (!finalUrl.includes(pg.path) && finalUrl.includes('sign-in')) {
        test.skip(true, `${pg.path} redirected to sign-in — set OPS_TEST_EMAIL/PASSWORD`);
      }

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      const failing  = results.violations.filter(v => (FAIL_IMPACTS as readonly string[]).includes(v.impact ?? ''));
      const warnings = results.violations.filter(v => !( FAIL_IMPACTS as readonly string[]).includes(v.impact ?? ''));

      if (warnings.length > 0) {
        console.warn(`A11y warnings on ${pg.path}:`, warnings.map(v =>
          `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length > 1 ? 's' : ''})`,
        ).join('\n'));
      }

      expect(
        failing,
        `Critical/serious violations on ${pg.path}:\n` +
        failing.map(v => `  [${v.impact}] ${v.id}: ${v.help}\n    ${v.helpUrl}`).join('\n'),
      ).toHaveLength(0);
    });
  }
});
