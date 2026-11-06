/**
 * Smoke 06b — 畫布（專業版）三個 AI／影像面板在真的 PhotoCraft 上 (R0-PLAN 2026-11-05-photocraft-pro §6 C4.3, W3)
 *
 * 06-photo-pro.spec.ts presses each panel's main button once. This one checks that what lands is RIGHT, on the real build:
 *   ai-fill  — the mask sent to /inpaint and /genfill marks exactly the area the user selected (選取工具 and Q quick mask),
 *              same pixel frame as the image; the result replaces the layer and the change sits where the selection was.
 *   genfx    — 擴圖 in four directions: the request carries the direction, the (larger) result comes in as a new layer;
 *              色調分離 2 and 8 levels leave at most 2³ / 8³ colours.
 *   edge-mask — three brushes, strength re-applies, and switching brushes does not stack masks.
 *   A (2026-11-06 prod findings) — ai-fill / genfill: when the AI answers a whole different-coloured image (other size, holes
 *              filled), only the selected area changes: every pixel outside it, transparent hole included, stays the source;
 *              擴圖: the result is resized back to source scale (flux-fill-pro geometry, resampled) and the source pixels sit
 *              unchanged inside it, the new layer aligned on the source; ai-edit: the Studio /generate request and a new layer.
 * Paid AI routes are answered by page.route with a result built from the request (masked pixels painted green; outpaint
 * padded on the asked side), so nothing is billed and the geometry is checkable. Real-model quality is not tested here.
 * Run (dev server without auth; PHOTO_PRO_DEV_ORIGIN → a static server whose root holds current/ = a PhotoCraft build):
 *   PLAYWRIGHT_BASE_URL=http://localhost:3913 PHOTO_PRO_NO_AUTH=1 npx playwright test e2e/smoke/06b-photo-pro-ai-panels.spec.ts --project=smoke
 * Screenshots: W3_SHOT_DIR (default: test-results screenshots dir) / smoke-w3-*.png; the A checks also A_SHOT_DIR / smoke-a-*.png.
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
const A_SHOTS = process.env.A_SHOT_DIR || SHOTS;

test.use({
  httpCredentials: opsBasicHttpCredentials(),
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force_high_performance_gpu'] }, // this laptop: never the Intel GPU
  viewport: { width: 1400, height: 860 },
});

type PcWindow = { photocraft: { request: (m: string, p?: unknown) => Promise<any>; execute: (c: string, p?: unknown) => Promise<any> } };
type Layer = { id: number; name: string; kind: string; bounds: [number, number, number, number] | null; active: boolean; visible?: boolean };
type Box = [number, number, number, number];
type Seen = { route: string; iw: number; ih: number; mw?: number; mh?: number; box?: Box | null; white?: number; outpaint?: string; prompt?: string; out: [number, number];
  model?: string; aspectRatio?: string; refs?: number; refType?: string };
/** How the mock AI answers a mask request: paint the masked pixels green, or return a whole orange image at twice the size. */
type AiMode = 'green' | 'orange';

// 200×120 gradient (R = x, G = y, B = 128): posterize and the green paint-over are both obvious on it.
const IMG_W = 200, IMG_H = 120;
/** Layer-local transparent hole of HOLE_PNG: inside the layer (bounds stay [0,0,200,120]) and outside the A checks' selection. */
const HOLE: Box = [140, 20, 30, 30];
const grad = (x: number, y: number) => [Math.round((x * 255) / (IMG_W - 1)), Math.round((y * 255) / (IMG_H - 1)), 128];
const inBox = (x: number, y: number, b: Box) => x >= b[0] && x < b[0] + b[2] && y >= b[1] && y < b[1] + b[3];
const makePng = (hole: Box | null) => {
  const w = IMG_W, h = IMG_H, ch = hole ? 4 : 3, raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * ch + 1) + 1 + x * ch, [r, g, b] = grad(x, y);
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
      if (hole) raw[o + 3] = inBox(x, y, hole) ? 0 : 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = hole ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const PNG = makePng(null);
const HOLE_PNG = makePng(HOLE);
/** flux-fill-pro outpaint canvas in source pixels (same table as blocks/genfx.js outpaintFrame, written out independently). */
const FRAME: Record<string, [number, number, number, number]> = { // W, H, x, y for the 200×120 source
  'Left outpaint': [400, 120, 200, 0], 'Right outpaint': [400, 120, 0, 0], 'Top outpaint': [200, 240, 0, 120], 'Bottom outpaint': [200, 240, 0, 0],
};
/** The mock model resamples its canvas (prod: 1816×789 came back 1440×625). */
const MODEL_SCALE = 0.75;

