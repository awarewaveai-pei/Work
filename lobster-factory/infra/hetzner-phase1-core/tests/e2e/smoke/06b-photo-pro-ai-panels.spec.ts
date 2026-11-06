/**
 * Smoke 06b — 畫布（專業版）三個 AI／影像面板在真的 PhotoCraft 上 (R0-PLAN 2026-11-05-photocraft-pro §6 C4.3, W3)
 *
 * 06-photo-pro.spec.ts presses each panel's main button once. This one checks that what lands is RIGHT, on the real build:
 *   ai-fill  — the mask sent to /inpaint and /genfill marks exactly the area the user selected (選取工具 and Q quick mask),
 *              same pixel frame as the image; the result replaces the layer and the change sits where the selection was.
 *   genfx    — 擴圖 in four directions: the request carries the direction, the (larger) result comes in as a new layer;
 *              色調分離 2 and 8 levels leave at most 2³ / 8³ colours.
 *   edge-mask — three brushes, strength re-applies, and switching brushes does not stack masks.
 * Paid AI routes are answered by page.route with a result built from the request (masked pixels painted green; outpaint
 * padded on the asked side), so nothing is billed and the geometry is checkable. Real-model quality is not tested here.
 * Run (dev server without auth; PHOTO_PRO_DEV_ORIGIN → a static server whose root holds current/ = a PhotoCraft build):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3913 PHOTO_PRO_NO_AUTH=1 npx playwright test e2e/smoke/06b-photo-pro-ai-panels.spec.ts --project=smoke
 * Screenshots: W3_SHOT_DIR (default: test-results screenshots dir) / smoke-w3-*.png.
 */
import { test, expect, type Page, type Frame } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { SCREENSHOTS_DIR, opsBasicHttpCredentials } from '../helpers/env';

const EMAIL = process.env.OPS_TEST_EMAIL || '';
const PASSWORD = process.env.OPS_TEST_PASSWORD || '';
const NO_AUTH = process.env.PHOTO_PRO_NO_AUTH === '1';
const SHOTS = process.env.W3_SHOT_DIR || SCREENSHOTS_DIR;

test.use({
  httpCredentials: opsBasicHttpCredentials(),
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  viewport: { width: 1400, height: 860 },
});

type PcWindow = { photocraft: { request: (m: string, p?: unknown) => Promise<any>; execute: (c: string, p?: unknown) => Promise<any> } };
type Layer = { id: number; name: string; kind: string; bounds: [number, number, number, number] | null; active: boolean; visible?: boolean };
type Box = [number, number, number, number];
type Seen = { route: string; iw: number; ih: number; mw?: number; mh?: number; box?: Box | null; white?: number; outpaint?: string; prompt?: string; out: [number, number] };

