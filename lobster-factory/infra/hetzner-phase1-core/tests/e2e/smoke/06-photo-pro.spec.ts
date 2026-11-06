/**
 * Smoke 06 — 畫布（專業版） PhotoCraft (agency-os/handoffs/2026-11-05-photocraft-pro/R0-PLAN.md C4.4, C6.1)
 *
 * The PhotoCraft web build is public static files (nginx /photo-pro/, C2); /tools/photo-pro is the login-gated page that
 * frames it with ?host=parent. Always: the build boots headless (software WebGL) and answers `photocraft.request('ui.inspect')`.
 * With OPS_TEST_EMAIL + OPS_TEST_PASSWORD (or PHOTO_PRO_NO_AUTH=1 on a dev server): the page's dock, and every panel's main
 * button changes something real (a green unit test is not proof: 2026-11-05 vector-pro had 4 of 10 panels doing nothing).
 * Dev server without auth:
 *   node tests/e2e/social/dev-server-no-supabase.mjs 3912   with PHOTO_PRO_DEV_ORIGIN pointing at a static server whose
 *   root holds current/ = a PhotoCraft build (scripts/photocraft-pro);   PLAYWRIGHT_BASE_URL=http://localhost:3912 PHOTO_PRO_NO_AUTH=1
 * Paid AI routes (/api/tools/studio/*) and My Designs are answered by page.route: nothing is billed or written.
 */
import { test, expect, type Page, type Frame } from '@playwright/test';
import path from 'path';
import fs   from 'fs';
import zlib from 'zlib';
import { SCREENSHOTS_DIR, opsBasicHttpCredentials } from '../helpers/env';

const BUILD_PATH = '/photo-pro/current/index.html';
const EMAIL    = process.env.OPS_TEST_EMAIL    || '';
const PASSWORD = process.env.OPS_TEST_PASSWORD || '';
const NO_AUTH  = process.env.PHOTO_PRO_NO_AUTH === '1';
const CAN_OPEN_PAGE = NO_AUTH || Boolean(EMAIL && PASSWORD);