/** In the host page: decode the request, describe it, and build the mock result (see header). */
async function answer(page: Page, route: string, body: { image?: string; mask?: string; prompt?: string; outpaint?: string; model?: string; aspectRatio?: string; referenceImages?: string[] }, mode: AiMode): Promise<{ seen: Seen; image: string }> {
  return page.evaluate(async ([route, b, mode, frames, scale]) => {
    const bmp = async (url: string) => createImageBitmap(await (await fetch(url)).blob());
    if (route.endsWith('/generate')) { // ai-edit: a 1024×640 purple image with a white bar, whatever the model
      const ref = await bmp(b.referenceImages![0]);
      const c = document.createElement('canvas'); c.width = 1024; c.height = 640; const g = c.getContext('2d')!;
      g.fillStyle = 'rgb(120,40,200)'; g.fillRect(0, 0, 1024, 640); g.fillStyle = 'rgb(255,255,255)'; g.fillRect(0, 300, 1024, 40);
      const seen: any = { route, iw: ref.width, ih: ref.height, prompt: b.prompt, model: b.model, aspectRatio: b.aspectRatio, refs: b.referenceImages!.length,
        refType: b.referenceImages![0].slice(5, b.referenceImages![0].indexOf(';')), out: [1024, 640] };
      return { seen, image: c.toDataURL('image/png') };
    }
    const img = await bmp(b.image!);
    const pixels = (src: ImageBitmap) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d')!; g.drawImage(src, 0, 0); return { c, g, d: g.getImageData(0, 0, src.width, src.height) }; };
    const seen: any = { route, iw: img.width, ih: img.height, prompt: b.prompt, outpaint: b.outpaint };
    if (b.mask && mode === 'orange') {
      const m = pixels(await bmp(b.mask)); seen.mw = m.c.width; seen.mh = m.c.height;
      const c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2; const g = c.getContext('2d')!;
      g.fillStyle = 'rgb(255,128,0)'; g.fillRect(0, 0, c.width, c.height); seen.out = [c.width, c.height];
      return { seen, image: c.toDataURL('image/png') };
    }
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
    // a preset without a frame here: the model sends the source back unextended (same aspect as a zoom-out frame)
    if (!frames[b.outpaint!]) { seen.out = [img.width, img.height]; return { seen, image: b.image! }; }
    // outpaint like flux-fill-pro: the source on its extended canvas (frames, source pixels) padded blue, then resampled
    const [fw, fh, dx, dy] = frames[b.outpaint!];
    const f = document.createElement('canvas'); f.width = fw; f.height = fh; const fg = f.getContext('2d')!;
    fg.fillStyle = 'rgb(0,0,255)'; fg.fillRect(0, 0, fw, fh); fg.drawImage(img, dx, dy);
    const c = document.createElement('canvas'); c.width = Math.round(fw * scale); c.height = Math.round(fh * scale);
    c.getContext('2d')!.drawImage(f, 0, 0, c.width, c.height);
    seen.out = [c.width, c.height];
    return { seen, image: c.toDataURL('image/png') };
  }, [route, body, mode, FRAME, MODEL_SCALE] as const) as Promise<{ seen: Seen; image: string }>;
}

