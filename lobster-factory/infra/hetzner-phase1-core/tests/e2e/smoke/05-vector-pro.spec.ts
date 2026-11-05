/**
 * Smoke 05 — 向量（專業版） VectorCraft (agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md C6.1)
 *
 * The VectorCraft web build is public static files (nginx /vector-pro/, decision 1); /tools/vector-pro is the login-gated
 * page that frames it. Always: the build boots headless (software WebGL) and answers `vectorcraft.request('ui.inspect')`
 * with JSON. With OPS_TEST_EMAIL + OPS_TEST_PASSWORD: the same through the signed-in page's iframe; without them the page
 * must answer with a login redirect, never a server error.
 */
import { test, expect, type Page, type Frame } from '@playwright/test';
import path from 'path';
import fs   from 'fs';
import { SCREENSHOTS_DIR, opsBasicHttpCredentials } from '../helpers/env';

const BUILD_PATH = '/vector-pro/current/index.html?lang=zh-hant';
const EMAIL    = process.env.OPS_TEST_EMAIL    || '';
const PASSWORD = process.env.OPS_TEST_PASSWORD || '';

// The wasm is ~7 MB gzipped and SwiftShader renders on the CPU: allow it time to boot.
test.setTimeout(180_000);
test.use({
  httpCredentials: opsBasicHttpCredentials(),
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

function screenshotPath(name: string): string {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

/** Wait for window.vectorcraft in `target`, then ask the app to describe its UI. */
async function inspect(target: Page | Frame): Promise<Record<string, unknown>> {
  await target.waitForFunction(() => typeof (window as unknown as { vectorcraft?: { request?: unknown } }).vectorcraft?.request === 'function', null, { timeout: 150_000 });
  const raw = await target.evaluate(async () => {
    const vc = (window as unknown as { vectorcraft: { request: (m: string, p?: unknown) => Promise<unknown> } }).vectorcraft;
    const r = await vc.request('ui.inspect');
    return typeof r === 'string' ? r : JSON.stringify(r);
  });
  const parsed = JSON.parse(raw) as unknown;
  expect(parsed && typeof parsed === 'object' && !Array.isArray(parsed), `ui.inspect is not a JSON object: ${raw.slice(0, 200)}`).toBe(true);
  return parsed as Record<string, unknown>;
}

test.describe('Vector Pro (VectorCraft) smoke', () => {
  test('the public build boots and answers ui.inspect', async ({ page }) => {
    const res = await page.goto(BUILD_PATH, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), `${BUILD_PATH} returned ${res?.status()}`).toBe(200);
    const ui = await inspect(page);
    expect(Object.keys(ui).length).toBeGreaterThan(0);
    await page.screenshot({ path: screenshotPath('smoke-vector-pro-build') });
  });

  test('/tools/vector-pro needs login (redirect, never 5xx)', async ({ page }) => {
    test.skip(Boolean(EMAIL && PASSWORD), 'signed-in variant below covers the page');
    const res = await page.goto('/tools/vector-pro', { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 0).toBeLessThan(500);
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('signed in, /tools/vector-pro frames the build and it answers ui.inspect', async ({ page }) => {
    test.skip(!(EMAIL && PASSWORD), 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD to run the signed-in check');
    await page.goto('/login?next=%2Ftools%2Fvector-pro');
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/tools\/vector-pro/, { timeout: 30_000 });
    await expect(page.locator('#vector-pro-dock')).toBeAttached();
    const frame = page.frames().find((f) => f.url().includes('/vector-pro/'));
    expect(frame, 'no /vector-pro/ iframe on the page').toBeTruthy();
    await inspect(frame!);
    await page.screenshot({ path: screenshotPath('smoke-vector-pro-page') });
  });
});
