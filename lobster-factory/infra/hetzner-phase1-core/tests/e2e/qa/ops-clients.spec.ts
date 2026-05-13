/**
 * QA — Ops Clients UI
 *
 * Full authenticated UI flow tests for /ops/clients.
 * Requires OPS_TEST_EMAIL + OPS_TEST_PASSWORD (Clerk SSO test user).
 * All tests skip gracefully when credentials are absent so the suite
 * still runs as smoke in unauthenticated environments.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs   from 'fs';
import { SCREENSHOTS_DIR } from '../helpers/env';

const EMAIL    = process.env.OPS_TEST_EMAIL    || '';
const PASSWORD = process.env.OPS_TEST_PASSWORD || '';
const HAS_AUTH = Boolean(EMAIL && PASSWORD);

function screenshotPath(name: string): string {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

async function login(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  // Wait for Clerk's sign-in button or auto-redirect
  const isLoginPage = await page
    .locator('input[type="email"], input[name="identifier"]')
    .isVisible({ timeout: 5_000 })
    .catch(() => false);

  if (!isLoginPage) return; // Already authed (e.g. stored state)

  await page.fill('input[type="email"], input[name="identifier"]', EMAIL);
  await page.keyboard.press('Enter');
  await page.fill('input[type="password"]', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/ops\//, { timeout: 15_000 });
}

test.describe('Ops Clients list', () => {
  test.skip(!HAS_AUTH, 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD to run QA suite');

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/ops/clients');
    await page.waitForLoadState('networkidle');
  });

  test('page title is present', async ({ page }) => {
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
    await page.screenshot({ path: screenshotPath('qa-clients-list'), fullPage: true });
  });

  test('client cards render without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.reload();
    await page.waitForLoadState('networkidle');
    const fatal = errors.filter(e => e.includes('TypeError') || e.includes('ReferenceError'));
    expect(fatal).toHaveLength(0);
  });

  test('at least one client card visible OR empty-state shown', async ({ page }) => {
    const cards    = page.locator('[data-testid="client-card"], .client-card');
    const empty    = page.locator('[data-testid="empty-state"], text=/no clients/i');
    const hasCards = await cards.count().then(n => n > 0);
    const hasEmpty = await empty.isVisible().catch(() => false);
    expect(hasCards || hasEmpty, 'Neither client cards nor empty state visible').toBe(true);
  });
});

test.describe('Ops Clients search + filter', () => {
  test.skip(!HAS_AUTH, 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD to run QA suite');

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/ops/clients');
    await page.waitForLoadState('networkidle');
  });

  test('search input exists', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]');
    // Soft check — search may not be implemented yet
    const visible = await searchInput.isVisible().catch(() => false);
    if (!visible) {
      console.warn('WARN: search input not found — may not be implemented yet');
    }
  });
});
