/**
 * Client — WordPress site health verification
 *
 * Runs against PLAYWRIGHT_CLIENT_URL (set by playwright-runner.ps1 -ClientSlug).
 * Used after:
 *   • /wp-maintenance safe-update — confirms no visible breakage
 *   • New site delivery — generates screenshot evidence for the client
 *
 * All tests skip when CLIENT_URL is not set so the suite can be included
 * in a full run without breaking if no client target is configured.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs   from 'fs';
import { CLIENT_URL, clientHostname, SCREENSHOTS_DIR } from '../helpers/env';

const HAS_CLIENT = Boolean(CLIENT_URL);

function screenshotPath(name: string): string {
  const dir = path.join(SCREENSHOTS_DIR, 'client', clientHostname());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${name}.png`);
}

test.describe(`WordPress site — ${clientHostname()}`, () => {
  test.skip(!HAS_CLIENT, 'Set PLAYWRIGHT_CLIENT_URL to run client site tests');

  test('homepage returns 200', async ({ page }) => {
    const res = await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);
  });

  test('no PHP fatal errors in page body', async ({ page }) => {
    await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
    const text = await page.textContent('body') ?? '';
    const phpErrors = ['Fatal error', 'Parse error', 'Call to undefined'];
    for (const err of phpErrors) {
      expect(text, `PHP error "${err}" visible on homepage`).not.toContain(err);
    }
  });

  test('page <title> is not empty', async ({ page }) => {
    await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title.trim(), '<title> is empty').toBeTruthy();
  });

  test('no broken JS in console (TypeError / ReferenceError)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => {
      if (m.type() === 'error' && (m.text().includes('TypeError') || m.text().includes('ReferenceError'))) {
        errors.push(m.text());
      }
    });
    await page.goto(CLIENT_URL, { waitUntil: 'networkidle' });
    expect(errors, `JS errors on homepage: ${errors.join('; ')}`).toHaveLength(0);
  });

  test('wp-admin login page accessible', async ({ page }) => {
    const adminUrl = CLIENT_URL.replace(/\/$/, '') + '/wp-login.php';
    const res = await page.goto(adminUrl, { waitUntil: 'domcontentloaded' });
    expect([200, 301, 302, 307]).toContain(res?.status());
    // Confirm it's not a "site not found" page
    const text = await page.textContent('body') ?? '';
    expect(text).not.toContain("This site can't be reached");
  });

  test('screenshot homepage (delivery evidence)', async ({ page }) => {
    await page.goto(CLIENT_URL, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: screenshotPath('homepage-full'),
      fullPage: true,
    });
    // Above-the-fold capture for email attachments
    await page.screenshot({
      path: screenshotPath('homepage-atf'),
      fullPage: false,
    });
  });

  test('screenshot mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
    await page.goto(CLIENT_URL, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: screenshotPath('homepage-mobile'),
      fullPage: true,
    });
  });
});
