/**
 * Smoke 06d — 「傳回」from the real PhotoCraft into Studio and Banner (R0-PLAN 2026-11-05-photocraft-pro §6 C8.3).
 *
 * Per entry: send from the tool page -> a NEW tab opens /tools/photo-pro?h=<id> with the image -> dock 「傳回 <label>」
 * -> ✅ ack -> the tool's slot now holds the returned PNG. The returned PNG is caught on the same BroadcastChannel the
 * sender listens to. Studio: 參考圖 (✏️ on the thumbnail) and 結果 (✏️ 快速編輯). Banner: 商品圖 and 背景 -- their slot
 * is checked by sending again: the new handoff record (IndexedDB) carries the returned image.
 * /api/tools/studio/generate is answered by page.route: nothing is billed.
 * Run (dev server without auth, PHOTO_PRO_DEV_ORIGIN -> a static server whose root holds current/ = a PhotoCraft build):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3917 PHOTO_PRO_NO_AUTH=1 npx playwright test e2e/smoke/06d-photo-pro-return-studio-banner.spec.ts --project=smoke
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { SCREENSHOTS_DIR, opsBasicHttpCredentials } from '../helpers/env';

const NO_AUTH = process.env.PHOTO_PRO_NO_AUTH === '1';
const SHOTS = process.env.C8_SHOT_DIR || SCREENSHOTS_DIR;

test.use({
  httpCredentials: opsBasicHttpCredentials(),
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force_high_performance_gpu'] }, // this laptop: never the Intel GPU
  viewport: { width: 1400, height: 900 },
});

const shot = (p: Page, name: string) => { fs.mkdirSync(SHOTS, { recursive: true }); return p.screenshot({ path: path.join(SHOTS, `smoke-c8-3-${name}.png`) }); };

/** A solid two-colour PNG made in the page (data URL). */
const makePng = (page: Page, a: string, b: string) => page.evaluate(([a, b]) => {
  const c = document.createElement('canvas'); c.width = 200; c.height = 140;
  const g = c.getContext('2d')!; g.fillStyle = a; g.fillRect(0, 0, 200, 140); g.fillStyle = b; g.fillRect(50, 35, 100, 70);
  return c.toDataURL('image/png');
}, [a, b]);
const pngFile = (dataUrl: string, name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });

/** Catch every 傳回 PNG on the channel the sender listens to. */
const listenReturns = (page: Page) => page.evaluate(() => {
  const w = window as any; w.__returns = [];
  const ch = new BroadcastChannel('canvas-return');
  ch.onmessage = (e) => { if (e.data?.type === 'return') w.__returns.push(e.data.image); };
});

/** Click `send` on the tool page, wait for PhotoCraft to open the image, press 傳回, expect the ack; returns the PNG sent back. */
async function sendAndReturn(page: Page, context: BrowserContext, send: () => Promise<void>, label: string, name: string): Promise<string> {
  const before = await page.evaluate(() => (window as any).__returns.length as number);
  const [editor] = await Promise.all([context.waitForEvent('page'), send()]);
  await editor.waitForURL(/\/tools\/photo-pro\?h=[0-9a-z]+-[0-9a-z]+$/, { timeout: 60_000, waitUntil: 'commit' });
  const back = editor.locator('#photo-pro-dock .vp-return');
  await expect(back).toBeVisible({ timeout: 240_000 }); // shown only after PhotoCraft opened the handed-off image
  await expect(back).toHaveAttribute('title', `傳回 ${label}`);
  await back.click();
  await expect(editor.locator('#photo-pro-dock .vp-status')).toHaveText(`✅ 已傳回 ${label}`, { timeout: 60_000, waitUntil: 'commit' }); // ack = slot took it
  await shot(editor, `${name}-returned`);
  await editor.close();
  const returns = await page.evaluate(() => (window as any).__returns as string[]);
  expect(returns.length).toBe(before + 1);
  const img = returns[returns.length - 1];
  expect(img.startsWith('data:image/png;base64,')).toBe(true);
  return img;
}

/** The image of the newest handoff record (what the last send carried). */
const lastHandoffImage = (page: Page) => page.evaluate(() => new Promise<string | null>((resolve, reject) => {
  const req = indexedDB.open('canvas-handoff', 1);
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const tx = req.result.transaction('kv', 'readonly'); const store = tx.objectStore('kv');
    const keys = store.getAllKeys(); const vals = store.getAll();
    tx.oncomplete = () => {
      const rows = (keys.result as string[]).map((k, i) => ({ k, v: vals.result[i] as any })).filter((r) => r.k.startsWith('handoff:'));
      rows.sort((x, y) => parseInt(x.k.slice(8).split('-')[0], 36) - parseInt(y.k.slice(8).split('-')[0], 36));
      resolve(rows.length ? rows[rows.length - 1].v.image ?? null : null);
    };
  };
}));

