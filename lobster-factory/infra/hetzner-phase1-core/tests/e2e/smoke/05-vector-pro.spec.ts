/**
 * Smoke 05 — 向量（專業版） VectorCraft (agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md C6.1)
 *
 * The VectorCraft web build is public static files (nginx /vector-pro/, decision 1); /tools/vector-pro is the login-gated
 * page that frames it. Always: the build boots headless (software WebGL) and answers `vectorcraft.request('ui.inspect')`
 * with JSON. With OPS_TEST_EMAIL + OPS_TEST_PASSWORD: the same through the signed-in page's iframe; without them the page
 * must answer with a login redirect, never a server error.
 *
 * Panel effects: every dock panel's main button must change something real (a passing unit test is not proof a panel
 * works: 2026-11-05 prod had 4 of 10 panels doing nothing while every test was green). Runs signed in, or against a
 * next-admin dev server without auth (VECTOR_PRO_NO_AUTH=1):
 *   node tests/e2e/social/dev-server-no-supabase.mjs 3911   with VECTOR_PRO_DEV_ORIGIN pointing at a static server whose
 *   root holds current/ = a VectorCraft build;   PLAYWRIGHT_BASE_URL=http://localhost:3911 VECTOR_PRO_NO_AUTH=1
 * My Designs is answered by page.route (nothing is written to the real gallery); AI 去背 is not pressed (paid).
 */
import { test, expect, type Page, type Frame } from '@playwright/test';
import path from 'path';
import fs   from 'fs';
import zlib from 'zlib';
import { SCREENSHOTS_DIR, opsBasicHttpCredentials } from '../helpers/env';

const BUILD_PATH = '/vector-pro/current/index.html?lang=zh-hant';
const EMAIL    = process.env.OPS_TEST_EMAIL    || '';
const PASSWORD = process.env.OPS_TEST_PASSWORD || '';
const NO_AUTH  = process.env.VECTOR_PRO_NO_AUTH === '1';
const CAN_OPEN_PAGE = NO_AUTH || Boolean(EMAIL && PASSWORD);

// The wasm is ~7 MB gzipped and SwiftShader renders on the CPU: allow it time to boot.
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

type VcWindow = { vectorcraft: { request: (m: string, p?: unknown) => Promise<unknown>; execute: (c: string, p?: unknown) => Promise<any> } };

/** Wait for window.vectorcraft in `target`, then ask the app to describe its UI. */
async function inspect(target: Page | Frame): Promise<Record<string, unknown>> {
  await target.waitForFunction(() => typeof (window as unknown as { vectorcraft?: { request?: unknown } }).vectorcraft?.request === 'function', null, { timeout: 150_000 });
  const raw = await target.evaluate(async () => {
    const vc = (window as unknown as VcWindow).vectorcraft;
    const r = await vc.request('ui.inspect');
    return typeof r === 'string' ? r : JSON.stringify(r);
  });
  const parsed = JSON.parse(raw) as unknown;
  expect(parsed && typeof parsed === 'object' && !Array.isArray(parsed), `ui.inspect is not a JSON object: ${raw.slice(0, 200)}`).toBe(true);
  return parsed as Record<string, unknown>;
}

/** /tools/vector-pro, signed in when the server asks for it. */
async function openPage(page: Page): Promise<void> {
  await page.goto('/tools/vector-pro', { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).pathname === '/login') {
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/tools\/vector-pro/, { timeout: 30_000 });
  }
  // the dock is mounted by the page's effect: once it has panels, the page's listeners (theme, dock) are live
  await page.waitForFunction(() => !!document.querySelector('#vector-pro-dock [data-panel]'), null, { timeout: 60_000 });
}