// 200×120 gradient (R = x, G = y, B = 128): posterize and the green paint-over are both obvious on it.
const IMG_W = 200, IMG_H = 120;
const PNG = (() => {
  const w = IMG_W, h = IMG_H, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = Math.round((x * 255) / (w - 1)); raw[o + 1] = Math.round((y * 255) / (h - 1)); raw[o + 2] = 128; }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();

/** In the host page: decode the request, describe it, and build the mock result (see header). */
async function answer(page: Page, route: string, body: { image: string; mask?: string; prompt?: string; outpaint?: string }): Promise<{ seen: Seen; image: string }> {
  return page.evaluate(async ([route, b]) => {
    const bmp = async (url: string) => createImageBitmap(await (await fetch(url)).blob());
    const img = await bmp(b.image);
    const pixels = (src: ImageBitmap) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d')!; g.drawImage(src, 0, 0); return { c, g, d: g.getImageData(0, 0, src.width, src.height) }; };
    const seen: any = { route, iw: img.width, ih: img.height, prompt: b.prompt, outpaint: b.outpaint };
    if (b.mask) {
      const m = pixels(await bmp(b.mask)); seen.mw = m.c.width; seen.mh = m.c.height;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, white = 0;
      for (let y = 0; y < m.c.height; y++) for (let x = 0; x < m.c.width; x++) if (m.d.data[(y * m.c.width + x) * 4] > 127) { white++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      seen.white = white; seen.box = white ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null;
      const s = pixels(img);
      for (let i = 0; i < s.d.data.length; i += 4) if (m.d.data[i] > 127) { s.d.data[i] = 0; s.d.data[i + 1] = 200; s.d.data[i + 2] = 0; s.d.data[i + 3] = 255; }
      s.g.putImageData(s.d, 0, 0); seen.out = [s.c.width, s.c.height];
      return { seen, image: s.c.toDataURL('image/png') };
    }
    const k = 1.5, W = img.width, H = img.height;
    const [ow, oh, dx, dy] = b.outpaint === 'Left outpaint' ? [Math.round(W * k), H, Math.round(W * k) - W, 0]
      : b.outpaint === 'Right outpaint' ? [Math.round(W * k), H, 0, 0]
      : b.outpaint === 'Top outpaint' ? [W, Math.round(H * k), 0, Math.round(H * k) - H]
      : b.outpaint === 'Bottom outpaint' ? [W, Math.round(H * k), 0, 0]
      : [Math.round(W * k), Math.round(H * k), Math.round((W * k - W) / 2), Math.round((H * k - H) / 2)];
    const c = document.createElement('canvas'); c.width = ow; c.height = oh; const g = c.getContext('2d')!;
    g.fillStyle = 'rgb(0,0,255)'; g.fillRect(0, 0, ow, oh); g.drawImage(img, dx, dy);
    seen.out = [ow, oh];
    return { seen, image: c.toDataURL('image/png') };
  }, [route, body] as const) as Promise<{ seen: Seen; image: string }>;
}

test.describe('Photo Pro AI panels on real PhotoCraft', () => {
  test('ai-fill / genfx / edge-mask land the right pixels in the right place', async ({ page }) => {
    test.skip(!NO_AUTH && !(EMAIL && PASSWORD), 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD (or PHOTO_PRO_NO_AUTH=1 on a dev server)');
    test.setTimeout(1_500_000);
    fs.mkdirSync(SHOTS, { recursive: true });
    const results: string[] = [];
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));

    const seen: Seen[] = [];
    await page.route((u) => u.pathname.startsWith('/api/tools/studio/'), async (route) => {
      const r = await answer(page, new URL(route.request().url()).pathname, route.request().postDataJSON());
      seen.push(r.seen);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image: r.image }) });
    });

    await page.goto('/tools/photo-pro', { waitUntil: 'domcontentloaded' });
    if (new URL(page.url()).pathname === '/login') {
      await page.locator('input[type="email"]').fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/tools\/photo-pro/, { timeout: 30_000 });
    }
    await page.waitForFunction(() => !!document.querySelector('#photo-pro-dock .vp-icon'), null, { timeout: 60_000 });
    const frame = (await (await page.locator('iframe.vp-frame').elementHandle({ timeout: 60_000 }))!.contentFrame()) as Frame;
    await frame.waitForFunction(() => typeof (window as unknown as PcWindow).photocraft?.request === 'function', null, { timeout: 150_000 });
    const pc = <T = any>(cmd: string, params: Record<string, unknown> = {}): Promise<T> =>
      frame.evaluate(([c, p]) => (window as unknown as PcWindow).photocraft.execute(c, p), [cmd, params] as const) as Promise<T>;
    const session = () => frame.evaluate(() => (window as unknown as PcWindow).photocraft.request('ui.inspect').then((u: any) => u.session));
    const layers = async (): Promise<Layer[]> => (await pc('layer.list', { flat: true, document: 0 })).layers;
    const byName = async (name: string) => (await layers()).find((l) => l.name === name)!;
    const select = async (name: string) => pc('layer.select', { layer: (await byName(name)).id });
    const body = (id: string) => page.locator(`#photo-pro-dock .vp-body[data-panel="${id}"]`);
    const openPanel = async (id: string) => {
      if (!(await body(id).isVisible())) await page.locator(`#photo-pro-dock .vp-icon[data-panel-icon="${id}"]`).click();
      await expect(body(id)).toBeVisible();
    };
    const clickUntil = async (button: ReturnType<Page['locator']>, msg: ReturnType<Page['locator']>, want: RegExp) => {
      await msg.evaluate((e) => { e.textContent = ''; });
      await button.click();
      try { await expect(msg).toHaveText(want, { timeout: 180_000 }); }
      catch { throw new Error(`panel said: ${JSON.stringify(await msg.textContent())}`); }
    };
    /** Pixel facts of the active layer, read through a second ctx (same adapter the dock uses). */
    const probe = (pts: [number, number][] = []) => page.evaluate(async (pts) => {
      const { createPhotocraftCtx } = await import('/editor-shared/ctx-photocraft.js' as string);
      const ctx = createPhotocraftCtx({ frame: () => (globalThis as any).__proEditor.frame });
      const s = await ctx.selectedImage();
      if (!s) return null;
      const b = await createImageBitmap(s.blob);
      const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const g = c.getContext('2d')!; g.drawImage(b, 0, 0);
      const d = g.getImageData(0, 0, b.width, b.height).data;
      const colours = new Set<number>(); let opaque = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) { opaque++; colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); } }
      const at = pts.map(([x, y]) => Array.from(d.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4)));
      return { w: b.width, h: b.height, colours: colours.size, opaque, at };
    }, pts);
    const shot = (name: string) => page.screenshot({ path: path.join(SHOTS, `smoke-w3-${name}.png`) });
    const only_ = process.env.W3_ONLY ? new RegExp(process.env.W3_ONLY) : null; // rerun a subset: W3_ONLY='edge-mask|Q'
    const check = async (name: string, run: () => Promise<string | void>) => {
      if (only_ && !only_.test(name)) { results.push(`SKIP ${name}`); return; }
      try { const note = await run(); results.push(`PASS ${name}${note ? ` — ${note}` : ''}`); }
      catch (err) { const msg = String((err as Error)?.message ?? err).split('\n')[0]; results.push(`FAIL ${name}: ${msg}`); expect.soft(msg, name).toBe('(no error)'); }
    };
    const deselect = async () => { if ((await pc('document.inspect')).hasSelection) await pc('select.deselect'); };
    const near = (a: Box | null | undefined, b: Box, tol = 2) => !!a && a.every((v, i) => Math.abs(v - b[i]) <= tol);
    /** A fresh copy of the test image as layer `name`, centred (bounds [300,190,200,120] on the 800×500 canvas). */
    const addImage = async (name: string) => {
      await page.evaluate((b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
        const f = document.querySelector('iframe.vp-frame') as HTMLIFrameElement;
        f.contentWindow!.postMessage({ type: 'photocraft:open', name: 'w3.png', bytes }, location.origin, [bytes]);
      }, PNG.toString('base64'));
      await expect.poll(async () => (await session()).documents.length, { timeout: 30_000 }).toBe(2);
      await pc('layer.copyToDocument', { document: 0, source: 1, center: true, name });
      await pc('file.close', { document: 1, save: 'discard' });
      await pc('document.activate', { document: 0 });
      await select(name);
    };
    const only = async (keep: string) => { for (const l of await layers()) if (l.kind === 'Pixel' && l.name !== keep && l.name !== 'Background' && l.name !== '背景') await pc('layer.delete', { layer: l.id }); };

    await pc('file.new', { width: 800, height: 500, background: 'white' });
    await addImage('w3');
    const B = (await byName('w3')).bounds!;
    expect(B, 'test layer centred, natural size').toEqual([300, 190, IMG_W, IMG_H]);

    // ---------------- ai-fill ----------------
    await check('ai-fill 去除：選取工具框 (320,200) 60×40 → 遮罩白框＝圖層內 (20,10) 60×40，同尺寸；圖層換新、框內變綠、框外不動', async () => {
      await openPanel('ai-fill');
      await select('w3');
      await pc('select.rect', { x: B[0] + 20, y: B[1] + 10, width: 60, height: 40 });
      await body('ai-fill').locator('#afRemove').click();
      await clickUntil(body('ai-fill').locator('#afApply'), body('ai-fill').locator('#afMsg'), /^✅/);
      const s = seen.at(-1)!;
      expect(s.route).toBe('/api/tools/studio/inpaint');
      expect([s.iw, s.ih, s.mw, s.mh]).toEqual([IMG_W, IMG_H, IMG_W, IMG_H]);
      expect(near(s.box, [20, 10, 60, 40]), `mask box ${JSON.stringify(s.box)}`).toBe(true);
      expect((await byName('w3')).bounds).toEqual(B);
      const p = (await probe([[50, 30], [150, 90]]))!;
      expect(p.at[0].slice(0, 3)).toEqual([0, 200, 0]);
      expect(p.at[1][1], 'outside the box keeps the gradient').not.toBe(200);
      await deselect();
      await shot('ai-fill-remove-rect');
      return `mask box ${JSON.stringify(s.box)}`;
    });

    /** Q quick mask, one closed stroke of `color` over layer-local rect r, Q off (PhotoCraft = Photoshop rules). */
    const quickMaskPaint = async (r: Box, color: string) => {
      await deselect();
      await pc('select.editInQuickMaskMode', { on: true });
      const [x0, y0, x1, y1] = [B[0] + r[0], B[1] + r[1], B[0] + r[0] + r[2], B[1] + r[1] + r[3]];
      await pc('paint.stroke', { points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], fill: true, hardness: 1, color, target: 'quickMask' });
      await pc('select.editInQuickMaskMode', { on: false });
    };
    const startMode = async (m: 'remove' | 'fill') => {
      await openPanel('ai-fill');
      if (await body('ai-fill').locator('#afCancel').isVisible()) await body('ai-fill').locator('#afCancel').click();
      await body('ai-fill').locator(m === 'fill' ? '#afFill' : '#afRemove').click();
    };

    await check('ai-fill 說明寫的快速遮色片路徑：Q 用黑色塗 (120,70) 60×40 → Q → Shift+Ctrl+I 反轉 → 生成填色的遮罩白框＝塗到的地方', async () => {
      const inv = (await frame.evaluate(() => (window as any).photocraft.commands()) as any[]).find((c) => c.id === 'select.inverse');
      expect(String(inv?.shortcut), 'select.inverse shortcut').toMatch(/shift.*(ctrl|cmd).*i|(ctrl|cmd).*shift.*i/i);
      // fresh gradient: the previous check painted (20,10) 60×40 green, which holds the "outside" probe point (50,30)
      await only('w3'); await pc('layer.delete', { layer: (await byName('w3')).id }); await addImage('w3');
      await quickMaskPaint([120, 70, 60, 40], '#000000');
      await pc('select.inverse');
      await startMode('fill');
      await expect(body('ai-fill').locator('#afHint')).toContainText('Shift+Ctrl+I');
      await body('ai-fill').locator('#afPrompt').fill('一片藍天');
      await clickUntil(body('ai-fill').locator('#afApply'), body('ai-fill').locator('#afMsg'), /^✅/);
      const s = seen.at(-1)!;
      expect(s.route).toBe('/api/tools/studio/genfill');
      expect(s.prompt).toBe('一片藍天');
      expect(near(s.box, [120, 70, 60, 40], 3), `mask box ${JSON.stringify(s.box)} white ${s.white}`).toBe(true);
      const p = (await probe([[150, 90], [50, 30]]))!;
      expect(p.at[0].slice(0, 3)).toEqual([0, 200, 0]);
      expect(p.at[1][1], 'outside the strokes keeps the gradient').not.toBe(200);
      await deselect();
      await shot('ai-fill-fill-quickmask');
      return `inverse shortcut ${inv.shortcut}; mask box ${JSON.stringify(s.box)}`;
    });

    await check('ai-fill：Q 用白色塗（沒有先選取）→ PhotoCraft 沒有選取 → 面板擋下、不送請求', async () => {
      await only('w3'); await select('w3');
      await quickMaskPaint([20, 20, 40, 30], '#ffffff');
      expect((await pc('document.inspect')).hasSelection).toBe(false);
      const n = seen.length;
      await startMode('remove');
      await clickUntil(body('ai-fill').locator('#afApply'), body('ai-fill').locator('#afMsg'), /^請先/);
      expect(seen.length).toBe(n);
      await body('ai-fill').locator('#afCancel').click();
    });

    // ---------------- genfx ----------------
    for (const [dir, size] of [['Left outpaint', [300, 120]], ['Right outpaint', [300, 120]], ['Top outpaint', [200, 180]], ['Bottom outpaint', [200, 180]]] as const) {
      await check(`genfx 擴圖 ${dir}：請求帶方向、原圖尺寸；結果 ${size[0]}×${size[1]} 成新圖層、原圖留著`, async () => {
        await only('w3'); await select('w3');
        await openPanel('genfx');
        await body('genfx').locator('#gfPrompt').fill('海邊草地');
        await body('genfx').locator(`#gfDirs button[data-v="${dir}"]`).click();
        const before = (await layers()).length;
        await clickUntil(body('genfx').locator('#gfOutpaint'), body('genfx').locator('#gfMsg'), /擴圖完成/);
        const s = seen.at(-1)!;
        expect([s.route, s.outpaint, s.prompt, s.iw, s.ih]).toEqual(['/api/tools/studio/genfill', dir, '海邊草地', IMG_W, IMG_H]);
        const ls = await layers();
        expect(ls.length).toBe(before + 1);
        const added = ls.find((l) => l.active)!;
        expect(added.bounds!.slice(2)).toEqual(size);
        expect(ls.some((l) => l.name === 'w3')).toBe(true);
        await shot(`genfx-outpaint-${dir.split(' ')[0].toLowerCase()}`);
        return `new layer ${JSON.stringify(added.bounds)}`;
      });
    }

    for (const lv of [2, 8]) {
      await check(`genfx 色調分離 ${lv} 階：顏色數 ≤ ${lv}³、圖層位置不變`, async () => {
        await only('w3'); await select('w3');
        await openPanel('genfx');
        const before = (await probe())!;
        await body('genfx').locator('#gfLevels').evaluate((el, v) => { (el as HTMLInputElement).value = String(v); el.dispatchEvent(new Event('input')); }, lv);
        await clickUntil(body('genfx').locator('#gfPosterize'), body('genfx').locator('#gfMsg'), /色調分離已套用/);
        const after = (await probe())!;
        expect(after.colours).toBeLessThanOrEqual(lv ** 3);
        expect(after.colours).toBeLessThan(before.colours);
        expect((await byName('w3')).bounds).toEqual(B);
        await shot(`genfx-posterize-${lv}`);
        return `colours ${before.colours} → ${after.colours}`;
      });
      // back to the gradient for the next run
      await only('w3'); await pc('layer.delete', { layer: (await byName('w3')).id }); await addImage('w3');
    }

    // ---------------- edge-mask ----------------
    await check('edge-mask：三種筆刷（圖片筆刷 1、乾毛筆、粉筆）各套一次，邊緣變透明、圖層位置不變', async () => {
      const notes: string[] = [];
      for (const id of ['mask-01', 'dry-brush', 'chalk-brush']) {
        await select('w3');
        await openPanel('edge-mask');
        await clickUntil(body('edge-mask').locator(`[data-em-style="${id}"]`), body('edge-mask').locator('#emMsg'), /已套用邊緣/);
        await shot(`edge-mask-${id}`);
        const p = (await probe([[0, 0], [100, 60]]))!;
        notes.push(`${id} ${p.w}×${p.h} opaque ${p.opaque} corner ${JSON.stringify(p.at[0])}`);
        expect(p.opaque, notes.at(-1)).toBeLessThan(IMG_W * IMG_H);
        // the edge is transparent, so PhotoCraft's layer bounds shrink to the opaque part; the whole result (transparent edge
        // included) must sit exactly on the original frame B: bounds = B origin + the opaque box of the same mask (SSOT edge-mask.js)
        const nb = (await byName('w3')).bounds!;
        const ob = await page.evaluate(async ([b64, id]) => {
          const { applyEdgeMask } = await import('/editor-shared/edge-mask.js' as string);
          const res = await applyEdgeMask('data:image/png;base64,' + b64, id, { amount: 55, seed: 7 });
          const bmp = await createImageBitmap(await (await fetch(res.image)).blob());
          const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
          for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
          return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
        }, [PNG.toString('base64'), id] as const);
        const want = [B[0] + ob[0], B[1] + ob[1], ob[2], ob[3]];
        notes.push(`bounds ${JSON.stringify(nb)} expected ${JSON.stringify(want)}`);
        expect(nb, notes.join(' | ')).toEqual(want);
      }
      return notes.join(', ');
    });

    await check('edge-mask：強度 55 → 90 放開即重套，吃進更多', async () => {
      await select('w3');
      const at55 = (await probe())!.opaque, b55 = (await byName('w3')).bounds;
      await body('edge-mask').locator('#emMsg').evaluate((e) => { e.textContent = ''; });
      await body('edge-mask').locator('#emAmount').evaluate((el) => { (el as HTMLInputElement).value = '90'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
      await expect(body('edge-mask').locator('#emMsg')).toHaveText(/已套用邊緣/, { timeout: 180_000 });
      await select('w3');
      const b90 = (await byName('w3')).bounds, at90 = (await probe())!.opaque;
      expect(at90, `opaque ${at55} (bounds ${JSON.stringify(b55)}) → ${at90} (bounds ${JSON.stringify(b90)})`).toBeLessThan(at55);
      await shot('edge-mask-strength-90');
      return `opaque ${at55} → ${(await probe())!.opaque}`;
    });

    await check('edge-mask：換筆刷不疊加（乾毛筆→粉筆 ＝ 原圖直接粉筆）', async () => {
      await body('edge-mask').locator('#emAmount').evaluate((el) => { (el as HTMLInputElement).value = '55'; el.dispatchEvent(new Event('input')); });
      await only('w3'); await pc('layer.delete', { layer: (await byName('w3')).id }); await addImage('w3');
      await clickUntil(body('edge-mask').locator('[data-em-style="dry-brush"]'), body('edge-mask').locator('#emMsg'), /已套用邊緣/);
      await select('w3');
      await clickUntil(body('edge-mask').locator('[data-em-style="chalk-brush"]'), body('edge-mask').locator('#emMsg'), /已套用邊緣/);
      await select('w3');
      const chained = (await probe())!.opaque;
      await addImage('fresh');
      await clickUntil(body('edge-mask').locator('[data-em-style="chalk-brush"]'), body('edge-mask').locator('#emMsg'), /已套用邊緣/);
      await select('fresh');
      const direct = (await probe())!.opaque;
      expect(chained, `dry→chalk ${chained} vs chalk ${direct}`).toBe(direct);
      return `dry→chalk ${chained} = chalk ${direct}`;
    });

    console.log(`\n[W3 photo-pro AI panels]\n${results.join('\n')}\n[requests]\n${seen.map((s) => JSON.stringify(s)).join('\n')}\n[console errors]\n${[...new Set(errors)].join('\n')}\n`);
  });
});