/** Send again (to read what the slot now holds) and close the editor tab without waiting for it. */
async function sendAgainAndRead(page: Page, context: BrowserContext, send: () => Promise<void>): Promise<string | null> {
  const [editor] = await Promise.all([context.waitForEvent('page'), send()]);
  await editor.waitForURL(/\?h=/, { timeout: 60_000, waitUntil: 'commit' });
  await editor.close();
  return lastHandoffImage(page);
}

test.describe('傳回 → Studio／Banner', () => {
  test.skip(!NO_AUTH, 'dev server only (PHOTO_PRO_NO_AUTH=1)');

  test('Studio：參考圖、結果 各送出 → 傳回 → 原格換掉', async ({ page, context }) => {
    test.setTimeout(600_000);
    await page.goto('/tools/studio', { waitUntil: 'domcontentloaded' });
    const mock = await makePng(page, '#20a040', '#f0e020');
    await context.route((u) => u.pathname === '/api/tools/studio/generate', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image: mock, seed: 5 }) }));
    await listenReturns(page);

    // 參考圖: 改圖模式 -> upload -> ✏️ on the thumbnail
    await page.getByRole('button', { name: '🎨 改圖模式' }).click();
    await page.locator('label', { hasText: '上傳要改的圖' }).locator('input[type=file]').setInputFiles(pngFile(await makePng(page, '#d03030', '#3050d0'), 'ref.png'));
    const thumb = page.locator('img[alt="ref-0"]');
    await expect(thumb).toBeVisible();
    const refBefore = await thumb.getAttribute('src');
    await sendAndReturn(page, context, () => page.getByTestId('studio-ref-canvas').first().click(), 'Studio 參考圖', 'studio-ref');
    await expect.poll(() => thumb.getAttribute('src'), { timeout: 20_000 }).not.toBe(refBefore); // replaced (then downscaled)
    await expect(page.locator('img[alt^="ref-"]')).toHaveCount(1); // the same thumbnail, not an extra one

    // 結果: generate (route-answered) -> ✏️ 快速編輯 -> 傳回 -> the result's image is the returned PNG
    await page.getByRole('button', { name: /^生成/ }).click();
    const main = page.locator('img[alt="generated design"]');
    await expect(main).toHaveAttribute('src', mock, { timeout: 60_000, waitUntil: 'commit' });
    const returned = await sendAndReturn(page, context, () => page.getByRole('button', { name: '✏️ 快速編輯' }).first().click(), 'Studio 結果', 'studio-result');
    await expect(main).toHaveAttribute('src', returned);
    await shot(page, 'studio-after');
  });

  test('Banner：商品圖、背景 各送出 → 傳回 → 原格換掉', async ({ page, context }) => {
    test.setTimeout(600_000);
    await page.goto('/tools/banner', { waitUntil: 'domcontentloaded' });
    await listenReturns(page);

    // step cards start folded
    const openStep = async (name: RegExp, inside: string) => {
      if (!(await page.getByRole('button', { name: inside, exact: true }).isVisible())) await page.getByRole('button', { name }).click();
      await expect(page.getByRole('button', { name: inside, exact: true })).toBeVisible();
    };

    // 商品圖
    await openStep(/Step 2 產品圖/, '上傳產品圖');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '上傳產品圖' }).click()]);
    await fc.setFiles(pngFile(await makePng(page, '#ffffff', '#c02060'), 'product.png'));
    const productBtn = page.getByTestId('banner-product-canvas');
    await expect(productBtn).toBeVisible();
    const productBack = await sendAndReturn(page, context, () => productBtn.click(), 'Banner 商品圖', 'banner-product');
    await expect(page.getByRole('button', { name: '一鍵去背' })).toBeVisible(); // productOrig === productImage (both replaced)
    expect(await sendAgainAndRead(page, context, () => productBtn.click())).toBe(productBack);

    // 背景 (上傳圖)
    await openStep(/Step 3 背景/, '上傳圖');
    await page.getByRole('button', { name: '上傳圖', exact: true }).click();
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: '選擇圖片…' }).click()]);
    await fc2.setFiles(pngFile(await makePng(page, '#2040c0', '#40e0e0'), 'bg.png'));
    const bgBtn = page.getByTestId('banner-bg-canvas');
    await expect(bgBtn).toBeVisible();
    const bgBack = await sendAndReturn(page, context, () => bgBtn.click(), 'Banner 背景', 'banner-bg');
    expect(await sendAgainAndRead(page, context, () => bgBtn.click())).toBe(bgBack);
    await shot(page, 'banner-after');
  });
});