test.setTimeout(180_000);
test.use({
  httpCredentials: opsBasicHttpCredentials(),
  acceptDownloads: true,
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

function screenshotPath(name: string): string {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

type PcWindow = { photocraft: { request: (m: string, p?: unknown) => Promise<any>; execute: (c: string, p?: unknown) => Promise<any> } };
type Layer = { id: number; name: string; kind: string; bounds: [number, number, number, number] | null; active: boolean };

async function inspect(target: Page | Frame): Promise<Record<string, unknown>> {
  await target.waitForFunction(() => typeof (window as unknown as { photocraft?: { request?: unknown } }).photocraft?.request === 'function', null, { timeout: 150_000 });
  const ui = await target.evaluate(() => (window as unknown as PcWindow).photocraft.request('ui.inspect'));
  expect(ui && typeof ui === 'object' && !Array.isArray(ui), 'ui.inspect is not a JSON object').toBe(true);
  return ui as Record<string, unknown>;
}

async function openPage(page: Page): Promise<void> {
  await page.goto('/tools/photo-pro', { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).pathname === '/login') {
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/tools\/photo-pro/, { timeout: 30_000 });
  }
  await page.waitForFunction(() => !!document.querySelector('#photo-pro-dock .vp-icon'), null, { timeout: 60_000 });
}

async function pcFrame(page: Page): Promise<Frame | null> {
  const el = await page.locator('iframe.vp-frame').elementHandle({ timeout: 60_000 });
  return el ? el.contentFrame() : null;
}

test.describe('Photo Pro (PhotoCraft) smoke', () => {
  test('the public build boots and answers ui.inspect', async ({ page }) => {
    const res = await page.goto(BUILD_PATH, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), `${BUILD_PATH} returned ${res?.status()}`).toBe(200);
    const ui = await inspect(page);
    expect(Object.keys(ui).length).toBeGreaterThan(0);
    await page.screenshot({ path: screenshotPath('smoke-photo-pro-build') });
  });

  test('/tools/photo-pro needs login (redirect, never 5xx)', async ({ page }) => {
    test.skip(Boolean(EMAIL && PASSWORD) || NO_AUTH, 'signed-in variant below covers the page');
    const res = await page.goto('/tools/photo-pro', { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 0).toBeLessThan(500);
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('every dock panel\'s main button has a real effect; native export downloads', async ({ page }) => {
    test.skip(!CAN_OPEN_PAGE, 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD (or PHOTO_PRO_NO_AUTH=1 on a dev server) to open the page');
    test.setTimeout(900_000);
    const results: string[] = [];
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
    const check = async (name: string, run: () => Promise<void>) => {
      try { await run(); results.push(`PASS ${name}`); }
      catch (err) {
        const msg = String((err as Error)?.message ?? err).split('\n')[0];
        // the layer stack when it failed: which layer the panel touched (or lost) is the first thing to know
        const stack = await layers().then((ls) => JSON.stringify(ls.map((l) => [l.id, l.name, l.kind, l.bounds, l.active]))).catch(() => '?');
        results.push(`FAIL ${name}: ${msg} | layers ${stack}`);
        expect.soft(msg, name).toBe('(no error)');
      }
    };

    // Paid AI: answered here with a same-size PNG (the panels then replace / place it).
    const studio: string[] = [];
    await page.route((u) => u.pathname.startsWith('/api/tools/studio/'), async (route) => {
      studio.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image: `data:image/png;base64,${PNG.toString('base64')}` }) });
    });
    // My Designs: the save is captured and handed back as the list's one editable design.
    let savedSource: string | null = null;
    await page.route((u) => u.pathname === '/api/tools/designs' || u.pathname === '/api/tools/designs/download', async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (url.pathname.endsWith('/download')) {
        const want = url.searchParams.get('url') ?? '';
        return route.fulfill(want.includes('src.psd') && savedSource
          ? { status: 200, contentType: 'application/octet-stream', body: Buffer.from(savedSource, 'base64') }
          : { status: 200, contentType: 'image/png', body: PNG });
      }
      if (req.method() === 'POST') {
        savedSource = (req.postDataJSON() as { sourceFile?: { data?: string } })?.sourceFile?.data ?? null;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, asset: { id: 'e2e-1' } }) });
      }
      const assets = savedSource ? [{ id: 'e2e-1', created_at: new Date().toISOString(), object_url: 'https://e2e.invalid/prev.png',
        source_url: 'https://e2e.invalid/src.psd', mime_type: 'image/png', metadata: { source: 'canvas', source_name: 'design.psd' } }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, assets, nextCursor: null }) });
    });

    await openPage(page);
    const frame = await pcFrame(page);
    expect(frame, 'no /photo-pro/ iframe on the page').toBeTruthy();
    await inspect(frame!);
    const pc = <T = any>(cmd: string, params: Record<string, unknown> = {}): Promise<T> =>
      frame!.evaluate(([c, p]) => (window as unknown as PcWindow).photocraft.execute(c, p), [cmd, params] as const) as Promise<T>;
    const session = () => frame!.evaluate(() => (window as unknown as PcWindow).photocraft.request('ui.inspect').then((u: any) => u.session));
    // Always the test document (index 0): while a panel works, the adapter briefly makes a scratch document active.
    const layers = async (document = 0): Promise<Layer[]> => (await pc('layer.list', { flat: true, document })).layers;
    const active = async () => (await layers()).find((l) => l.active)!;
    const body = (id: string) => page.locator(`#photo-pro-dock .vp-body[data-panel="${id}"]`);
    const openPanel = async (id: string) => {
      if (!(await body(id).isVisible())) await page.locator(`#photo-pro-dock .vp-icon[data-panel-icon="${id}"]`).click();
      await expect(body(id)).toBeVisible();
      await expect(body(id)).not.toBeEmpty();
    };
    /** Clears the panel's message, clicks, waits for `want`; a timeout reports what the panel said instead.
     *  (Clearing first: two buttons of one panel share a message line, so a stale ✅ would pass at once.) */
    const clickUntil = async (button: ReturnType<Page['locator']>, msg: ReturnType<Page['locator']>, want: RegExp) => {
      await msg.evaluate((e) => { e.textContent = ''; });
      await button.click();
      try { await expect(msg).toHaveText(want, { timeout: 120_000 }); }
      catch { throw new Error(`panel said: ${JSON.stringify(await msg.textContent())}`); }
    };
    const download = async (click: () => Promise<void>) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), click()]); return d; };

    // Setup: 800×500 white document + one pixel layer (the test PNG, opened through the host message and copied in).
    await pc('file.new', { width: 800, height: 500, background: 'white' });
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
      const f = document.querySelector('iframe.vp-frame') as HTMLIFrameElement;
      f.contentWindow!.postMessage({ type: 'photocraft:open', name: 'e2e.png', bytes }, location.origin, [bytes]);
    }, PNG.toString('base64'));
    await expect.poll(async () => (await session()).documents.length, { timeout: 30_000 }).toBe(2);
    await pc('layer.copyToDocument', { document: 0, center: true, name: 'e2e' });
    await pc('file.close', { document: 1, save: 'discard' });
    await pc('document.activate', { document: 0 });
    const pixelId = async () => (await layers()).find((l) => l.kind === 'Pixel' && l.name === 'e2e')!.id;
    // What PhotoCraft shows while the panels work (tab names, status bar, notices), sampled all along: no internal scratch
    // name may appear, no SVG "needs a font" notice. maxDocs: the most documents open at once since the last reset.
    const seen = new Set<string>();
    let sampling = true, maxDocs = 0;
    const sampler = (async () => {
      while (sampling) {
        const u = await frame!.evaluate(() => (window as unknown as PcWindow).photocraft.request('ui.inspect')).catch(() => null);
        if (u) {
          maxDocs = Math.max(maxDocs, u.session.documents.length);
          for (const t of [...u.session.documents.map((d: { name: string }) => d.name), u.status, ...(u.notices ?? []).map((n: { title: string }) => n.title)]) if (t) seen.add(String(t));
        }
        await page.waitForTimeout(40);
      }
    })();
    const selectPixel = async () => pc('layer.select', { layer: await pixelId() });
    expect((await layers()).length, 'setup: background + e2e layer').toBe(2);

    await check('語言：首次開啟介面為繁中', async () => {
      await expect.poll(async () => JSON.stringify(await pc('prefs.get', { path: 'interface.language' })), { timeout: 30_000 }).toContain('zh-hant');
    });

    await check('QR：多一個 Shape 圖層', async () => {
      await openPanel('qr');
      const before = (await layers()).length;
      await body('qr').locator('#qrAdd').click();
      await expect.poll(async () => (await layers()).length, { timeout: 60_000 }).toBe(before + 1);
      expect((await active()).kind).toBe('Shape');
    });

    await check('條碼：一個群組＝底＋每一條（Shape）＋底下文字（文字圖層），整條寬', async () => {
      await openPanel('barcode');
      const top = async () => (await layers()).filter((l) => (l as Layer & { parent?: number | null }).parent == null);
      const before = (await top()).length;
      await body('barcode').locator('#bcGo').click();
      await expect.poll(async () => (await top()).length, { timeout: 60_000 }).toBe(before + 1);
      const all = await layers() as (Layer & { parent?: number | null })[];
      const g = all.find((l) => l.active)!;
      expect(g.kind, 'the barcode lands as one group').toBe('Group');
      const kids = all.filter((l) => l.parent === g.id);
      expect(kids.filter((l) => l.kind === 'Shape').length, 'background + bars (2026-11-06 prod: one 4×80 bar)').toBeGreaterThan(20);
      expect(kids.find((l) => l.kind === 'Type')?.name, 'the human-readable text').toBe('AWAREWAVE-001');
      expect(g.bounds![2], `group ${JSON.stringify(g.bounds)}`).toBeGreaterThan(300);
    });

    await check('placeImage 帶 at：200×120 放在 (50,70) → 圖層框 [50,70,200,120]', async () => {
      const before = (await layers()).length;
      await page.evaluate(async () => {
        const url = '/editor-shared/ctx-photocraft.js'; // served by the app, not a test import
        const m = await import(url);
        const c = m.createPhotocraftCtx({ frame: () => document.querySelector('iframe.vp-frame') as HTMLIFrameElement, download: () => {} });
        const cv = new OffscreenCanvas(200, 120);
        const g = cv.getContext('2d')!;
        g.fillStyle = 'teal'; // test pixels, not UI colour
        g.fillRect(0, 0, 200, 120);
        await c.placeImage(await cv.convertToBlob({ type: 'image/png' }), 'at.png', { at: [50, 70] });
      });
      const placed = (await layers()).find((l) => l.name === 'at')!;
      expect(placed?.bounds).toEqual([50, 70, 200, 120]);
      await pc('layer.delete', { layer: placed.id });
      expect((await layers()).length).toBe(before);
    });

    await check('調色：「黑白」套用後圖層換成新 id、名稱不變、位置不變', async () => {
      await openPanel('color-grade');
      await selectPixel();
      const old = await active();
      await body('color-grade').locator('[data-cg-sec="presets"]').evaluate((d) => { (d as HTMLDetailsElement).open = true; });
      await body('color-grade').locator('[data-cg-preset="bw"]').click();
      await body('color-grade').locator('#cgApply').click();
      await expect.poll(async () => (await layers()).some((l) => l.id === old.id), { timeout: 120_000 }).toBe(false);
      const now = (await layers()).find((l) => l.name === old.name)!;
      expect(now?.bounds, `old ${JSON.stringify(old.bounds)} new ${JSON.stringify(now?.bounds)}`).toEqual(old.bounds);
    });

    await check('去背：色鍵去除後 #bgMsg 為成功', async () => {
      await openPanel('bg-remove');
      await selectPixel();
      await clickUntil(body('bg-remove').locator('#bgKeyGo'), body('bg-remove').locator('#bgMsg'), /^✅/);
    });

    await check('AI 去除：選取範圍 → inpaint（mock）→ 圖層換新', async () => {
      await openPanel('ai-fill');
      await selectPixel();
      const old = await pixelId();
      const b = (await active()).bounds!;
      await pc('select.rect', { x: b[0] + 10, y: b[1] + 10, width: 30, height: 20 });
      await body('ai-fill').locator('#afRemove').click();
      await clickUntil(body('ai-fill').locator('#afApply'), body('ai-fill').locator('#afMsg'), /^✅/);
      expect(studio).toContain('/api/tools/studio/inpaint');
      expect((await layers()).some((l) => l.id === old)).toBe(false);
      await pc('select.deselect');
    });

    await check('色調分離：圖層換新', async () => {
      await openPanel('genfx');
      await selectPixel();
      const old = await pixelId();
      await clickUntil(body('genfx').locator('#gfPosterize'), body('genfx').locator('#gfMsg'), /色調分離已套用/);
      expect((await layers()).some((l) => l.id === old)).toBe(false);
    });

    await check('擴圖：genfill（mock）→ 多一個圖層', async () => {
      await openPanel('genfx');
      await selectPixel();
      const before = (await layers()).length;
      await body('genfx').locator('#gfPrompt').fill('海邊草地');
      await clickUntil(body('genfx').locator('#gfOutpaint'), body('genfx').locator('#gfMsg'), /擴圖完成/);
      expect((await layers()).length, 'one new layer for the outpainted image').toBe(before + 1);
    });

    await check('邊緣遮罩：第一個筆刷套用後圖層換新', async () => {
      await openPanel('edge-mask');
      await selectPixel();
      const old = await pixelId();
      await clickUntil(body('edge-mask').locator('[data-em-style]').first(), body('edge-mask').locator('#emMsg'), /已套用邊緣/);
      expect((await layers()).some((l) => l.id === old)).toBe(false);
    });

    await check('WebP：下載檔 ≤200KB 且是 image/webp', async () => {
      await openPanel('webp');
      const d = await download(() => body('webp').locator('#wpGo').click())
        .catch(async (e) => { throw new Error(`${(e as Error).message.split('\n')[0]} | #wpInfo: ${await body('webp').locator('#wpInfo').textContent()}`); });
      const buf = fs.readFileSync((await d.path())!);
      expect(d.suggestedFilename()).toMatch(/\.webp$/);
      expect(buf.subarray(0, 4).toString('latin1') + buf.subarray(8, 12).toString('latin1'), 'RIFF....WEBP magic').toBe('RIFFWEBP');
      expect(buf.length).toBeLessThanOrEqual(200 * 1024);
    });

    await check('Mockup：#mkOut 出現圖片；讀圖層不開任何分頁（selectedImage＝圖層快速轉存）', async () => {
      await openPanel('mockup');
      await selectPixel();
      const docs = (await session()).documents.length;
      maxDocs = 0;
      await body('mockup').locator('#mkGen').click();
      await expect(body('mockup').locator('#mkOut img')).toBeVisible({ timeout: 120_000 });
      expect(maxDocs, 'documents open while reading the layer').toBe(docs);
    });

    await check('批次匯出：下載數＝勾選數', async () => {
      await openPanel('batch-export');
      const want = await body('batch-export').locator('#bxList input:checked').count();
      let got = 0;
      const count = () => { got++; };
      page.on('download', count);
      await body('batch-export').locator('#bxGo').click();
      await expect.poll(() => got, { timeout: 120_000 }).toBe(want);
      await page.waitForTimeout(2_000);
      page.off('download', count);
      expect(got, `checked ${want}`).toBe(want);
    });

    await check('My Designs：存入 PSD 後再開啟，圖層還在', async () => {
      await openPanel('my-designs');
      const names = (await layers()).map((l) => l.name).sort();
      await body('my-designs').locator('#saveDesign').click();
      await expect(body('my-designs').locator('#mdInfo')).toHaveText(/^✅/, { timeout: 120_000 });
      expect(savedSource, 'the save carried the editable source').toBeTruthy();
      expect(Buffer.from(savedSource!, 'base64').subarray(0, 4).toString('latin1'), 'PSD magic').toBe('8BPS');
      const docs = (await session()).documents.length;
      await body('my-designs').locator('#mdReload').click();
      await body('my-designs').locator('#mdList .fontrow').first().click();
      await expect(body('my-designs').locator('#mdInfo')).toHaveText(/^✅/, { timeout: 120_000 });
      await expect.poll(async () => (await session()).documents.length, { timeout: 60_000 }).toBe(docs + 1);
      await expect.poll(async () => (await layers(docs)).map((l) => l.name).sort(), { timeout: 60_000 }).toEqual(names);
    });

    await check('範本：套用 A4 後畫布尺寸變', async () => {
      await openPanel('templates');
      const size = async () => { const d = await pc('document.inspect'); return `${d.width}×${d.height}`; };
      const before = await size();
      await body('templates').getByRole('button', { name: 'A4', exact: true }).click();
      await expect.poll(size, { timeout: 60_000 }).not.toBe(before);
    });

    await check('範本：符合畫布／填滿畫布（選取的圖層等比置中）', async () => {
      await openPanel('templates');
      await pc('document.activate', { document: 0 }); // My Designs left its reopened copy active; layers() reads document 0
      const d = await pc('document.inspect');
      await selectPixel();
      const fitted = async () => (await layers()).find((l) => l.active)!.bounds!;
      await clickUntil(body('templates').locator('[data-fit="fit"]'), page.locator('#photo-pro-dock .vp-status'), /已符合畫布/);
      await expect.poll(async () => { const b = await fitted(); return (Math.abs(b[2] - d.width) <= 2 || Math.abs(b[3] - d.height) <= 2) && b[2] <= d.width + 2 && b[3] <= d.height + 2; }, { timeout: 60_000 }).toBe(true);
      const f = await fitted();
      expect(Math.abs(f[0] + f[2] / 2 - d.width / 2), `centred ${JSON.stringify(f)}`).toBeLessThanOrEqual(2);
      await body('templates').locator('[data-fit="fill"]').click();
      await expect.poll(async () => { const b = await fitted(); return b[2] >= d.width - 2 && b[3] >= d.height - 2; }, { timeout: 60_000 }).toBe(true);
    });

    await check('原生 File › Quick Export PNG：父頁收到下載', async () => {
      const d = await download(() => frame!.evaluate(() => (window as unknown as PcWindow).photocraft.request('ui.menu.invoke', { id: 'file.export.quickExportAsPng' })).then(() => undefined));
      const buf = fs.readFileSync((await d.path())!);
      expect(d.suggestedFilename()).toMatch(/\.png$/);
      expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
    });

    await check('原生 檔案 › 轉存為（JPEG）、另存新檔（PSD）：父頁收到下載', async () => {
      const req = (m: string, p: Record<string, unknown>) => frame!.evaluate(([m2, p2]) => (window as unknown as PcWindow).photocraft.request(m2, p2), [m, p] as const);
      const jpg = await download(async () => {
        const { dialog } = await req('ui.menu.invoke', { id: 'file.export.exportAs' });
        await req('ui.dialog.set', { dialog, field: 'format', value: 'jpg' });
        await req('ui.dialog.confirm', { dialog });
      });
      expect(jpg.suggestedFilename()).toMatch(/\.jpg$/);
      expect(fs.readFileSync((await jpg.path())!).subarray(0, 2).toString('hex'), 'JPEG magic').toBe('ffd8');
      const psd = await download(async () => { await req('ui.menu.invoke', { id: 'file.saveAs' }); });
      expect(psd.suggestedFilename()).toMatch(/\.psd$/);
      expect(fs.readFileSync((await psd.path())!).subarray(0, 4).toString('latin1'), 'PSD magic').toBe('8BPS');
    });

    await check('暫用文件都關掉了；分頁、狀態列、通知從沒出現內部暫存名或「沒有字型」', async () => {
      sampling = false;
      await sampler;
      const names = (await session()).documents.map((d: { name: string }) => d.name);
      // the test document + the design My Designs reopened, nothing else
      expect(names.length, JSON.stringify(names)).toBe(2);
      const bad = [...seen].filter((t) => /awarewave-tmp-|needs a font/i.test(t));
      expect(bad, 'shown to the user').toEqual([]);
    });

    console.log(`\n[photo-pro panels]\n${results.join('\n')}\n[studio routes] ${studio.join(', ')}\n[console errors]\n${[...new Set(errors)].join('\n')}\n`);
    await page.screenshot({ path: screenshotPath('smoke-photo-pro-panels') });
  });

  // The five ways in (canvas-handoff.ts openInCanvas): each tool's 畫布 button lands in the right editor with that image.
  // Paid generation and My Designs are answered by page.route; the design's original comes through the download route.
  test('every entry opens its image in the right editor', async ({ page }) => {
    test.skip(!CAN_OPEN_PAGE, 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD (or PHOTO_PRO_NO_AUTH=1 on a dev server) to open the pages');
    test.setTimeout(900_000);
    const results: string[] = [];
    const fail = (name: string, err: unknown) => {
      const msg = String((err as Error)?.message ?? err).split('\n')[0];
      results.push(`FAIL ${name}: ${msg}`);
      expect.soft(msg, name).toBe('(no error)');
    };
    const dataUrl = `data:image/png;base64,${PNG.toString('base64')}`;
    let psd: Buffer | null = null;
    const fetched: string[] = [];
    type Asset = { id: string; object_url: string; source_url?: string; metadata: Record<string, string> };
    const assets = ([
      { id: 'png-only', object_url: 'https://e2e.invalid/only.png', metadata: { source: 'studio', prompt: 'PNG only' } },
      { id: 'psd', object_url: 'https://e2e.invalid/psd-prev.png', source_url: 'https://e2e.invalid/src.psd', metadata: { source: 'canvas', source_name: 'design.psd' } },
      { id: 'vc', object_url: 'https://e2e.invalid/vc-prev.png', source_url: 'https://e2e.invalid/src.vectorcraft', metadata: { source: 'vector-pro', source_name: 'design.vectorcraft' } },
    ] as Asset[]).map((a) => ({ object_key: a.id, mime_type: 'image/png', byte_size: 1, created_at: new Date().toISOString(), ...a }));
    await page.route((u) => /^\/api\/tools\/(studio\/generate|tarot\/generate|tarot\/translate|designs|designs\/download)$/.test(u.pathname), async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/translate')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, english: 'tarot card' }) });
      if (url.pathname.endsWith('/download')) {
        const want = url.searchParams.get('url') ?? '';
        fetched.push(want);
        return route.fulfill(want.endsWith('.psd') && psd ? { status: 200, contentType: 'application/octet-stream', body: psd } : { status: 200, contentType: 'image/png', body: PNG });
      }
      if (url.pathname.endsWith('/designs')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, assets: route.request().method() === 'GET' ? assets : [], nextCursor: null, asset: { id: 'x' } }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, image: dataUrl, seed: 1 }) });
    });
    /** After the click: the editor page, its frame's documents once one is open. */
    const landed = async (path: RegExp) => {
      await page.waitForURL(path, { timeout: 60_000 });
      const frame = await pcFrame(page);
      if (!/photo-pro/.test(page.url())) return null;
      await inspect(frame!);
      let docs: { name: string; width: number; height: number }[] = [];
      await expect.poll(async () => (docs = (await frame!.evaluate(() => (window as unknown as PcWindow).photocraft.request('ui.inspect')) as any).session.documents).length, { timeout: 60_000 }).toBeGreaterThan(0);
      await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('canvas:'))), { message: 'handoff cleared once opened', timeout: 30_000 }).toEqual([]);
      return docs;
    };
    const hydrated = () => page.waitForTimeout(6_000); // a click before React hydrates is lost
    const entry = async (name: string, run: () => Promise<void>) => {
      try { await run(); results.push(`PASS ${name}`); await page.screenshot({ path: screenshotPath(`smoke-photo-pro-entry-${name}`) }); }
      catch (err) { fail(name, err); }
    };

    // An editable original to hand over: PhotoCraft's own Save a Copy of a small document.
    await openPage(page);
    const frame0 = await pcFrame(page);
    await inspect(frame0!);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), frame0!.evaluate(async () => {
      const pc = (window as unknown as PcWindow).photocraft;
      await pc.execute('file.new', { width: 320, height: 200, background: 'white' });
      await pc.request('ui.menu.invoke', { id: 'file.saveACopy' });
    })]);
    psd = fs.readFileSync((await dl.path())!);

    await entry('studio', async () => {
      await page.goto('/tools/studio', { waitUntil: 'domcontentloaded' });
      await hydrated();
      await page.locator('textarea').first().fill('一隻橘色的貓坐在窗邊');
      await page.getByRole('button', { name: '生成', exact: true }).click();
      await page.getByRole('button', { name: /快速編輯/ }).first().click({ timeout: 60_000 });
      const docs = await landed(/\/tools\/photo-pro/);
      expect(docs!.map((d) => [d.width, d.height])).toEqual([[96, 64]]);
    });
    await entry('tarot', async () => {
      await page.goto('/tools/tarot', { waitUntil: 'domcontentloaded' });
      await hydrated();
      await page.getByRole('button', { name: /圖片模型/ }).click();
      await page.getByRole('button', { name: /FLUX schnell/ }).click();
      await page.getByRole('button', { name: /^風格/ }).click();
      await page.getByRole('button', { name: '慕夏 Mucha' }).click();
      await page.getByRole('button', { name: '生成風格預覽' }).click();
      await page.getByRole('button', { name: /快速編輯/ }).click({ timeout: 60_000 });
      await page.getByRole('button', { name: /在 Canvas 編輯/ }).click({ timeout: 60_000 });
      const docs = await landed(/\/tools\/photo-pro/);
      expect(docs!.map((d) => [d.width, d.height])).toEqual([[96, 64]]);
    });
    await entry('banner', async () => {
      await page.goto('/tools/banner', { waitUntil: 'domcontentloaded' });
      await hydrated();
      await page.getByRole('button', { name: '在 Canvas Editor 開啟' }).click();
      const docs = await landed(/\/tools\/photo-pro/);
      expect(docs!.length).toBe(1);
      expect(docs![0].name).toMatch(/^banner-.+\.png$/);
    });
    await entry('mockup', async () => {
      await page.goto('/tools/mockup', { waitUntil: 'domcontentloaded' });
      await hydrated();
      await page.getByRole('button', { name: /^平\s*拍$/ }).click();
      await page.getByRole('button', { name: /^平\s*拍$/ }).and(page.locator('.btn-primary')).waitFor({ timeout: 30_000 });
      await page.locator('input[type=file]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
      await page.getByRole('button', { name: /合成 Mockup/ }).click({ timeout: 30_000 });
      await page.getByRole('button', { name: '在畫布編輯' }).click({ timeout: 60_000 });
      const docs = await landed(/\/tools\/photo-pro/);
      expect(docs!.map((d) => [d.width, d.height])).toEqual([[96, 64]]);
    });
    for (const [i, a] of assets.entries()) {
      await entry(`designs-${a.id}`, async () => {
        fetched.length = 0;
        await page.goto('/tools/designs', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.designs-kebab-btn', { timeout: 60_000 });
        await hydrated();
        await page.locator('.designs-kebab-btn').nth(i).click();
        await page.locator('.designs-kebab-item', { hasText: /畫布編輯|向量編輯/ }).first().click();
        const docs = await landed(a.id === 'vc' ? /\/tools\/vector-pro/ : /\/tools\/photo-pro/);
        // the editor fetched the original when there is one, else the image
        await expect.poll(() => fetched.join(' '), { timeout: 60_000 }).toContain(a.source_url ?? a.object_url);
        if (a.id === 'png-only') expect(docs!.map((d) => [d.width, d.height])).toEqual([[96, 64]]);
        if (a.id === 'psd') expect(docs!.map((d) => [d.name, d.width, d.height])).toEqual([['design.psd', 320, 200]]);
      });
    }
    console.log(`\n[photo-pro entries]\n${results.join('\n')}\n`);
  });
});

// 96×64 RGB PNG: white background, a red block in the middle (the colour key removes the white).
const PNG = (() => {
  const w = 96, h = 64, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const red = x > 24 && x < 72 && y > 16 && y < 48, o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 255; raw[o + 1] = red ? 0 : 255; raw[o + 2] = red ? 0 : 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();