/** The VectorCraft iframe once the page has rendered it (the page is a client component: not there at domcontentloaded). */
async function vcFrame(page: Page): Promise<Frame | null> {
  const el = await page.locator('iframe.vp-frame').elementHandle({ timeout: 60_000 });
  return el ? el.contentFrame() : null;
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
    test.skip(Boolean(EMAIL && PASSWORD) || NO_AUTH, 'signed-in variant below covers the page');
    const res = await page.goto('/tools/vector-pro', { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 0).toBeLessThan(500);
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('signed in, /tools/vector-pro frames the build and it answers ui.inspect', async ({ page }) => {
    test.skip(!CAN_OPEN_PAGE, 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD (or VECTOR_PRO_NO_AUTH=1 on a dev server) to open the page');
    await openPage(page);
    await expect(page.locator('#vector-pro-dock')).toBeAttached();
    const frame = await vcFrame(page);
    expect(frame, 'no /vector-pro/ iframe on the page').toBeTruthy();
    await inspect(frame!);
    await page.screenshot({ path: screenshotPath('smoke-vector-pro-page') });
  });

  // lib/theme/frame-theme.ts: the page answers VectorCraft's awarewave:theme-ready with the app tokens; VectorCraft's
  // awarewave:theme-applied marks the iframe data-theme-linked="1". Red until the build carries the receiver (C1), so it
  // runs only with VECTOR_PRO_THEME_RECEIVER=1: a known red in the post-deploy smoke would hide a real regression.
  // Drop the fixme line in the commit that ships the receiver.
  test('VectorCraft receives the app theme and answers applied', async ({ page }) => {
    test.fixme(process.env.VECTOR_PRO_THEME_RECEIVER !== '1', 'VectorCraft theme receiver (C1) not shipped; VECTOR_PRO_THEME_RECEIVER=1 runs it');
    test.skip(!CAN_OPEN_PAGE,'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD (or VECTOR_PRO_NO_AUTH=1 on a dev server) to open the page');
    await openPage(page);
    await inspect((await vcFrame(page))!);
    await expect(page.locator('iframe.vp-frame[data-theme-linked="1"]')).toBeAttached({ timeout: 30_000 });
  });

  // The sender alone, with a stand-in receiver inside the iframe: ready → every theme token arrives → applied links it.
  test('the page answers theme-ready with the app tokens (stand-in receiver)', async ({ page }) => {
    test.skip(!CAN_OPEN_PAGE, 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD (or VECTOR_PRO_NO_AUTH=1 on a dev server) to open the page');
    await openPage(page);
    const frame = (await vcFrame(page))!;
    await frame.waitForLoadState('domcontentloaded');
    const got = await frame.evaluate(() => new Promise<Record<string, string>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no awarewave:theme within 10 s of theme-ready')), 10_000);
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || e.data?.channel !== 'awarewave:theme') return;
        clearTimeout(t);
        window.parent.postMessage({ channel: 'awarewave:theme-applied' }, location.origin);
        resolve(e.data.tokens);
      });
      window.parent.postMessage({ channel: 'awarewave:theme-ready' }, location.origin);
    }));
    expect(Object.keys(got)).toContain('--accent-text');
    expect(got['--body-bg'], '--body-bg carries a value').not.toBe('');
    await expect(page.locator('iframe.vp-frame[data-theme-linked="1"]')).toBeAttached();
  });

  test('every dock panel\'s main button has a real effect', async ({ page }) => {
    test.skip(!CAN_OPEN_PAGE, 'Set OPS_TEST_EMAIL + OPS_TEST_PASSWORD (or VECTOR_PRO_NO_AUTH=1 on a dev server) to open the page');
    test.setTimeout(600_000);
    const results: string[] = [];
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
    // One soft check per panel, so a single run lists every broken panel.
    const check = async (name: string, run: () => Promise<void>) => {
      try { await run(); results.push(`PASS ${name}`); }
      catch (err) { const msg = String((err as Error)?.message ?? err).split('\n')[0]; results.push(`FAIL ${name}: ${msg}`); expect.soft(msg, name).toBe('(no error)'); }
    };

    // My Designs answered here: the save is captured and handed back as the list's one editable design.
    let savedSource: string | null = null;
    await page.route((u) => u.pathname === '/api/tools/designs' || u.pathname === '/api/tools/designs/download', async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (url.pathname.endsWith('/download')) {
        const want = url.searchParams.get('url') ?? '';
        return route.fulfill(want.includes('src.vectorcraft') && savedSource
          ? { status: 200, contentType: 'application/octet-stream', body: Buffer.from(savedSource, 'base64') }
          : { status: 200, contentType: 'image/png', body: PNG });
      }
      if (req.method() === 'POST') {
        savedSource = (req.postDataJSON() as { sourceFile?: { data?: string } })?.sourceFile?.data ?? null;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, asset: { id: 'e2e-1' } }) });
      }
      const assets = savedSource ? [{ id: 'e2e-1', created_at: new Date().toISOString(), object_url: 'https://e2e.invalid/prev.png',
        source_url: 'https://e2e.invalid/src.vectorcraft', mime_type: 'image/png', metadata: { source: 'vector-pro', source_name: 'design.vectorcraft' } }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, assets, nextCursor: null }) });
    });

    await openPage(page);
    await page.waitForFunction(() => !!document.querySelector('#vector-pro-dock [data-panel]'), null, { timeout: 60_000 });
    const frame = await vcFrame(page);
    expect(frame, 'no /vector-pro/ iframe on the page').toBeTruthy();
    await inspect(frame!);
    const vc = <T = any>(cmd: string, params: Record<string, unknown> = {}): Promise<T> =>
      frame!.evaluate(([c, p]) => (window as unknown as VcWindow).vectorcraft.execute(c, p), [cmd, params] as const) as Promise<T>;
    const topLevel = async () => ((await vc('document.inspect')).layers as Array<{ children: Array<{ id: number; kind: string }> }>).flatMap((l) => l.children);
    const select = (id: number) => vc('select.set', { ids: [id] });
    const body = (id: string) => page.locator(`#vector-pro-dock [data-panel="${id}"] .vp-body`);
    const openPanel = async (id: string) => {
      const group = page.locator(`#vector-pro-dock [data-panel="${id}"]`);
      if (!(await group.evaluate((g) => g.classList.contains('vp-open')))) await group.locator('.vp-tab').click();
      await expect(body(id)).not.toBeEmpty();
    };
    const download = async (click: () => Promise<void>) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), click()]); return d; };

    // New 800×500 file with one PNG and one text.
    await vc('file.new', { width: 800, height: 500 });
    const placed = await vc<{ ids: number[] }>('file.place', { name: 'e2e.png', dataBase64: PNG.toString('base64') });
    let imageId = placed.ids[0];
    const textId = (await vc<{ id: number }>('text.create', { x: 100, y: 100, text: 'Hello 測試', size: 24 })).id;
    expect((await topLevel()).length, 'setup: one image + one text').toBe(2);

    await check('QR：置入後頂層恰好多 1 個群組', async () => {
      await openPanel('qr');
      const before = (await topLevel()).length;
      await body('qr').locator('#qrAdd').click();
      await expect.poll(async () => (await topLevel()).length, { timeout: 30_000 }).toBeGreaterThan(before);
      const after = await topLevel();
      expect(after.length - before, 'new top-level objects').toBe(1);
      const g = after.find((o) => ![imageId, textId].includes(o.id));
      expect(g?.kind).toBe('Group');
      const node = await vc('document.node', { id: g!.id });
      results.push(`  QR group: ${(node.children ?? node.kind?.children ?? []).length} children`);
    });

    await check('條碼：置入後頂層恰好多 1 個群組', async () => {
      await openPanel('barcode');
      const before = await topLevel();
      await body('barcode').locator('#bcGo').click();
      await expect.poll(async () => (await topLevel()).length, { timeout: 30_000 }).toBeGreaterThan(before.length);
      const after = await topLevel();
      expect(after.length - before.length, 'new top-level objects').toBe(1);
      expect(after.find((o) => !before.some((b) => b.id === o.id))?.kind).toBe('Group');
    });

    await check('字型：選文字點 Noto Serif TC 後 font_family 變', async () => {
      await openPanel('fonts');
      await select(textId);
      const fontOf = async () => (await vc('document.node', { id: textId })).kind.runs[0].style.font_family as string;
      const before = await fontOf();
      await body('fonts').locator('.fontrow', { has: page.locator('.fname', { hasText: /^Noto Serif TC$/ }) }).first().click();
      await expect.poll(fontOf, { timeout: 60_000 }).not.toBe(before);
    });

    await check('調色：選圖套用「黑白」後選取 id 變', async () => {
      await openPanel('color-grade');
      await select(imageId);
      await body('color-grade').locator('[data-cg-sec="presets"]').evaluate((d) => { (d as HTMLDetailsElement).open = true; });
      await body('color-grade').locator('[data-cg-preset="bw"]').click();
      await body('color-grade').locator('#cgApply').click();
      const selected = async () => ((await vc('document.inspect')).selection as number[])[0];
      await expect.poll(selected, { timeout: 60_000 }).not.toBe(imageId);
      imageId = await selected();
    });

    await check('去背：色鍵去除後 #bgMsg 為成功', async () => {
      await openPanel('bg-remove');
      await select(imageId);
      await body('bg-remove').locator('#bgKeyGo').click();
      await expect(body('bg-remove').locator('#bgMsg')).toHaveText(/^✅/, { timeout: 60_000 });
      imageId = ((await vc('document.inspect')).selection as number[])[0] ?? imageId;
    });

    await check('WebP：下載檔 ≤200KB 且是 image/webp', async () => {
      await openPanel('webp');
      const d = await download(() => body('webp').locator('#wpGo').click())
        .catch(async (e) => { throw new Error(`${(e as Error).message.split('\n')[0]} | #wpInfo: ${await body('webp').locator('#wpInfo').textContent()}`); });
      const file = await d.path();
      const buf = fs.readFileSync(file!);
      expect(d.suggestedFilename()).toMatch(/\.webp$/);
      expect(buf.subarray(0, 4).toString('latin1') + buf.subarray(8, 12).toString('latin1'), 'RIFF....WEBP magic').toBe('RIFFWEBP');
      expect(buf.length).toBeLessThanOrEqual(200 * 1024);
    });

    await check('Mockup：#mkOut 出現圖片', async () => {
      await openPanel('mockup');
      await body('mockup').locator('#mkGen').click();
      await expect(body('mockup').locator('#mkOut img')).toBeVisible({ timeout: 60_000 });
    });

    await check('批次匯出：下載數＝勾選數', async () => {
      await openPanel('batch-export');
      const want = await body('batch-export').locator('#bxList input:checked').count();
      let got = 0;
      const count = () => { got++; };
      page.on('download', count);
      await body('batch-export').locator('#bxGo').click();
      await expect.poll(() => got, { timeout: 30_000 }).toBe(want);
      await page.waitForTimeout(2_000);
      page.off('download', count);
      expect(got, `checked ${want}`).toBe(want);
    });

    await check('My Designs：存入後再開啟，文字還在', async () => {
      await openPanel('my-designs');
      await body('my-designs').locator('#saveDesign').click();
      await expect(body('my-designs').locator('#mdInfo')).toHaveText(/^✅/, { timeout: 60_000 });
      expect(savedSource, 'the save carried the editable source').toBeTruthy();
      await vc('file.new', { width: 300, height: 300 });
      await body('my-designs').locator('#mdReload').click();
      await body('my-designs').locator('#mdList .fontrow').first().click();
      await expect(body('my-designs').locator('#mdInfo')).toHaveText(/^✅/, { timeout: 60_000 });
      const texts = async () => ((await vc('document.inspect', { kind: 'Type' })).nodes as Array<{ text: string }> ?? []).map((n) => n.text);
      await expect.poll(texts, { timeout: 30_000 }).toContain('Hello 測試');
    });

    await check('範本：套用 A4 後 artboards[0] 尺寸變', async () => {
      await openPanel('templates');
      const size = async () => { const a = ((await vc('document.inspect')).artboards as Array<{ width: number; height: number }>)[0]; return `${Math.round(a.width)}×${Math.round(a.height)}`; };
      const before = await size();
      await body('templates').getByRole('button', { name: 'A4', exact: true }).click();
      await expect.poll(size, { timeout: 30_000 }).not.toBe(before);
    });

    console.log(`\n[vector-pro panels]\n${results.join('\n')}\n[console]\n${[...new Set(errors)].join('\n')}\n`);
    await page.screenshot({ path: screenshotPath('smoke-vector-pro-panels') });
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
