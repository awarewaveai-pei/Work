/**
 * Smoke 06d — 塔羅「傳回」(R0-PLAN 2026-11-05-photocraft-pro §6 C8.2) on the real tarot page + real PhotoCraft build.
 * Two entries, each: send -> a NEW tab opens PhotoCraft with the image -> dock 「傳回」 -> the tarot slot takes it (ack).
 *   1) preview (「✏️ 在 Canvas 編輯」, slot preview): the preview is replaced (saved as tarot-preview-edit).
 *   2) one deck card (large view 「✏️ 在畫布編輯」, slot deck:<deck>:0): the card is re-framed (new blob, saved as tarot).
 * AI generation is answered by page.route with a fixed picture (no spend); /api/tools/designs is answered too (nothing written).
 * Run (dev server without auth; PHOTO_PRO_DEV_ORIGIN -> a static server whose root holds current/ = a PhotoCraft build):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3916 PHOTO_PRO_NO_AUTH=1 npx playwright test e2e/smoke/06d-tarot-return.spec.ts --project=smoke
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

const shot = (p: Page, name: string) => { fs.mkdirSync(SHOTS, { recursive: true }); return p.screenshot({ path: path.join(SHOTS, `smoke-c8-tarot-${name}.png`) }); };

/** Open the editor tab from `click`, wait for PhotoCraft to open the image, press 傳回, expect the ack. */
async function sendAndReturn(context: BrowserContext, click: () => Promise<void>, label: string, shotName: string) {
  const [editor] = await Promise.all([context.waitForEvent('page'), click()]);
  await editor.waitForURL(/\/tools\/photo-pro\?h=[0-9a-z]+-[0-9a-z]+$/, { timeout: 60_000 });
  const back = editor.locator('#photo-pro-dock .vp-return');
  await expect(back).toBeVisible({ timeout: 240_000 }); // shown only after PhotoCraft opened the handed-off image
  await expect(back).toHaveAttribute('title', `傳回 ${label}`);
  await shot(editor, `${shotName}-opened`);
  await back.click();
  await expect(editor.locator('#photo-pro-dock .vp-status')).toHaveText(`✅ 已傳回 ${label}`, { timeout: 60_000 });
  await shot(editor, `${shotName}-returned`);
  await editor.close();
}

test('塔羅傳回：預覽與整套單張各送進畫布 → 傳回 → 原格換掉', async ({ page, context }) => {
  test.skip(!NO_AUTH, 'dev server only (PHOTO_PRO_NO_AUTH=1)');
  test.setTimeout(600_000);
  const posts: any[] = [];
  let generated = 0;
  await context.route((u) => u.pathname === '/api/tools/designs', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, asset: { id: 'e2e-c8-tarot' } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, assets: [], nextCursor: null }) });
  });
  await context.route((u) => u.pathname === '/api/entitlements/features', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ list: { features: {} } }) }));

  await page.goto('/tools/tarot', { waitUntil: 'domcontentloaded' });
  const img = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 600;
    const g = c.getContext('2d')!; g.fillStyle = '#d03030'; g.fillRect(0, 0, 400, 600); g.fillStyle = '#3050d0'; g.fillRect(100, 150, 200, 300);
    return c.toDataURL('image/png');
  });
  await context.route((u) => u.pathname === '/api/tools/tarot/generate', (route) => {
    generated++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image: img, seed: 4242 }) });
  });

  // step 1: one model + an English subject (no translation call) -> preview
  const modelRow = page.locator('button[title^="~NT$"]').first();
  await expect(async () => { // a click before hydration (dev compile) does nothing: retry until the panel opens
    await page.getByRole('button', { name: /圖片模型/ }).click();
    await expect(modelRow).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 180_000 });
  await modelRow.click();
  await page.getByRole('button', { name: /主角替換/ }).click();
  await page.getByPlaceholder('留空＝標準塔羅人物。例：a fluffy orange cat').fill('a fluffy orange cat');
  await page.getByRole('button', { name: '生成風格預覽' }).click();
  await expect(page.getByText('預覽牌：')).toBeVisible({ timeout: 60_000 });

  // entry 1: preview
  await page.getByRole('button', { name: /快速編輯/ }).click();
  const before = posts.length;
  await sendAndReturn(context, () => page.getByRole('button', { name: '✏️ 在 Canvas 編輯' }).click(), '塔羅預覽', '1-preview');
  await expect.poll(() => posts.slice(before).filter((p) => p.source === 'tarot-preview-edit').length, { timeout: 30_000 }).toBe(1);
  const edit = posts.slice(before).find((p) => p.source === 'tarot-preview-edit');
  expect(edit.image).toMatch(/^data:image\/png;base64,/); // the PNG PhotoCraft returned (neutral grade = as is)
  expect(edit.image).not.toBe(img);
  await expect(page.getByText(/seed 4242/)).toBeVisible(); // seed unchanged
  await shot(page, '1-preview-replaced');

  // entry 2: lock -> generate card 0 -> large view -> canvas -> 傳回 -> re-framed
  await page.getByRole('button', { name: '✓ 鎖定這個風格，進入整套生成' }).click();
  const fool = page.locator('div[title="THE FOOL"]');
  await fool.click(); // blank card = generate that one (route answers)
  const cardImg = page.locator('img[alt="THE FOOL"]').first();
  await expect(cardImg).toHaveAttribute('src', /^blob:/, { timeout: 60_000 });
  const oldSrc = await cardImg.getAttribute('src');
  await fool.click(); // done card = large view
  const genBefore = generated;
  const before2 = posts.length;
  await sendAndReturn(context, () => page.getByRole('button', { name: '✏️ 在畫布編輯' }).click(), '塔羅第 1 張', '2-card');
  await expect.poll(() => posts.slice(before2).filter((p) => p.source === 'tarot' && p.cardName === 'THE FOOL').length, { timeout: 30_000 }).toBe(1);
  await page.getByRole('button', { name: '關閉' }).click();
  await expect(cardImg).not.toHaveAttribute('src', oldSrc!, { timeout: 30_000 });
  expect(generated, 'no new AI call for the returned card').toBe(genBefore);
  await shot(page, '2-card-replaced');
});
