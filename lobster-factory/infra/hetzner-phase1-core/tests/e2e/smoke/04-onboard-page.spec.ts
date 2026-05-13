/**
 * Smoke 04 — /onboard page renders the OnboardWizard UI
 *
 * Why this exists:
 *   Smoke 02 only checks that routes return non-5xx. /onboard sits behind
 *   nginx auth_basic, so an unauthenticated 401 looked like "PASS" while
 *   the actual Next.js page could be 404 or stuck on an older bundle.
 *   This spec authenticates with HTTP Basic and asserts the wizard's
 *   stable Chinese text anchors are present — catching "deployed but
 *   page didn't actually load" regressions on every /sg-deploy.
 *
 * Credentials:
 *   OPS_BASIC_USER / OPS_BASIC_PASSWORD env vars (set in mcp/user-env.ps1).
 *   If missing, this spec fails with a clear setup message rather than
 *   silently skipping — silent skips are the failure mode we're avoiding.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import fs   from 'fs';
import { SCREENSHOTS_DIR, opsBasicHttpCredentials } from '../helpers/env';

const creds = opsBasicHttpCredentials();

function screenshotPath(name: string): string {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

// Apply auth to the whole describe — Playwright recreates context per test.
test.use({ httpCredentials: creds });

test.describe('/onboard page smoke (authenticated)', () => {
  test.beforeAll(() => {
    expect(
      creds,
      'OPS_BASIC_USER / OPS_BASIC_PASSWORD not set. Add them to mcp/user-env.ps1 and re-run it so setx persists to User scope, then restart the shell. See agency-os/AGENTS.md or AWARE_WAVE_CREDENTIALS.md §三.',
    ).toBeDefined();
  });

  test('GET /onboard returns 200 (not 401, not 404, not 5xx)', async ({ page }) => {
    const res = await page.goto('/onboard', { waitUntil: 'domcontentloaded' });
    const status = res?.status() ?? 0;
    expect(status, `/onboard returned ${status}; expected 200 after Basic Auth`).toBe(200);
    await page.screenshot({
      path: screenshotPath('smoke-onboard-page'),
      fullPage: true,
    });
  });

  test('OnboardWizard renders core UI anchors', async ({ page }) => {
    await page.goto('/onboard', { waitUntil: 'domcontentloaded' });

    // Section title + page chrome
    await expect(page.getByText('客戶上線精靈', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('New Client Onboarding', { exact: false }).first()).toBeVisible();

    // Step 1 header — always rendered, no interaction needed
    await expect(page.getByText('Step 1', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('客戶基本資訊', { exact: false }).first()).toBeVisible();

    // Progress bar must show all 5 step labels (this is what was missing in the
    // "shipped 4-step but UI loaded old 3-step" failure mode the user wants to catch).
    const stepLabels = ['客戶資訊', '站型選擇', '部門選型', '開通服務', '啟動 Build'];
    for (const label of stepLabels) {
      await expect(
        page.getByText(label, { exact: false }).first(),
        `Expected progress label "${label}" to be visible on /onboard`,
      ).toBeVisible();
    }
  });

  test('no Next.js 404 page leaked into rendered output', async ({ page }) => {
    await page.goto('/onboard', { waitUntil: 'domcontentloaded' });

    // The not-found template ships in the RSC payload, but the rendered DOM
    // should only show the wizard. If the actual title element is "404",
    // routing broke and we shipped the not-found page.
    const docTitle = await page.title();
    expect(docTitle, `Got document.title="${docTitle}" — looks like Next.js 404`).not.toMatch(/404/);

    // Visible H1/H2-level text must not be the not-found message
    const visible404 = page.getByRole('heading', { name: /404/i });
    expect(await visible404.count(), 'Visible heading contains "404"').toBe(0);
  });

  test('no fatal console errors on /onboard', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/onboard', { waitUntil: 'networkidle' });
    const fatal = errors.filter(e =>
      e.includes('Unhandled') ||
      e.includes('Cannot read') ||
      e.includes('is not a function'),
    );
    expect(fatal, `Fatal console errors on /onboard: ${fatal.join('; ')}`).toHaveLength(0);
  });
});
