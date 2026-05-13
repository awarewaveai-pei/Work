/**
 * Screenshot — On-demand full-page capture
 *
 * Driven entirely by env vars so the runner can target any URL without
 * code changes. Used for:
 *   • Client delivery documentation
 *   • Pre/post-update visual comparison
 *   • Ad-hoc page archival
 *
 * Usage via playwright-runner.ps1:
 *   playwright-runner.ps1 -Mode screenshot -TargetUrl https://example.com
 */
import { test }  from '@playwright/test';
import path      from 'path';
import fs        from 'fs';
import { SCREENSHOTS_DIR } from '../helpers/env';

const TARGET_URL  = process.env.PLAYWRIGHT_TARGET_URL  || process.env.PLAYWRIGHT_CLIENT_URL || process.env.PLAYWRIGHT_BASE_URL || '';
const LABEL       = process.env.PLAYWRIGHT_LABEL       || 'capture';
const VIEWPORTS   = [
  { name: 'desktop',  width: 1440, height: 900  },
  { name: 'tablet',   width: 768,  height: 1024 },
  { name: 'mobile',   width: 390,  height: 844  },
];

function screenshotPath(label: string, vp: string): string {
  const dir = path.join(SCREENSHOTS_DIR, 'capture');
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return path.join(dir, `${label}-${vp}-${ts}.png`);
}

test.describe('On-demand screenshot capture', () => {
  test.skip(!TARGET_URL, 'Set PLAYWRIGHT_TARGET_URL (or CLIENT_URL / BASE_URL) to capture');

  for (const vp of VIEWPORTS) {
    test(`capture ${LABEL} @ ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30_000 });
      // Let lazy-load images settle
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: screenshotPath(LABEL, vp.name),
        fullPage: true,
      });
    });
  }

  test('multi-page scroll capture (above-the-fold only)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.screenshot({
      path: screenshotPath(LABEL, 'atf'),
      fullPage: false,
    });
  });
});