test.describe('Photo Pro AI panels on real PhotoCraft', () => {
  test('ai-fill / genfx / edge-mask land the right pixels in the right place', async ({ page }) => {
    test.skip(!NO_AUTH && !(EMAIL && PASSWORD), 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD (or PHOTO_PRO_NO_AUTH=1 on a dev server)');
    test.setTimeout(1_500_000);
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.mkdirSync(A_SHOTS, { recursive: true });
    const results: string[] = [];
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));

    const seen: Seen[] = [];
    let aiMode: AiMode = 'green';
    await page.route((u) => u.pathname.startsWith('/api/tools/studio/'), async (route) => {
      const r = await answer(page, new URL(route.request().url()).pathname, route.request().postDataJSON(), aiMode);
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
    const shotA = (name: string) => page.screenshot({ path: path.join(A_SHOTS, `smoke-a-${name}.png`) });
    /** Every RGBA byte of the active layer's image (ctx.selectedImage blob), base64, + its size. */
    const pixelsOf = () => page.evaluate(async () => {
      const { createPhotocraftCtx } = await import('/editor-shared/ctx-photocraft.js' as string);
      const s = await createPhotocraftCtx({ frame: () => (globalThis as any).__proEditor.frame }).selectedImage();
      const b = await createImageBitmap(s!.blob);
      const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const g = c.getContext('2d')!; g.drawImage(b, 0, 0);
      const d = g.getImageData(0, 0, b.width, b.height).data;
      let bin = ''; for (let i = 0; i < d.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(d.subarray(i, i + 0x8000)));
      return { w: b.width, h: b.height, b64: btoa(bin) };
    }).then((r) => ({ w: r.w, h: r.h, d: Buffer.from(r.b64, 'base64') }));
    const only_ = process.env.W3_ONLY ? new RegExp(process.env.W3_ONLY) : null; // rerun a subset: W3_ONLY='edge-mask|Q'
    const check = async (name: string, run: () => Promise<string | void>) => {
      if (only_ && !only_.test(name)) { results.push(`SKIP ${name}`); return; }
      try { const note = await run(); results.push(`PASS ${name}${note ? ` — ${note}` : ''}`); }
      catch (err) { const msg = String((err as Error)?.message ?? err).split('\n')[0]; results.push(`FAIL ${name}: ${msg}`); expect.soft(msg, name).toBe('(no error)'); }
    };
    const deselect = async () => { if ((await pc('document.inspect')).hasSelection) await pc('select.deselect'); };
    const near = (a: Box | null | undefined, b: Box, tol = 2) => !!a && a.every((v, i) => Math.abs(v - b[i]) <= tol);
    /** A fresh copy of the test image as layer `name`, centred (bounds [300,190,200,120] on the 800×500 canvas). */
    const addImage = async (name: string, png: Buffer = PNG) => {
      await page.evaluate((b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
        const f = document.querySelector('iframe.vp-frame') as HTMLIFrameElement;
        f.contentWindow!.postMessage({ type: 'photocraft:open', name: 'w3.png', bytes }, location.origin, [bytes]);
      }, png.toString('base64'));
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

    // ---------------- A: the AI result only lands inside the selection ----------------
    for (const m of ['remove', 'fill'] as const) {
      await check(`A ai-fill ${m === 'fill' ? '生成填色' : '去除'}：AI 回整張橘色 400×240 → 框 (20,10) 60×40 內變橘，框外每個像素（含透明破洞）＝原圖`, async () => {
        await only('w3'); await pc('layer.delete', { layer: (await byName('w3')).id }); await addImage('w3', HOLE_PNG);
        const before = await pixelsOf();
        expect([before.w, before.h, before.d[(HOLE[1] * IMG_W + HOLE[0]) * 4 + 3]], 'hole layer, full frame').toEqual([IMG_W, IMG_H, 0]);
        await deselect();
        await pc('select.rect', { x: B[0] + 20, y: B[1] + 10, width: 60, height: 40 });
        await startMode(m);
        if (m === 'fill') await body('ai-fill').locator('#afPrompt').fill('一片藍天');
        aiMode = 'orange';
        try { await clickUntil(body('ai-fill').locator('#afApply'), body('ai-fill').locator('#afMsg'), /^✅/); } finally { aiMode = 'green'; }
        const s = seen.at(-1)!;
        expect([s.route, s.out]).toEqual([m === 'fill' ? '/api/tools/studio/genfill' : '/api/tools/studio/inpaint', [IMG_W * 2, IMG_H * 2]]);
        await select('w3');
        const after = await pixelsOf();
        expect([after.w, after.h]).toEqual([IMG_W, IMG_H]);
        const sel: Box = [20, 10, 60, 40];
        let outsideChanged = 0, insideNotOrange = 0, holeOpaque = 0;
        for (let y = 0; y < IMG_H; y++) for (let x = 0; x < IMG_W; x++) {
          const i = (y * IMG_W + x) * 4, a = after.d.subarray(i, i + 4), b = before.d.subarray(i, i + 4);
          if (inBox(x, y, sel)) { if (a[0] !== 255 || a[1] !== 128 || a[2] !== 0 || a[3] !== 255) insideNotOrange++; }
          else if (a[3] !== b[3] || (b[3] > 0 && (a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]))) outsideChanged++;
          if (inBox(x, y, HOLE) && a[3] !== 0) holeOpaque++;
        }
        await deselect();
        await shotA(`ai-fill-${m}-outside-kept`);
        expect({ outsideChanged, insideNotOrange, holeOpaque }).toEqual({ outsideChanged: 0, insideNotOrange: 0, holeOpaque: 0 });
        return `outside ${IMG_W * IMG_H - 60 * 40} px unchanged, hole ${HOLE[2] * HOLE[3]} px still transparent`;
      });
    }
    await only('w3'); await pc('layer.delete', { layer: (await byName('w3')).id }); await addImage('w3');

    // ---------------- genfx ----------------
    for (const dir of ['Left outpaint', 'Right outpaint', 'Top outpaint', 'Bottom outpaint'] as const) {
      const [fw, fh, fx, fy] = FRAME[dir], size = [fw, fh];
      await check(`A genfx 擴圖 ${dir}：模型回 ${MODEL_SCALE}× 縮小圖 → 新圖層 ${fw}×${fh}（原圖比例）、原圖像素在 (${fx},${fy}) 不變、圖層對齊原圖 [${B[0] - fx},${B[1] - fy}]、原圖留著`, async () => {
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
        const px = await pixelsOf();
        let srcChanged = 0;
        for (let y = 0; y < IMG_H; y++) for (let x = 0; x < IMG_W; x++) {
          const i = ((y + fy) * px.w + x + fx) * 4, [r, g, b] = grad(x, y);
          if (px.d[i] !== r || px.d[i + 1] !== g || px.d[i + 2] !== b || px.d[i + 3] !== 255) srcChanged++;
        }
        await shot(`genfx-outpaint-${dir.split(' ')[0].toLowerCase()}`);
        await shotA(`genfx-outpaint-${dir.split(' ')[0].toLowerCase()}`);
        expect(srcChanged, 'source pixels inside the outpaint result').toBe(0);
        expect(added.bounds!.slice(0, 2), 'new layer aligned on the source').toEqual([B[0] - fx, B[1] - fy]);
        return `new layer ${JSON.stringify(added.bounds)}`;
      });
    }

    await check('A genfx 擴圖 Zoom out 2x：模型把原圖原樣送回（沒擴、比例跟 2× 框一樣）→ 內容對不上、面板警告，不拉伸對齊', async () => {
      await only('w3'); await select('w3');
      await openPanel('genfx');
      await body('genfx').locator('#gfPrompt').fill('海邊草地');
      await body('genfx').locator('#gfDirs button[data-v="Zoom out 2x"]').click();
      await clickUntil(body('genfx').locator('#gfOutpaint'), body('genfx').locator('#gfMsg'), /對不上/);
      const added = (await layers()).find((l) => l.active)!;
      expect(added.bounds!.slice(2), 'placed as returned, not stretched to 400×240').toEqual([IMG_W, IMG_H]);
      return `new layer ${JSON.stringify(added.bounds)}`;
    });

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

    // ---------------- A: ai-edit ----------------
    await check('A ai-edit：每個模型一顆鈕並標價；按 Nano Banana 2 → /generate {model, prompt, 1 張 JPEG 參考圖 200×120, aspectRatio 16:9} → 新圖層 200 寬、左上對齊原圖、原圖不動', async () => {
      await only('w3'); await select('w3');
      const before = await pixelsOf();
      await openPanel('ai-edit');
      const labels = await body('ai-edit').locator('[data-ae-model]').allTextContents();
      expect(labels.length).toBe(4);
      for (const l of labels) expect(l).toMatch(/NT\$\d/);
      await body('ai-edit').locator('#aePrompt').fill('把背景換成海邊');
      const n = (await layers()).length;
      await clickUntil(body('ai-edit').locator('[data-ae-model="nano-banana-2"]'), body('ai-edit').locator('#aeMsg'), /^✅/);
      const s = seen.at(-1)!;
      expect([s.route, s.model, s.prompt, s.refs, s.refType, s.iw, s.ih, s.aspectRatio]).toEqual(['/api/tools/studio/generate', 'nano-banana-2', '把背景換成海邊', 1, 'image/jpeg', IMG_W, IMG_H, '16:9']);
      const ls = await layers();
      expect(ls.length).toBe(n + 1);
      const added = ls.find((l) => l.active)!;
      expect(added.bounds).toEqual([B[0], B[1], IMG_W, Math.round((640 * IMG_W) / 1024)]);
      await expect(body('ai-edit').locator('#aeMsg')).toContainText('NT$2.2');
      await shotA('ai-edit-new-layer');
      await select('w3');
      expect((await pixelsOf()).d.equals(before.d), 'source layer untouched').toBe(true);
      return `new layer ${JSON.stringify(added.bounds)}; buttons ${labels.join(' / ')}`;
    });

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
