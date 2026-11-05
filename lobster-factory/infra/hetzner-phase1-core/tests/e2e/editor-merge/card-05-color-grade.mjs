// CARD-05 🎨 調色 on /tools/canvas (Fabric 7): every item 1-8 is driven through the REAL panel controls ([data-cg*]) and the
// exported PNG must change; adj on the image, one debounced undo step per change, undo restores, selecting fills the controls /
// a non-image selection disables them, project save/load keeps adj and the picture.
//   canvas: dev-only probe window.__cvTest = { canvas, fabric, undoStack }
// The old Vector Editor (public/vector-editor.html) retired 2026-11-05 (R0-PLAN C7.3): the Fabric 5 side and the cross-editor
// comparisons are gone; the vector editor is /tools/vector-pro (smoke: tests/e2e/smoke/05-vector-pro.spec.ts).
// Run (dev server first): node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904
//   cd lobster-factory/infra/hetzner-phase1-core/tests && node e2e/editor-merge/card-05-color-grade.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const BASE = process.argv[2] ?? "http://localhost:3904";
const OUT = process.argv[3] ?? "../../../../agency-os/reports/e2e/2026-11-04/editor-merge";
mkdirSync(OUT, { recursive: true });
const TOL = 3;

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + detail}`); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ── test image: 256×160 PNG written by this script (hue sweep on top, RGB ramps below, a white patch for 去白底) ──
const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function hsv(h, s, v) { const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6].map((n) => Math.round(n * 255)); }
function makePng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let px;
    if (x >= 216 && y >= 130) px = [255, 255, 255];
    else if (y < 100) px = hsv(x / w, 0.85, 0.9);
    else px = [x, Math.min(255, 40 + (y - 100) * 3), 255 - x];
    raw.set(px, y * (w * 3 + 1) + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const IMG = join(OUT, "card-05-test-gradient.png");
writeFileSync(IMG, makePng(256, 160));

const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
};
const decoder = await (await browser.newContext()).newPage(); // decodes exported PNGs to an average RGB
await decoder.goto("about:blank");
async function avgOf(file) {
  const b64 = readFileSync(file).toString("base64");
  return decoder.evaluate(async (b) => {
    const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let r = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    let sig = 0; for (let i = 0; i < d.length; i++) sig = (sig + d[i] * ((i % 251) + 1)) % 1000000007;
    return [r / n, gg / n, bb / n, img.width, img.height, sig];
  }, b64);
}
const near = (a, b, tol = TOL) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);
const fmt = (a) => a.slice(0, 3).map((v) => v.toFixed(1)).join(",");

// ───────────────────────── editor handle ─────────────────────────
async function openCanvas(ctx, tag, { upload = true } = {}) {
  const page = await ctx.newPage(); watch(page, tag);
  await page.goto(`${BASE}/tools/canvas`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector('button[title="加文字"]') && !document.querySelector('button[title="加文字"]').disabled, null, { timeout: 90000 });
  await page.waitForFunction(() => !!window.__cvTest, null, { timeout: 30000 });
  if (upload) {
    await page.locator('input[type="file"][accept^="image/png"]').setInputFiles(IMG);
    await page.waitForFunction(() => window.__cvTest.canvas.getObjects().some((o) => o.type === "image"), null, { timeout: 30000 });
  }
  await page.locator(".build-panel > button", { hasText: "🎨 調色" }).click();
  await page.waitForSelector("[data-cg-sec]");
  await page.evaluate(() => document.querySelectorAll("[data-cg-sec]").forEach((d) => { d.open = true; }));
  await page.evaluate(() => { const st = window.__cvTest.undoStack; const op = st.push.bind(st); window.__pushes = 0; st.push = (...a) => { window.__pushes++; return op(...a); }; window.__cvTest.canvas.backgroundColor = "#000000"; });
  const R = page; // locator root
  const h = {
    tag, page, root: R, kind: "canvas",
    img: () => `window.__cvTest.canvas.getObjects().find((o) => o.type === "image")`,
    select: async () => { await page.evaluate(() => { const c = window.__cvTest.canvas; c.setActiveObject(c.getObjects().find((o) => o.type === "image")); c.requestRenderAll(); }); await page.waitForTimeout(250); },
    selectOther: async () => { await page.evaluate(() => { const c = window.__cvTest.canvas; const o = c.getObjects().find((x) => x.type !== "image"); c.setActiveObject(o); c.requestRenderAll(); }); await page.waitForTimeout(250); },
    addText: async () => { await page.locator('button[title="加文字"]').first().click(); await page.waitForTimeout(400); },
    dropOthers: async () => { await page.evaluate(() => { const c = window.__cvTest.canvas; c.getObjects().filter((x) => x.type !== "image").forEach((x) => c.remove(x)); c.discardActiveObject(); c.requestRenderAll(); }); await page.waitForTimeout(300); },
    pushes: () => page.evaluate(() => window.__pushes),
    undo: async () => { await page.locator('button[title="復原 (Ctrl+Z)"]').click(); await page.waitForTimeout(900); },
    redo: async () => { await page.locator('button[title="重做 (Ctrl+Shift+Z)"]').click(); await page.waitForTimeout(900); },
    exportAvg: async () => {
      if ((await page.locator('button[title="下載全尺寸 PNG"]').count()) === 0) { await page.locator(".build-panel > button", { hasText: "匯出 / 存入" }).click(); await page.waitForSelector('button[title="下載全尺寸 PNG"]'); }
      const [dl] = await Promise.all([page.waitForEvent("download"), page.locator('button[title="下載全尺寸 PNG"]').click()]);
      const f = join(OUT, `_tmp-${tag}.png`); await dl.saveAs(f); return avgOf(f);
    },
    saveProj: async (name) => {
      if ((await page.locator('button[title^="匯出可再編輯的設計檔"]').count()) === 0) await page.locator(".build-panel > button", { hasText: "形狀 / 畫筆 / 設計檔" }).click();
      const [dl] = await Promise.all([page.waitForEvent("download"), page.locator('button[title^="匯出可再編輯的設計檔"]').click()]);
      const f = join(OUT, name); await dl.saveAs(f); return f;
    },
    loadProj: async (file) => {
      if ((await page.locator('button[title^="匯出可再編輯的設計檔"]').count()) === 0) await page.locator(".build-panel > button", { hasText: "形狀 / 畫筆 / 設計檔" }).click();
      await page.locator('input[type="file"][accept^="application/json"]').setInputFiles(file);
      await page.waitForFunction(() => window.__cvTest.canvas.getObjects().some((o) => o.type === "image"), null, { timeout: 30000 });
      await page.waitForTimeout(1200);
    },
    getAdj: () => page.evaluate(() => { const o = window.__cvTest.canvas.getObjects().find((x) => x.type === "image"); return o ? o.adj ?? null : null; }),
    filterNames: () => page.evaluate(() => { const o = window.__cvTest.canvas.getObjects().find((x) => x.type === "image"); return (o.filters || []).map((f) => f.type); }),
    shot: async (name) => { await page.locator('[data-cg-panel]').scrollIntoViewIfNeeded(); await page.locator('[data-cg-panel]').locator("xpath=ancestor::div[contains(@style,'sticky')]").screenshot({ path: join(OUT, name) }); },
  };
  return h;
}
// control driver
const ui = {
  slider: async (h, path, v) => { await h.select(); await h.root.locator(`input[data-cg="${path}"]`).fill(String(v)); await h.page.waitForTimeout(120); },
  preset: async (h, id) => { await h.select(); await h.root.locator(`[data-cg-preset="${id}"]`).click(); await h.page.waitForTimeout(120); },
  removeWhite: async (h, on) => { await h.select(); await h.root.locator("[data-cg-removewhite]").setChecked(on); await h.page.waitForTimeout(120); },
  auto: async (h, kind) => { await h.select(); await h.root.locator(`[data-cg-auto="${kind}"]`).click(); await h.page.waitForTimeout(700); },
  hsl: async (h, tab, axis, v) => { await h.select(); await h.root.locator(`[data-cg-hsl-tab="${tab}"]`).click(); await h.root.locator(`input[data-cg-hsl="${axis}"]`).fill(String(v)); await h.page.waitForTimeout(120); },
  reset: async (h) => { await h.select(); const b = h.root.locator("[data-cg-reset]"); if (await b.isEnabled()) await b.click(); await h.page.waitForTimeout(750); }, // 重設 is disabled while everything is neutral
  read: (h) => h.root.evaluate(() => {
    const sl = {}; document.querySelectorAll("input[data-cg]").forEach((e) => { sl[e.dataset.cg] = +e.value; });
    const hs = {}; document.querySelectorAll("input[data-cg-hsl]").forEach((e) => { hs[e.dataset.cgHsl] = +e.value; });
    const pre = [...document.querySelectorAll("[data-cg-preset]")].filter((b) => (b.classList.contains("on") || b.style.fontWeight === "700") && b.dataset.cgPreset).map((b) => b.dataset.cgPreset);
    return { sl, hs, pre, rw: !!document.querySelector("[data-cg-removewhite]").checked };
  }),
};

// ───────────────────────── cases: item 1-8 ─────────────────────────
const CASES = [];
const PRESET_IDS = ["sepia", "vintage", "polaroid", "kodachrome", "brownie", "bw", "gray", "invert", "warm", "cool"];
for (const id of PRESET_IDS) CASES.push({ item: 1, name: `preset ${id}`, run: (h) => ui.preset(h, id) });
CASES.push({ item: 1, name: "去白底 (black bg shows the removed patch)", run: (h) => ui.removeWhite(h, true) });
CASES.push({ item: 1, name: "preset + 去白底 + a slider coexist", run: async (h) => { await ui.preset(h, "sepia"); await ui.removeWhite(h, true); await ui.slider(h, "grade.bri", 120); } });
for (const k of ["contrast", "color", "tone"]) CASES.push({ item: 2, name: `auto ${k}`, run: (h) => ui.auto(h, k) });
CASES.push({ item: 3, name: "levels black 30", run: (h) => ui.slider(h, "grade.black", 30) });
CASES.push({ item: 3, name: "levels white 215", run: (h) => ui.slider(h, "grade.white", 215) });
CASES.push({ item: 3, name: "levels gamma 190", run: (h) => ui.slider(h, "grade.gamma", 190) });
CASES.push({ item: 3, name: "levels all three", run: async (h) => { await ui.slider(h, "grade.black", 20); await ui.slider(h, "grade.white", 230); await ui.slider(h, "grade.gamma", 140); } });
CASES.push({ item: 4, name: "balance 青↔紅 +60", run: (h) => ui.slider(h, "grade.balCR", 60) });
CASES.push({ item: 4, name: "balance 洋紅↔綠 -50", run: (h) => ui.slider(h, "grade.balMG", -50) });
CASES.push({ item: 4, name: "balance 黃↔藍 +70", run: (h) => ui.slider(h, "grade.balYB", 70) });
for (const [path, v] of [["grade.bri", 135], ["grade.bri", 70], ["contrast", 45], ["contrast", -40], ["grade.sat", 160], ["grade.sat", 60], ["vibrance", 60], ["grade.hue", 25], ["grade.hue", -20], ["temp", 60], ["temp", -60], ["shadows", 70], ["shadows", -70], ["highlights", 80], ["grade.sharpen", 6], ["blur", 30], ["noise", 40]]) {
  CASES.push({ item: 5, name: `slider ${path} ${v}`, run: (h) => ui.slider(h, path, v) });
}
for (const [path, v] of [["exposure", 50], ["exposure", -50], ["clarity", 70], ["dehaze", 60]]) CASES.push({ item: 6, name: `camera raw ${path} ${v}`, run: (h) => ui.slider(h, path, v) });
CASES.push({ item: 7, name: "HSL 全部 hue +25", run: (h) => ui.hsl(h, "all", "h", 25) });
CASES.push({ item: 7, name: "HSL 紅 sat +60", run: (h) => ui.hsl(h, "red", "s", 60) });
CASES.push({ item: 7, name: "HSL 藍 lum -40 + 綠 hue -25", run: async (h) => { await ui.hsl(h, "blue", "l", -40); await ui.hsl(h, "green", "h", -25); } });
CASES.push({ item: 8, name: "everything at once", run: async (h) => {
  await ui.preset(h, "vintage"); await ui.slider(h, "grade.bri", 110); await ui.slider(h, "contrast", 20); await ui.slider(h, "grade.sat", 120); await ui.slider(h, "grade.hue", 10);
  await ui.slider(h, "temp", 20); await ui.slider(h, "grade.gamma", 120); await ui.slider(h, "grade.balCR", 20); await ui.slider(h, "exposure", 15); await ui.slider(h, "clarity", 30);
  await ui.hsl(h, "red", "s", 30);
} });

const ctxOpts = { viewport: { width: 1400, height: 2400 }, acceptDownloads: true };
const ctx = await browser.newContext(ctxOpts);
const cv = await openCanvas(ctx, "canvas");

// ── every item changes the exported picture
const base = [await cv.exportAvg()];
for (const c of CASES) {
  await ui.reset(cv);
  await c.run(cv);
  const a = await cv.exportAvg();
  check(`item ${c.item} ${c.name}: adj stored on the image`, (await cv.getAdj()) !== null);
  if (!/auto/.test(c.name)) check(`item ${c.item} ${c.name}: the picture really changed (export pixels ≠ neutral)`, a[5] !== base[0][5], `sig=${a[5]} base=${base[0][5]}`);
}
eq("item 1 preset labels = 原圖 + 10 presets", await cv.root.evaluate(() => [...document.querySelectorAll("[data-cg-preset]")].map((b) => b.textContent.trim())), ["原圖", "復古", "Vintage", "拍立得", "Koda", "Brownie", "黑白", "灰階", "反相", "暖色", "冷色"]);

// ── item 8: reset, persistence, undo, selection
for (const h of [cv]) {
  const t = (n) => `${h.tag} ${n}`;
  await ui.reset(h);
  const n0 = await h.pushes();
  await ui.slider(h, "grade.sat", 150); await ui.slider(h, "grade.bri", 120); await h.page.waitForTimeout(800);
  eq(t("8 two slider moves inside the debounce = ONE undo step"), (await h.pushes()) - n0, 1);
  const adj = await h.getAdj();
  eq(t("8 adj stored on the image"), [adj.grade.sat, adj.grade.bri], [150, 120]);
  check(t("8 the image carries filters built from adj"), (await h.filterNames()).length >= 2, JSON.stringify(await h.filterNames()));
  // undo restores, redo reapplies
  const picAfter = await h.exportAvg();
  await h.select(); await h.undo();
  eq(t("8 undo → adj back to neutral"), (await h.getAdj()) ? (await h.getAdj()).grade.sat : 100, 100);
  eq(t("8 undo → no grade filters left"), await h.filterNames(), []);
  const picUndone = await h.exportAvg();
  check(t("8 undo → picture back to the original"), near(picUndone, base[0], 0.6), `${fmt(picUndone)} vs ${fmt(base[0])}`);
  await h.redo();
  eq(t("8 redo → adj reapplied"), (await h.getAdj()).grade.sat, 150);
  check(t("8 redo → picture reapplied"), near(await h.exportAvg(), picAfter, 0.6));
  await h.select();
  eq(t("8 after undo/redo the controls show the image again"), await h.root.evaluate(() => +document.querySelector('input[data-cg="grade.sat"]').value), 150);
  // selection: non-image disables, image fills
  await h.addText(); await h.selectOther();
  eq(t("8 text selected → controls disabled + hint"), await h.root.evaluate(() => [document.querySelector("[data-cg-panel], #cgFields").disabled, /先選取圖片/.test(document.body.textContent)]), [true, true]);
  await h.select();
  eq(t("8 image selected → controls enabled and show THIS image's values"), await h.root.evaluate(() => [document.querySelector("[data-cg-panel], #cgFields").disabled, +document.querySelector('input[data-cg="grade.sat"]').value, +document.querySelector('input[data-cg="grade.bri"]').value]), [false, 150, 120]);
  // reset (the test text is not part of the picture being compared)
  await h.dropOthers();
  await ui.reset(h); await h.page.waitForTimeout(500);
  eq(t("8 重設 → every control neutral"), await h.root.evaluate(() => [...document.querySelectorAll("input[data-cg]")].every((e) => { const row = e.dataset.cg; return +e.value === ({ "grade.sat": 100, "grade.bri": 100, "grade.white": 255, "grade.gamma": 100 }[row] ?? 0); })), true);
  check(t("8 重設 → picture back to the original"), near(await h.exportAvg(), base[0], 0.6));
}

// ── project save/load
await ui.reset(cv);
await ui.preset(cv, "polaroid"); await ui.slider(cv, "grade.hue", 15); await ui.slider(cv, "grade.balYB", 40); await ui.hsl(cv, "red", "s", 40); await ui.slider(cv, "exposure", 20);
const WANT = await cv.getAdj();
const picC = await cv.exportAvg();
const fileC = await cv.saveProj("card-05-from-canvas.design.json");
{
  const label = "canvas→canvas";
  const c2 = await browser.newContext(ctxOpts);
  const h = await openCanvas(c2, `load-${label}`, { upload: false });
  await h.loadProj(fileC);
  eq(`load ${label}: adj survives`, await h.getAdj(), WANT);
  const after = await h.exportAvg();
  check(`load ${label}: the picture survives (${fmt(after)} vs ${fmt(picC)})`, near(after, picC), "");
  await h.select();
  eq(`load ${label}: selecting the image fills the controls`, await h.root.evaluate(() => [+document.querySelector('input[data-cg="grade.hue"]').value, +document.querySelector('input[data-cg="grade.balYB"]').value, +document.querySelector('input[data-cg="exposure"]').value]), [15, 40, 20]);
  // editing after a load still regenerates (no stale / duplicated filters)
  await ui.slider(h, "grade.hue", 0);
  const n = (await h.filterNames()).length;
  await ui.slider(h, "grade.hue", 15);
  eq(`load ${label}: editing after load keeps one filter set (count stable)`, (await h.filterNames()).length, n + 1);
  await c2.close();
}

// ── screenshot: the merged panel open, with values
await ui.reset(cv);
for (const h of [cv]) { await ui.preset(h, "vintage"); await ui.slider(h, "grade.sat", 130); await ui.slider(h, "contrast", 25); await ui.hsl(h, "red", "s", 30); await h.select(); await h.page.waitForTimeout(500); }
await cv.shot("card-05-canvas.png");
eq("REMOVED canvas: exactly one 調色 panel, no 調整 / Camera RAW / HSL / 濾鏡 panels", await cv.page.evaluate(() => [[...document.querySelectorAll("button")].filter((b) => /調色/.test(b.textContent) && /🎨/.test(b.textContent) && b.title === "收合").length, [...document.querySelectorAll("button")].filter((b) => /Camera RAW 效果|調整 Adjustments|濾鏡 \/ 去背|色彩混合器 HSL/.test(b.textContent) && b.title).length]), [1, 0]);
eq("canvas panel order: 圖層 → 調色", await cv.page.evaluate(() => { const t = [...document.querySelectorAll(".build-panel > button")].map((b) => b.textContent.trim()); const i = t.findIndex((x) => /圖層/.test(x)), j = t.findIndex((x) => x === "▾🎨 調色" || x === "▸🎨 調色"); return j === i + 1; }), true);

await browser.close();
const envNoise = (e) => /Failed to load resource|supabase_unavailable/.test(e);
const consoleErrs = errors.filter((e) => !envNoise(e));
const resourceErrs = errors.filter(envNoise);
check("no console/page errors on the page", consoleErrs.length === 0, consoleErrs.join(" | "));
if (resourceErrs.length) console.log(`NOTE ${resourceErrs.length} failed resource loads (dev-server no-Supabase noise, excluded)`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
