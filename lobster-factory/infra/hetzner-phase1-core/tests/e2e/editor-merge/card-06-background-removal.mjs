// CARD-06 🪄 去背 on /tools/canvas (Fabric 7): a generated white-background PNG; every item is driven through the REAL panel controls
// ([data-bg-*] hooks) and read back from the exported PNG / the image object. AI 去背 is answered by page.route (the dev server has
// no Supabase) so the request itself is asserted.
//   item 1 colour key  → corner alpha 0 / centre alpha 255 in the exported PNG, adj.removeColor stored
//   item 2 AI 去背     → request (method, role header, body = the source), busy/failed/ok messages, in-place swap, ONE undo step, size guard
//   item 3 還原        → key off + AI source back, 調色 / 去白底 untouched
//   item 4 disabled    → non-image selection disables the panel with the hint
//   invariant (Codex F1–F3): legacy filters survive, white/0.12 key survives 調色 edits, 還原 keeps 去白底
// The old Vector Editor (public/vector-editor.html) retired 2026-11-05 (R0-PLAN C7.3): the Fabric 5 side and the cross-editor
// comparisons are gone; the vector editor is /tools/vector-pro (smoke: tests/e2e/smoke/05-vector-pro.spec.ts).
// Run (dev server first): node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904
//   cd lobster-factory/infra/hetzner-phase1-core/tests && node e2e/editor-merge/card-06-background-removal.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const BASE = process.argv[2] ?? "http://localhost:3904";
const OUT = process.argv[3] ?? "../../../../agency-os/reports/e2e/2026-11-04/editor-merge";
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + detail}`); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ── PNG writer (RGB or RGBA) ──
const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function makePng(w, h, px, alpha, level = 6) {
  const bpp = alpha ? 4 : 3, raw = Buffer.alloc((w * bpp + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(px(x, y), y * (w * bpp + 1) + 1 + x * bpp);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, alpha ? 6 : 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level })), chunk("IEND", Buffer.alloc(0))]);
}
const W = 120, H = 80, inRect = (x, y) => x >= 30 && x < 90 && y >= 20 && y < 60;
const SRC = makePng(W, H, (x, y) => (inRect(x, y) ? [255, 0, 0] : [255, 255, 255]), false);            // white background, red block
const RESULT = makePng(W, H, (x, y) => (inRect(x, y) ? [255, 0, 0, 255] : [255, 255, 255, 0]), true);  // what the cloud returns: background gone
const IMG = join(OUT, "card-06-test-white-bg.png"); writeFileSync(IMG, SRC);
const SRC_URL = "data:image/png;base64," + SRC.toString("base64");
const RESULT_URL = "data:image/png;base64," + RESULT.toString("base64");
// big source (base64 > the route's 12M-char cap) for the size guard: incompressible noise 1800×1800
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed >>> 16) & 255; };
const BIG = makePng(1800, 1800, () => [rnd(), rnd(), rnd()], false, 1);
const BIG_IMG = join(OUT, "card-06-test-big-noise.png"); writeFileSync(BIG_IMG, BIG);
const BIG_RESULT_URL = "data:image/png;base64," + makePng(100, 100, (x, y) => (x < 10 && y < 10 ? [0, 0, 0, 0] : [255, 0, 0, 255]), true).toString("base64");

const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
};
const decoder = await (await browser.newContext()).newPage();
await decoder.goto("about:blank");
/** RGBA of the given pixels of a PNG file */
async function pixelsOf(file, pts) {
  const b64 = readFileSync(file).toString("base64");
  return decoder.evaluate(async ({ b, pts }) => {
    const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/png;base64," + b; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, px: pts.map(([x, y]) => Array.from(g.getImageData(x, y, 1, 1).data)) };
  }, { b: b64, pts });
}
const CORNER = [2, 2], CENTRE = [W / 2, H / 2];
const a = (p) => p[3];

// browser-side helpers, serialised into page.evaluate (the canvas page exposes window.__cvTest.canvas)
const IN_PAGE = {
  C: "window.__cvTest.canvas",
};

async function openCanvas(ctx, tag, { upload = IMG } = {}) {
  const page = await ctx.newPage(); watch(page, tag);
  await page.goto(`${BASE}/tools/canvas`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector('button[title="加文字"]') && !document.querySelector('button[title="加文字"]').disabled, null, { timeout: 90000 });
  await page.waitForFunction(() => !!window.__cvTest, null, { timeout: 30000 });
  if (upload) {
    await page.locator('input[type="file"][accept^="image/png"]').setInputFiles(upload);
    await page.waitForFunction(() => window.__cvTest.canvas.getObjects().some((o) => o.type === "image"), null, { timeout: 60000 });
  }
  for (const t of ["🎨 調色", "🪄 去背"]) await page.locator(".build-panel > button", { hasText: t }).first().click();
  await page.waitForSelector("[data-cg-sec]"); await page.waitForSelector("[data-bg-panel]");
  await page.evaluate(() => document.querySelectorAll("[data-cg-sec]").forEach((d) => { d.open = true; }));
  await page.evaluate(() => { const st = window.__cvTest.undoStack; const op = st.push.bind(st); window.__pushes = 0; st.push = (...a) => { window.__pushes++; return op(...a); }; window.__cvTest.canvas.backgroundColor = ""; delete window.EyeDropper; });
  const h = {
    tag, page, root: page, kind: "canvas",
    ev: (fn, arg) => page.evaluate(fn, arg),
    select: async () => { await page.evaluate(() => { const c = window.__cvTest.canvas; c.setActiveObject(c.getObjects().find((o) => o.type === "image")); c.requestRenderAll(); }); await page.waitForTimeout(300); },
    reselect: async () => { await page.evaluate(() => { const c = window.__cvTest.canvas; c.discardActiveObject(); c.setActiveObject(c.getObjects().find((o) => o.type === "image")); c.requestRenderAll(); }); await page.waitForTimeout(400); },
    selectNone: async () => { await page.evaluate(() => { const c = window.__cvTest.canvas; c.discardActiveObject(); c.requestRenderAll(); }); await page.waitForTimeout(300); },
    addText: async () => { await page.locator('button[title="加文字"]').first().click(); await page.waitForTimeout(400); },
    dropText: async () => { await page.evaluate(() => { const c = window.__cvTest.canvas; c.getObjects().filter((x) => x.type !== "image").forEach((x) => c.remove(x)); c.discardActiveObject(); c.requestRenderAll(); }); await page.waitForTimeout(300); },
    pushes: () => page.evaluate(() => window.__pushes),
    undo: async () => { await page.locator('button[title="復原 (Ctrl+Z)"]').click(); await page.waitForTimeout(1100); },
    redo: async () => { await page.locator('button[title="重做 (Ctrl+Shift+Z)"]').click(); await page.waitForTimeout(1100); },
    exportPng: async (name) => {
      if ((await page.locator('button[title="下載全尺寸 PNG"]').count()) === 0) { await page.locator(".build-panel > button", { hasText: "匯出 / 存入" }).click(); await page.waitForSelector('button[title="下載全尺寸 PNG"]'); }
      const [dl] = await Promise.all([page.waitForEvent("download"), page.locator('button[title="下載全尺寸 PNG"]').click()]);
      const f = join(OUT, `_tmp-${name ?? tag}.png`); await dl.saveAs(f); return f;
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
      await page.waitForTimeout(1500);
    },
    shot: async (name) => { await page.locator("[data-bg-panel]").scrollIntoViewIfNeeded(); await page.locator("[data-bg-panel]").locator("xpath=ancestor::div[contains(@style,'sticky')]").screenshot({ path: join(OUT, name) }); },
    clientOf: (x, y) => page.evaluate(([x, y]) => { const c = window.__cvTest.canvas, r = c.lowerCanvasEl.getBoundingClientRect(), z = c.getZoom(); return [r.left + x * z, r.top + y * z]; }, [x, y]),
    click: async (x, y) => { const [cx, cy] = await h.clientOf(x, y); await page.mouse.click(cx, cy); await page.waitForTimeout(300); },
  };
  return h;
}
// ── drivers ──
const imgJs = `${IN_PAGE.C}.getObjects().find((o) => o.type === "image")`;
const ui = {
  setKey: async (h, color, dist) => { await h.select(); await h.root.locator("[data-bg-color]").fill(color); await h.root.locator("[data-bg-dist]").fill(String(dist)); },
  go: async (h) => { await h.root.locator("[data-bg-go]").click(); await h.page.waitForTimeout(900); },
  key: async (h, color, dist) => { await ui.setKey(h, color, dist); await ui.go(h); },
  revert: async (h) => { await h.select(); await h.root.locator("[data-bg-revert]").click(); await h.page.waitForTimeout(1200); },
  ai: async (h) => { await h.select(); await h.root.locator("[data-bg-ai]").click(); },
  slider: async (h, path, v) => { await h.select(); await h.root.locator(`input[data-cg="${path}"]`).fill(String(v)); await h.page.waitForTimeout(150); },
  removeWhite: async (h, on) => { await h.select(); await h.root.locator("[data-cg-removewhite]").setChecked(on); await h.page.waitForTimeout(300); },
  resetGrade: async (h) => { await h.select(); const b = h.root.locator("[data-cg-reset]"); if (await b.isEnabled()) await b.click(); await h.page.waitForTimeout(900); },
  adj: (h) => h.ev((js) => { const o = eval(js); return o ? o.adj ?? null : null; }, imgJs),
  filters: (h) => h.ev((js) => (eval(js).filters || []).map((f) => f.type), imgJs),
  msg: (h) => h.root.locator("[data-bg-msg]").textContent(),
  panel: (h) => h.ev(() => {
    const p = document.querySelector("[data-bg-panel], #bgFields");
    return { disabled: p.disabled, hint: (document.querySelector("[data-bg-hint]")?.textContent ?? "").trim(), revertDisabled: document.querySelector("[data-bg-revert]").disabled, color: document.querySelector("[data-bg-color]").value, dist: +document.querySelector("[data-bg-dist]").value, distLabel: document.querySelector("[data-bg-dist-val]").textContent.trim() };
  }),
  // the image's own source pixels (what AI 去背 swaps) + transform / identity
  src: (h) => h.ev((js) => {
    const o = eval(js), el = o._originalElement || o.getElement();
    const c = document.createElement("canvas"); c.width = el.naturalWidth || el.width; c.height = el.naturalHeight || el.height; const g = c.getContext("2d"); g.drawImage(el, 0, 0);
    const at = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
    return { w: c.width, h: c.height, corner: at(2, 2), centre: at(c.width >> 1, c.height >> 1), hasOrig: typeof o.bgOriginal === "string" && o.bgOriginal.startsWith("data:image/") };
  }, imgJs),
  xform: (h) => h.ev((js) => { const o = eval(js); return { left: o.left, top: o.top, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, flipX: !!o.flipX, flipY: !!o.flipY, name: o.name ?? null, lock: !!o.lockMovementX, tag: o.__tag ?? null, sw: o.getScaledWidth(), sh: o.getScaledHeight() }; }, imgJs),
};
// back to the plain placement (the AI section tilts / scales / locks the image to prove the swap keeps all of it)
const resetXform = (h) => h.ev((js) => { const o = eval(js); o.set({ scaleX: 1, scaleY: 1, angle: 0, flipX: false, flipY: false, name: undefined, lockMovementX: false, lockMovementY: false, lockScalingX: false, lockScalingY: false, lockRotation: false, hasControls: true });
  o.set({ left: 60 - (o.originX === "center" ? 0 : o.width / 2), top: 40 - (o.originY === "center" ? 0 : o.height / 2) }); o.setCoords(); window.__cvTest.canvas.requestRenderAll(); }, imgJs);
const alphaAfter = async (h, name) => { const f = await h.exportPng(name); return pixelsOf(f, [CORNER, CENTRE]); };
const stubAi = async (ctx, handler) => { const seen = []; await ctx.route("**/api/tools/studio/remove-bg", async (route) => { const req = route.request(); seen.push({ method: req.method(), headers: req.headers(), body: req.postData() }); await handler(route, seen.length); }); return seen; };
const okJson = (image, delay = 0) => async (route) => { if (delay) await new Promise((r) => setTimeout(r, delay)); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, image }) }); };

const ctxOpts = { viewport: { width: 1400, height: 2400 }, acceptDownloads: true };
const ctx = await browser.newContext(ctxOpts);
const aiSeen = await stubAi(ctx, okJson(RESULT_URL, 700));
const cv = await openCanvas(ctx, "canvas");
const both = [cv];

// ───────────────────────── structure: one panel, order, removed duplicates ─────────────────────────
eq("REMOVED canvas: exactly one 🪄 去背 panel; no 濾鏡 / 去背 panel", await cv.page.evaluate(() => [[...document.querySelectorAll(".build-panel > button")].filter((b) => /🪄 去背$/.test(b.textContent.trim())).length, [...document.querySelectorAll(".build-panel > button")].some((b) => /濾鏡 \/ 去背/.test(b.textContent))]), [1, false]);
eq("canvas panel order: 圖層 → 調色 → 去背", await cv.page.evaluate(() => { const t = [...document.querySelectorAll(".build-panel > button")].map((b) => b.textContent.replace(/^[▾▸]/, "").trim()); const i = t.findIndex((x) => /圖層/.test(x)); return [t[i + 1], t[i + 2]]; }), ["🎨 調色", "🪄 去背"]);
eq("default values", await ui.panel(cv).then((c) => [c.color, c.dist, c.distLabel]), ["#ffffff", 0.15, "0.15"]);
{
  const tsx = readFileSync("../apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx", "utf8");
  check("the panel ships collapsed (SidebarPanel defaultCollapsed)", /title="🪄 去背"[^>]*defaultCollapsed/.test(tsx));
}

// ───────────────────────── item 4: disabled with a hint when the selection is not an image ─────────────────────────
for (const h of both) {
  const t = (n) => `${h.tag} ${n}`;
  await h.selectNone();
  let p = await ui.panel(h);
  eq(t("4 nothing selected → panel disabled + hint"), [p.disabled, p.hint], [true, "先選取圖片後才能使用。"]);
  await h.addText(); await h.ev(() => { const c = window.__cvTest.canvas; c.setActiveObject(c.getObjects().find((x) => x.type !== "image")); c.requestRenderAll(); }); await h.page.waitForTimeout(300);
  p = await ui.panel(h);
  eq(t("4 text selected → still disabled + hint"), [p.disabled, p.hint], [true, "先選取圖片後才能使用。"]);
  await h.dropText(); await h.select();
  p = await ui.panel(h);
  eq(t("4 image selected → enabled, no hint, 還原 disabled (nothing to revert)"), [p.disabled, p.hint, p.revertDisabled], [false, "", true]);
}
for (const h of both) await h.select();

// ───────────────────────── item 1: colour key → transparent ─────────────────────────
const base = [await alphaAfter(cv, "base-canvas")];
for (const [i, h] of both.entries()) check(`${h.tag} baseline: opaque white corner, red centre (${base[i].w}×${base[i].h})`, a(base[i].px[0]) === 255 && a(base[i].px[1]) === 255 && base[i].px[0][0] === 255 && base[i].px[1][1] === 0 && base[i].w === W && base[i].h === H, JSON.stringify(base[i]));
for (const h of both) {
  const t = (n) => `${h.tag} ${n}`;
  const n0 = await h.pushes();
  await ui.key(h, "#ffffff", 0.15);
  const out = await alphaAfter(h, h.tag);
  check(t("1 去除此色 white/0.15 → exported corner alpha 0, centre alpha 255 (red stays)"), a(out.px[0]) === 0 && a(out.px[1]) === 255 && out.px[1][0] === 255 && out.px[1][1] === 0, JSON.stringify(out.px));
  eq(t("1 adj.removeColor stored, 去白底 untouched"), [(await ui.adj(h)).removeColor, (await ui.adj(h)).removeWhite], [{ color: "#ffffff", distance: 0.15 }, false]);
  eq(t("1 one RemoveColor filter on the image"), await ui.filters(h), ["RemoveColor"]);
  eq(t("1 the click made ONE undo step"), (await h.pushes()) - n0, 1);
  await h.select();
  eq(t("3 還原 is enabled now"), (await ui.panel(h)).revertDisabled, false);
}

// 吸色 (the EyeDropper API is deleted on the page → the artboard-click fallback, which reads the pixel under the click)
for (const h of both) {
  const t = (n) => `${h.tag} ${n}`;
  await ui.revert(h);
  await h.root.locator("[data-bg-color]").fill("#123456");
  await h.root.locator("[data-bg-pick]").click();
  eq(t("1 💧 click → busy hint shown"), await ui.msg(h), "點畫布任一點取色…");
  await h.click(CENTRE[0], CENTRE[1]);
  eq(t("1 💧 picked the red block → colour input follows"), [(await ui.panel(h)).color, await ui.msg(h)], ["#ff0000", "✅ 取到顏色 #ff0000"]);
  check(t("1 the pick click did not lose the selection (panel still enabled)"), (await ui.panel(h)).disabled === false);
  await h.root.locator("[data-bg-pick]").click();
  await h.click(CORNER[0], CORNER[1]);
  eq(t("1 💧 picked the white background"), (await ui.panel(h)).color, "#ffffff");
}
for (const h of both) {
  // tolerance matters: a colour near white at 0 tolerance leaves the white; slider label follows
  const t = (n) => `${h.tag} ${n}`;
  await ui.key(h, "#fefefe", 0);
  let o = await alphaAfter(h, h.tag);
  check(t("1 key #fefefe @ tolerance 0 does not match pure white (corner stays opaque)"), a(o.px[0]) === 255, JSON.stringify(o.px[0]));
  await h.select(); await h.root.locator("[data-bg-dist]").fill("0.3"); await ui.go(h); // export dropped the selection
  o = await alphaAfter(h, h.tag);
  check(t("1 same key @ tolerance 0.3 removes it (corner alpha 0)"), a(o.px[0]) === 0, JSON.stringify(o.px[0]));
  await h.select();
  eq(t("1 the label follows the slider"), (await ui.panel(h)).distLabel, "0.30");
  await ui.revert(h);
}

// ───────────────────────── invariant F2: white / 0.12 key is its own entry ─────────────────────────
for (const h of both) {
  const t = (n) => `${h.tag} F2 ${n}`;
  await ui.resetGrade(h); await ui.key(h, "#ffffff", 0.12);
  await ui.slider(h, "grade.sat", 130); await ui.slider(h, "grade.sat", 140); await ui.slider(h, "contrast", 15);
  const adj = await ui.adj(h);
  eq(t("white/0.12 colour key survives 調色 edits (adj)"), [adj.removeColor, adj.removeWhite], [{ color: "#ffffff", distance: 0.12 }, false]);
  eq(t("…and is still built once after the grade filters"), await ui.filters(h), ["Saturation", "RemoveColor", "Contrast"]);
  const o = await alphaAfter(h, h.tag);
  check(t("…and the exported corner is still transparent"), a(o.px[0]) === 0 && a(o.px[1]) === 255, JSON.stringify(o.px));
  await ui.resetGrade(h);
  eq(t("調色 重設 keeps the colour key"), [(await ui.adj(h)).removeColor, (await ui.filters(h))], [{ color: "#ffffff", distance: 0.12 }, ["RemoveColor"]]);
  await ui.revert(h);
  eq(t("還原 → key off, nothing else on the image"), [(await ui.adj(h)).removeColor, await ui.filters(h)], [null, []]);
  const o2 = await alphaAfter(h, h.tag);
  check(t("還原 restores the alpha (corner opaque white again)"), a(o2.px[0]) === 255 && o2.px[0][0] === 255, JSON.stringify(o2.px[0]));
}

// ───────────────────────── invariant F3: 還原 keeps 去白底 ─────────────────────────
for (const h of both) {
  const t = (n) => `${h.tag} F3 ${n}`;
  await ui.resetGrade(h); await ui.removeWhite(h, true);
  await ui.key(h, "#ffffff", 0.12);
  eq(t("去白底 + colour key = two RemoveColor entries"), await ui.filters(h), ["RemoveColor", "RemoveColor"]);
  await ui.revert(h);
  const adj = await ui.adj(h);
  eq(t("還原 clears only the key: 去白底 still on, one RemoveColor left"), [adj.removeColor, adj.removeWhite, await ui.filters(h)], [null, true, ["RemoveColor"]]);
  const o = await alphaAfter(h, h.tag);
  check(t("…and the corner is still transparent (the panel's 去白底 did its job)"), a(o.px[0]) === 0, JSON.stringify(o.px[0]));
  await h.select();
  eq(t("…the 調色 checkbox still shows it on"), await h.root.evaluate(() => !!document.querySelector("[data-cg-removewhite]").checked), true);
  await ui.removeWhite(h, false);
  const o2 = await alphaAfter(h, h.tag);
  check(t("untick 去白底 → opaque again"), a(o2.px[0]) === 255, JSON.stringify(o2.px[0]));
}

// ───────────────────────── invariant F1: legacy filters survive ─────────────────────────
for (const h of both) {
  const t = (n) => `${h.tag} F1 ${n}`;
  await ui.resetGrade(h);
  await h.ev((js) => {
    const C = window.__cvTest.canvas, o = eval(js);
    const F = window.__cvTest.fabric.filters;
    o.adj = undefined; o.filters = [new F.Brightness({ brightness: 0.2 })]; o.applyFilters(); C.requestRenderAll();
  }, imgJs);
  await h.reselect();
  eq(t("the controls of a legacy image show neutral (nothing invented)"), await h.root.evaluate(() => [...document.querySelectorAll("input[data-cg]")].every((e) => +e.value === ({ "grade.sat": 100, "grade.bri": 100, "grade.white": 255, "grade.gamma": 100 }[e.dataset.cg] ?? 0))), true);
  await ui.slider(h, "grade.sat", 130);
  eq(t("a 調色 edit keeps the legacy Brightness (after the grade filter)"), await ui.filters(h), ["Saturation", "Brightness"]);
  eq(t("…it lives in adj.legacy verbatim"), (await ui.adj(h)).legacy.map((f) => [f.type, f.brightness]), [["Brightness", 0.2]]);
  await ui.slider(h, "grade.sat", 150);
  eq(t("further edits do not duplicate it"), await ui.filters(h), ["Saturation", "Brightness"]);
  await ui.key(h, "#ffffff", 0.15);
  eq(t("去除此色 keeps it too"), await ui.filters(h), ["Saturation", "RemoveColor", "Brightness"]);
  await ui.revert(h);
  eq(t("還原 keeps it"), await ui.filters(h), ["Saturation", "Brightness"]);
  await ui.resetGrade(h);
  eq(t("調色 重設 keeps it"), await ui.filters(h), ["Brightness"]);
  await h.ev((js) => { const o = eval(js); o.adj = undefined; o.filters = []; o.applyFilters(); }, imgJs);
  await h.reselect(); await ui.resetGrade(h);
}

// ───────────────────────── undo / redo of the colour key ─────────────────────────
for (const h of both) {
  const t = (n) => `${h.tag} ${n}`;
  await h.ev((js) => { const o = eval(js); o.adj = undefined; o.filters = []; o.applyFilters(); }, imgJs); await h.reselect();
  await ui.key(h, "#ffffff", 0.15); await h.page.waitForTimeout(700);
  await h.undo();
  await h.select();
  let o = await alphaAfter(h, h.tag);
  eq(t("undo → key gone (adj + picture)"), [(await ui.adj(h))?.removeColor ?? null, a(o.px[0])], [null, 255]);
  await h.redo(); await h.select();
  o = await alphaAfter(h, h.tag);
  eq(t("redo → key back (adj + picture)"), [(await ui.adj(h)).removeColor, a(o.px[0])], [{ color: "#ffffff", distance: 0.15 }, 0]);
  await ui.revert(h); await h.page.waitForTimeout(700);
}

// ───────────────────────── item 2: AI 去背 (stubbed route) ─────────────────────────
for (const h of both) {
  const t = (n) => `${h.tag} ${n}`;
  await h.ev((js) => { const o = eval(js); o.__tag = "SAME-OBJECT"; o.set({ left: 40, top: 30, scaleX: 1.5, scaleY: 1.5, angle: 15, flipX: true, flipY: false, name: "hero", lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true, hasControls: false }); o.setCoords(); }, imgJs);
  await ui.slider(h, "grade.sat", 130); await ui.slider(h, "grade.hue", 12); await h.page.waitForTimeout(800);
  const before = await ui.xform(h), adjBefore = await ui.adj(h), srcBefore = await ui.src(h);
  check(t("2 (setup) source has an opaque corner, nothing stored yet"), a(srcBefore.corner) === 255 && !srcBefore.hasOrig, JSON.stringify(srcBefore));
  const n0 = await h.pushes(), seen0 = aiSeen.length;
  await ui.ai(h);
  await h.page.waitForTimeout(250);
  eq(t("2 busy message while the cloud works"), await ui.msg(h), "AI 去背中…（雲端處理，約 5~20 秒）");
  eq(t("2 panel is locked while busy"), (await ui.panel(h)).disabled, true);
  await h.root.waitForFunction(() => /AI 去背完成/.test(document.querySelector("[data-bg-msg]").textContent), null, { timeout: 20000 });
  await h.page.waitForTimeout(500);
  eq(t("2 success message"), await ui.msg(h), "✅ AI 去背完成（透明底，記得勾匯出透明底）");
  const req = aiSeen[aiSeen.length - 1];
  eq(t("2 exactly one request"), aiSeen.length - seen0, 1);
  eq(t("2 request = POST + JSON + operator role header"), [req.method, req.headers["content-type"], req.headers["x-ops-simulated-role"]], ["POST", "application/json", "operator"]);
  eq(t("2 request body = the image's own source (the uploaded PNG, no 調色 baked in)"), JSON.parse(req.body), { image: SRC_URL });
  const after = await ui.xform(h), srcAfter = await ui.src(h);
  eq(t("2 replaced IN PLACE: same object, left/top/scale/angle/flip/name/lock unchanged"), after, before);
  check(t("2 new source: corner alpha 0, centre red opaque"), a(srcAfter.corner) === 0 && a(srcAfter.centre) === 255 && srcAfter.centre[0] === 255, JSON.stringify(srcAfter));
  check(t("2 the pre-removal source is kept on the image (bgOriginal, a data URL)"), srcAfter.hasOrig, JSON.stringify(srcAfter));
  eq(t("2 調色 (adj) untouched"), await ui.adj(h), adjBefore);
  eq(t("2 ONE undo step"), (await h.pushes()) - n0, 1);
  eq(t("3 還原 enabled after AI"), (await ui.panel(h)).revertDisabled, false);
  // undo / redo of the swap
  await h.undo(); await h.select();
  let s = await ui.src(h);
  check(t("2 undo → the original source is back (corner opaque, no bgOriginal)"), a(s.corner) === 255 && !s.hasOrig, JSON.stringify(s));
  await h.redo(); await h.select();
  s = await ui.src(h);
  check(t("2 redo → the AI source again (corner transparent, bgOriginal present)"), a(s.corner) === 0 && s.hasOrig, JSON.stringify(s));
  eq(t("2 …still the same transform after undo/redo"), { ...(await ui.xform(h)), tag: null }, { ...before, tag: null });
}
// failure messages + nothing changes
await ctx.unroute("**/api/tools/studio/remove-bg");
const failSeen = await stubAi(ctx, async (route, n) => { if (n === 1) await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, error: "no_credits" }) }); else await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ ok: false, error: "forbidden_role", role: "viewer" }) }); });
for (const h of both) {
  const t = (n) => `${h.tag} ${n}`;
  failSeen.length = 0;
  await ui.revert(h); // back to the original so the failure case starts clean
  const srcBefore = await ui.src(h), n0 = await h.pushes();
  await ui.ai(h);
  await h.root.waitForFunction(() => /AI 去背失敗/.test(document.querySelector("[data-bg-msg]").textContent), null, { timeout: 15000 });
  eq(t("2 failed (ok:false) → message"), await ui.msg(h), "⚠️ AI 去背失敗：no_credits（需登入且有權限；或改用「去除此色」）");
  await ui.ai(h);
  await h.root.waitForFunction(() => /forbidden_role/.test(document.querySelector("[data-bg-msg]").textContent), null, { timeout: 15000 });
  eq(t("2 failed (HTTP 403) → error text from the route"), await ui.msg(h), "⚠️ AI 去背失敗：forbidden_role（需登入且有權限；或改用「去除此色」）");
  eq(t("2 a failed call changes nothing (source, no undo step, panel usable again)"), [await ui.src(h), (await h.pushes()) - n0, (await ui.panel(h)).disabled], [srcBefore, 0, false]);
}
await ctx.unroute("**/api/tools/studio/remove-bg");

// ───────────────────────── item 3: 還原 after AI + colour key, then save / load ─────────────────────────
const aiSeen2 = await stubAi(ctx, okJson(RESULT_URL));
for (const h of both) {
  const t = (n) => `${h.tag} ${n}`;
  await resetXform(h); await ui.resetGrade(h);
  await ui.ai(h); await h.root.waitForFunction(() => /AI 去背完成/.test(document.querySelector("[data-bg-msg]").textContent), null, { timeout: 20000 }); await h.page.waitForTimeout(500);
  await ui.key(h, "#ff0000", 0.3); // a key on top of the AI result (removes the red block; the 調色 brightness below runs BEFORE the key, so the tolerance has headroom)
  await ui.slider(h, "grade.bri", 120); await h.page.waitForTimeout(900);
  const o = await alphaAfter(h, h.tag);
  check(t("3 (setup) AI result + red key → centre now transparent too"), a(o.px[0]) === 0 && a(o.px[1]) === 0, JSON.stringify(o.px));
  h.proj = await h.saveProj(`card-06-${h.tag}.design.json`);
  const proj = JSON.parse(readFileSync(h.proj, "utf8"));
  const objs = proj.json.objects;
  check(t("3 the project file carries adj.removeColor and bgOriginal"), objs.some((x) => x.adj && x.adj.removeColor && typeof x.bgOriginal === "string" && x.bgOriginal.startsWith("data:image/")), JSON.stringify(Object.keys(objs[0] ?? {})));
  const n0 = await h.pushes();
  await ui.revert(h);
  const adj = await ui.adj(h), s = await ui.src(h), o2 = await alphaAfter(h, h.tag);
  eq(t("3 還原 → key off, AI source swapped back, bgOriginal dropped"), [adj.removeColor, a(s.corner), s.hasOrig], [null, 255, false]);
  eq(t("3 還原 left 調色 alone"), adj.grade.bri, 120);
  check(t("3 還原 → exported corner opaque + centre red again"), a(o2.px[0]) === 255 && a(o2.px[1]) === 255 && o2.px[1][0] === 255, JSON.stringify(o2.px));
  check(t("3 還原 = ONE undo step"), (await h.pushes()) - n0 === 1, String((await h.pushes()) - n0));
  eq(t("3 還原 disabled again (nothing left to revert)"), (await ui.panel(h)).revertDisabled, true);
}
// save/load, then 還原 on the loaded image
for (const [label, from] of [["canvas→canvas", cv]]) {
  const c2 = await browser.newContext(ctxOpts); await stubAi(c2, okJson(RESULT_URL));
  const h = await openCanvas(c2, `load-${label}`, { upload: null });
  await h.loadProj(from.proj);
  await h.ev(() => { const C = window.__cvTest.canvas; C.backgroundColor = ""; C.requestRenderAll(); }); // the file stores the white artboard colour; the test reads alpha
  await h.select();
  const t = (n) => `load ${label}: ${n}`;
  const adj = await ui.adj(h), s = await ui.src(h);
  eq(t("adj.removeColor + 調色 survive"), [adj.removeColor, adj.grade.bri], [{ color: "#ff0000", distance: 0.3 }, 120]);
  check(t("the AI source + bgOriginal survive (corner alpha 0)"), a(s.corner) === 0 && s.hasOrig, JSON.stringify(s));
  const p = await ui.panel(h);
  eq(t("the panel shows the key again"), [p.color, p.dist, p.revertDisabled], ["#ff0000", 0.3, false]);
  const o = await alphaAfter(h, "load-" + label);
  check(t("exported picture is the same (corner + centre transparent)"), a(o.px[0]) === 0 && a(o.px[1]) === 0, JSON.stringify(o.px));
  await ui.revert(h);
  const o2 = await alphaAfter(h, "load2-" + label), s2 = await ui.src(h);
  check(t("還原 after a load works (opaque corner, red centre back)"), a(o2.px[0]) === 255 && a(o2.px[1]) === 255 && !s2.hasOrig, JSON.stringify([o2.px, s2]));
  await c2.close();
}
await ctx.unroute("**/api/tools/studio/remove-bg");

// ───────────────────────── size guard: a source over the route's 12M-char cap is shrunk ─────────────────────────
{
  {
    const c3 = await browser.newContext(ctxOpts);
    const bigSeen = await stubAi(c3, okJson(BIG_RESULT_URL));
    const h = await openCanvas(c3, "big-canvas", { upload: BIG_IMG });
    const t = (n) => `${h.kind} size guard: ${n}`;
    await h.select();
    const before = await ui.xform(h), s0 = await ui.src(h);
    check(t("(setup) the source is 1800×1800"), s0.w === 1800 && s0.h === 1800, JSON.stringify(s0));
    await ui.ai(h);
    await h.root.waitForFunction(() => /AI 去背(完成|失敗)/.test(document.querySelector("[data-bg-msg]").textContent), null, { timeout: 90000 });
    const req = bigSeen[0];
    const body = JSON.parse(req.body);
    check(t(`request image stays under the route cap (${body.image.length} ≤ 12000000 chars)`), body.image.length <= 12_000_000, String(body.image.length));
    check(t("…and is a type the route accepts"), /^data:image\/(png|jpeg|webp);base64,/.test(body.image), body.image.slice(0, 30));
    check(t("(sanity) the raw source really was over the cap"), ("data:image/png;base64," + BIG.toString("base64")).length > 12_000_000);
    eq(t("success message"), await ui.msg(h), "✅ AI 去背完成（透明底，記得勾匯出透明底）");
    const after = await ui.xform(h), s1 = await ui.src(h);
    check(t(`new source is 100×100, displayed size unchanged (${before.sw}×${before.sh} → ${after.sw.toFixed(1)}×${after.sh.toFixed(1)})`), s1.w === 100 && Math.abs(after.sw - before.sw) < 1 && Math.abs(after.sh - before.sh) < 1, JSON.stringify({ s1, before, after }));
    await ui.revert(h);
    const s2 = await ui.src(h), back = await ui.xform(h);
    check(t("還原 → 1800×1800 again, same displayed size"), s2.w === 1800 && Math.abs(back.sw - before.sw) < 1 && !s2.hasOrig, JSON.stringify({ s2, back }));
    await c3.close();
  }
}

// ───────────────────────── screenshots ─────────────────────────
const ctxS = await browser.newContext(ctxOpts); await stubAi(ctxS, okJson(RESULT_URL));
const sc = await openCanvas(ctxS, "shot-canvas");
for (const h of [sc]) {
  await ui.key(h, "#ffffff", 0.22); await h.root.locator("[data-bg-ai]").scrollIntoViewIfNeeded();
  await ui.ai(h); await h.root.waitForFunction(() => /AI 去背完成/.test(document.querySelector("[data-bg-msg]").textContent), null, { timeout: 20000 }); await h.page.waitForTimeout(500);
}
await sc.shot("card-06-canvas.png");
await ctxS.close();

await browser.close();
const envNoise = (e) => /Failed to load resource|supabase_unavailable|the server responded with a status of (403|401|503)/.test(e);
const consoleErrs = errors.filter((e) => !envNoise(e));
const resourceErrs = errors.filter(envNoise);
check("no console/page errors on any page", consoleErrs.length === 0, consoleErrs.join(" | "));
if (resourceErrs.length) console.log(`NOTE ${resourceErrs.length} failed resource loads (dev-server no-Supabase noise / the stubbed 403 case, excluded)`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
