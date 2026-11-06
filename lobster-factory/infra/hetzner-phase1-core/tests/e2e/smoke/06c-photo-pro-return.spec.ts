/**
 * Smoke 06c — 畫布（專業版）「傳回」(R0-PLAN 2026-11-05-photocraft-pro §6 C8.1) on the real PhotoCraft build.
 *
 * The sender page is the app's own code: components/tools/canvas-handoff.ts openInCanvas + useCanvasReturn.ts, bundled
 * here with esbuild and rendered with React on a same-origin page (no tool page changed for the test). Flow:
 *   send -> a NEW tab opens /tools/photo-pro?h=<id> and PhotoCraft opens the image -> dock's 「傳回 測試格」 -> the
 *   sender's onReturn gets the PNG and acks -> close the sender -> 「傳回」 again -> no ack -> saved to My Designs
 *   (/api/tools/designs answered by page.route: nothing is written).
 * Run (dev server without auth; PHOTO_PRO_DEV_ORIGIN -> a static server whose root holds current/ = a PhotoCraft build):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3915 PHOTO_PRO_NO_AUTH=1 npx playwright test e2e/smoke/06c-photo-pro-return.spec.ts --project=smoke
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { SCREENSHOTS_DIR, opsBasicHttpCredentials } from '../helpers/env';

const NO_AUTH = process.env.PHOTO_PRO_NO_AUTH === '1';
const APP = path.resolve(__dirname, '../../../apps/next-admin');
const SHOTS = process.env.C8_SHOT_DIR || SCREENSHOTS_DIR;

test.use({
  httpCredentials: opsBasicHttpCredentials(),
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force_high_performance_gpu'] }, // this laptop: never the Intel GPU
  viewport: { width: 1400, height: 860 },
});

/** The sender: openInCanvas with a ticket + useCanvasReturn collecting what comes back in window.__got. */
async function senderBundle(): Promise<string> {
  const { build } = createRequire(path.join(APP, 'package.json'))('esbuild');
  const out = await build({
    stdin: {
      resolveDir: APP,
      loader: 'tsx',
      contents: `
        import { createElement } from "react";
        import { createRoot } from "react-dom/client";
        import { openInCanvas } from "./components/tools/canvas-handoff";
        import { useCanvasReturn } from "./components/tools/useCanvasReturn";
        const w = window as any; w.__got = [];
        function Sender() {
          useCanvasReturn("e2e", (slot, image) => { w.__got.push({ slot, image }); return true; });
          return createElement("button", { id: "send", onClick: () => void openInCanvas(w.__img, "e2e-送出", "/tools/photo-pro", undefined, { tool: "e2e", slot: "s1", label: "測試格" }) }, "send");
        }
        const host = document.createElement("div"); document.body.prepend(host);
        createRoot(host).render(createElement(Sender));`,
    },
    bundle: true, format: 'iife', write: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'at-alias', setup(b: any) { b.onResolve({ filter: /^@\// }, (a: any) => b.resolve(`./${a.path.slice(2)}`, { resolveDir: APP, kind: a.kind })); } }],
  });
  return out.outputFiles[0].text;
}

const shot = (p: Page, name: string) => { fs.mkdirSync(SHOTS, { recursive: true }); return p.screenshot({ path: path.join(SHOTS, `smoke-c8-${name}.png`) }); };

test('傳回：送出開新分頁 → 傳回原頁那一格；原頁關掉 → 存進 My Designs', async ({ page, context }) => {
  test.skip(!NO_AUTH, 'dev server only (PHOTO_PRO_NO_AUTH=1)');
  test.setTimeout(420_000);
  const posts: any[] = [];
  await context.route((u) => u.pathname === '/api/tools/designs', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, asset: { id: 'e2e-c8' } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, assets: [], nextCursor: null }) });
  });

  // sender: any same-origin page
  await page.goto('/e2e-c8-sender', { waitUntil: 'domcontentloaded' }); // a same-origin page (Next's 404)
  await page.addScriptTag({ content: await senderBundle() });
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 100;
    const g = c.getContext('2d')!; g.fillStyle = '#d03030'; g.fillRect(0, 0, 160, 100); g.fillStyle = '#3050d0'; g.fillRect(40, 25, 80, 50);
    (window as any).__img = c.toDataURL('image/png');
  });
  const [editor] = await Promise.all([context.waitForEvent('page'), page.click('#send')]);
  await editor.waitForURL(/\/tools\/photo-pro\?h=[0-9a-z]+-[0-9a-z]+$/, { timeout: 60_000 });
  expect(page.url(), 'sender stays where it was').toContain('/e2e-c8-sender');

  // PhotoCraft opened the handed-off image (the 傳回 button appears only after a successful open)
  const back = editor.locator('#photo-pro-dock .vp-return');
  await expect(back).toBeVisible({ timeout: 240_000 });
  await expect(back).toHaveAttribute('title', '傳回 測試格');
  const frame = (await editor.locator('iframe.vp-frame').elementHandle())!.contentFrame();
  const docs = await (await frame)!.evaluate(() => (window as any).photocraft.request('ui.inspect').then((u: any) => u.session.documents.map((d: any) => d.name ?? d.title ?? JSON.stringify(d))));
  expect(JSON.stringify(docs)).toContain('e2e-送出');
  await shot(editor, '1-opened');

  // 1) sender alive: it gets the PNG in its slot and acks
  await back.click();
  const status = editor.locator('#photo-pro-dock .vp-status');
  await expect(status).toHaveText('✅ 已傳回 測試格', { timeout: 60_000 });
  const got = await page.evaluate(() => (window as any).__got.map((g: any) => ({ slot: g.slot, head: g.image.slice(0, 22), len: g.image.length })));
  expect(got).toHaveLength(1);
  expect(got[0]).toMatchObject({ slot: 's1', head: 'data:image/png;base64,' });
  expect(got[0].len).toBeGreaterThan(200);
  expect(posts).toHaveLength(0);
  await shot(editor, '2-returned');

  // 2) sender closed: no ack -> My Designs (preview + editable original)
  await page.close();
  await back.click();
  await expect(status).toHaveText('原分頁已關，已存進我的設計', { timeout: 120_000 });
  expect(posts).toHaveLength(1);
  expect(posts[0].image).toMatch(/^data:image\/(png|webp);base64,/);
  expect(posts[0].sourceFile?.name).toBe('design.psd');
  expect(posts[0].source).toBe('canvas');
  await shot(editor, '3-saved');
});
