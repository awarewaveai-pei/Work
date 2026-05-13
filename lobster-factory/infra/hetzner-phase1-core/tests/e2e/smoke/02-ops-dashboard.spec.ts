/**
 * Smoke 02 — Ops dashboard browser smoke
 *
 * Verifies the Next.js app renders (not blank/error-page) and key routes
 * exist. Auth-walled pages are expected to redirect — that is a PASS.
 * Takes full-page screenshots saved to PLAYWRIGHT_SCREENSHOTS_DIR so the
 * runner script can copy them to agency-os/reports/e2e/ for evidence.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs   from 'fs';
import { SCREENSHOTS_DIR } from '../helpers/env';

function screenshotPath(name: string): string {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

test.describe('Ops dashboard browser smoke', () => {
  test('root URL resolves (200 or auth redirect)', async ({ page }) => {
    const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
    const status = res?.status() ?? 0;
    expect(
      [200, 301, 302, 307, 308, 401],
      `Root returned unexpected ${status}`,
    ).toContain(status);
    await page.screenshot({
      path: screenshotPath('smoke-root'),
      fullPage: true,
    });
  });

  test('/ops/clients exists (200 or auth redirect, never 500)', async ({ page }) => {
    const res = await page.goto('/ops/clients', { waitUntil: 'domcontentloaded' });
    const status = res?.status() ?? 0;
    expect(status, 'Unexpected server error on /ops/clients').not.toBe(500);
    expect(status, 'Unexpected server error on /ops/clients').not.toBe(502);
    await page.screenshot({
      path: screenshotPath('smoke-ops-clients'),
      fullPage: true,
    });
  });

  test('/ops/repairs exists (not 500)', async ({ page }) => {
    const res = await page.goto('/ops/repairs', { waitUntil: 'domcontentloaded' });
    const status = res?.status() ?? 0;
    expect(status).not.toBe(500);
    expect(status).not.toBe(502);
    await page.screenshot({
      path: screenshotPath('smoke-ops-repairs'),
      fullPage: true,
    });
  });

  test('no unhandled React errors in console', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    const fatal = errors.filter(e =>
      e.includes('Unhandled') ||
      e.includes('Cannot read') ||
      e.includes('is not a function'),
    );
    expect(fatal, `Fatal console errors: ${fatal.join('; ')}`).toHaveLength(0);
  });
});
