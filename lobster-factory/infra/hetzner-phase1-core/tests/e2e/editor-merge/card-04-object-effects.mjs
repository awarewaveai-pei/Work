// CARD-04 外觀 / 物件效果 union: drives /tools/canvas with a rect + circle + text each, uses
// the REAL panel controls for items 1-10 and reads the real Fabric object props after every change; one undo step per
// change (counted at snapshot()/undoStack.push), undo/redo round trips, locked objects, save-state reset, EyeDropper.
//   canvas: dev-only probe window.__cvTest = { canvas, fabric, undoStack }
// Run (dev server first): node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904
//   cd lobster-factory/infra/hetzner-phase1-core/tests && node e2e/editor-merge/card-04-object-effects.mjs [baseUrl] [outDir]
// The old Vector Editor (public/vector-editor.html) retired 2026-11-05 (R0-PLAN C7.3): /tools/vector-editor redirects to
// /tools/vector-pro, so only the Canvas Editor half of this card runs.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3904";
const OUT = process.argv[3] ?? "../../../../agency-os/reports/e2e/2026-11-04/editor-merge";
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + detail}`); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
};
// EyeDropper stub (the native one needs a human click on screen): resolves a known colour
const EYE_STUB = () => { window.EyeDropper = class { open() { return Promise.resolve({ sRGBHex: "#12ab34" }); } }; };
const NO_EYE = () => { try { delete window.EyeDropper; } catch (e) { /* */ } if ("EyeDropper" in window) Object.defineProperty(window, "EyeDropper", { value: undefined, configurable: true }); };

// serialisation of the Fabric props the card names, run inside the page
const PROPS = `(o) => ({
  type: o.type,
  fill: o.fill && typeof o.fill === "object" ? { g: o.fill.type, stops: o.fill.colorStops.map((c) => c.color), coords: o.fill.coords } : o.fill,
  stroke: o.stroke, sw: o.strokeWidth, dash: o.strokeDashArray, rx: o.rx, ry: o.ry, op: o.opacity, gco: o.globalCompositeOperation,
  sh: o.shadow ? { c: o.shadow.color, b: o.shadow.blur, x: o.shadow.offsetX, y: o.shadow.offsetY } : null,
  fx: !!o.flipX, fy: !!o.flipY, left: o.left, top: o.top,
  clip: o.clipPath ? { t: o.clipPath.type, r: o.clipPath.radius, rx: o.clipPath.rx, w: o.width, h: o.height } : null })`;

// One suite for both editors. env = how to read objects / drive the panel controls.
async function suite(tag, page, env) {
  const t = (n) => `${tag} ${n}`;
  const RECT = 0, CIRCLE = 1, TEXT = 2;
  eq(t("setup: rect + circle + text"), await env.kinds(), ["rect", "circle", "itext"]);
  // one control change = exactly ONE undo step, and the prop reads back the expected value
  async function step(name, change, read, want, { roundtrip = false } = {}) {
    const before = await read();
    const n0 = await env.pushes();
    await change(); await page.waitForTimeout(520);
    const after = await read();
    eq(t(`${name} → prop`), after, typeof want === "function" ? await want() : want);
    eq(t(`${name} → one undo step`), (await env.pushes()) - n0, 1);
    if (roundtrip) {
      await env.undo(); await page.waitForTimeout(800);
      eq(t(`${name} → undo restores`), await read(), before);
      await env.redo(); await page.waitForTimeout(800);
      eq(t(`${name} → redo reapplies`), await read(), after);
      await env.select(env.sel); await page.waitForTimeout(150);
    }
  }
  const P = (i, key) => async () => (await env.props(i))[key];

  // ── 1 填色 + 無填色 + 吸色 + 色票
  env.sel = RECT; await env.select(RECT);
  await step("1 fill colour", () => env.ui.fill("#ff0000"), P(RECT, "fill"), "#ff0000", { roundtrip: true });
  await step("1 ⊘ 無填色", () => env.ui.noFill(), async () => { const f = (await env.props(RECT)).fill; return f === "" || f === "transparent" || f == null; }, true);
  check(t("1 ⊘ button shows the active state"), await env.ui.noFillOn());
  await step("1 色票", () => env.ui.swatch("#06d6a0"), P(RECT, "fill"), "#06d6a0");
  check(t("1 fill input follows the swatch"), (await env.ui.read()).fill === "#06d6a0");
  check(t("1 吸色 button is shown where EyeDropper exists"), await env.ui.eyeVisible());
  await step("1 💧 吸色 (EyeDropper stub)", () => env.ui.eye(), P(RECT, "fill"), "#12ab34");

  // ── 2 描邊色 / 寬度 0–40 / 虛線 + 長度
  await step("2 stroke colour", () => env.ui.stroke("#00ff00"), P(RECT, "stroke"), "#00ff00");
  await step("2 stroke width 12", () => env.ui.strokeW(12), P(RECT, "sw"), 12);
  await step("2 stroke width 40 (max)", () => env.ui.strokeW(40), P(RECT, "sw"), 40);
  await step("2 stroke width 0 (min)", () => env.ui.strokeW(0), P(RECT, "sw"), 0);
  await step("2 虛線 on (gap 8) bumps a 0-width stroke to 2", () => env.ui.dash(true, 8), async () => { const p = await env.props(RECT); return [p.dash, p.sw]; }, [[8, 8], 2], { roundtrip: true });
  await step("2 虛線長度 5", () => env.ui.dash(true, 5), P(RECT, "dash"), [5, 5]);
  await step("2 虛線 off", () => env.ui.dash(false, 5), async () => { const d = (await env.props(RECT)).dash; return d == null || d.length === 0; }, true);

  // ── 3 圓角 (rect only)
  await step("3 圓角 30 on the rect", () => env.ui.rx(30), async () => { const p = await env.props(RECT); return [p.rx, p.ry]; }, [30, 30]);
  await env.select(CIRCLE); await page.waitForTimeout(150);
  await env.ui.rx(25); await page.waitForTimeout(520);
  eq(t("3 圓角 leaves a circle's rx alone"), (await env.props(CIRCLE)).rx ?? 0, 0);

  // ── 4 不透明度 + 混合模式
  await env.select(RECT); await page.waitForTimeout(150); env.sel = RECT;
  await step("4 不透明度 40", () => env.ui.opacity(40), P(RECT, "op"), 0.4, { roundtrip: true });
  await step("4 不透明度 100", () => env.ui.opacity(100), P(RECT, "op"), 1);
  for (const m of ["multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "soft-light", "hard-light", "difference"]) {
    await step(`4 blend ${m}`, () => env.ui.blend(m), P(RECT, "gco"), m);
  }
  await step("4 blend normal", () => env.ui.blend("normal"), P(RECT, "gco"), "source-over", { roundtrip: true });
  eq(t("4 blend option list = union (11 modes)"), await env.ui.blendOptions(), ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "soft-light", "hard-light", "difference"]);

  // ── 5 漸層: 2/3 stops, linear/radial, angle → ↓ ↘ ↙, apply + clear
  const gradRead = async () => { const f = (await env.props(RECT)).fill; return f && typeof f === "object" ? f : { g: null }; };
  const G = (angle, type = "linear", mid = false) => async () => { await env.ui.grad({ a: "#ff0000", b: "#0000ff", c: "#00ff00", mid, type, angle }); await env.ui.applyGrad(); };
  await step("5 3-stop linear ↓ gradient", G("90", "linear", true),
    async () => { const f = await gradRead(); return { g: f.g, stops: f.stops, vertical: f.coords ? f.coords.x1 === f.coords.x2 && f.coords.y2 > f.coords.y1 : null }; },
    { g: "linear", stops: ["#ff0000", "#00ff00", "#0000ff"], vertical: true }, { roundtrip: true });
  await step("5 2-stop linear → angle", G("0"),
    async () => { const f = await gradRead(); return { stops: f.stops, horizontal: f.coords ? f.coords.y1 === f.coords.y2 && f.coords.x2 > f.coords.x1 : null }; },
    { stops: ["#ff0000", "#0000ff"], horizontal: true });
  await step("5 ↘ angle", G("45"), async () => { const c = (await gradRead()).coords; return c ? c.x2 > c.x1 && c.y2 > c.y1 : null; }, true);
  await step("5 ↙ angle", G("135"), async () => { const c = (await gradRead()).coords; return c ? c.x1 > c.x2 && c.y2 > c.y1 : null; }, true);
  await step("5 radial 2-stop", G("0", "radial"), async () => { const f = await gradRead(); return { g: f.g, stops: f.stops, r2: f.coords ? f.coords.r2 > 0 : null }; }, { g: "radial", stops: ["#ff0000", "#0000ff"], r2: true });
  await step("5 清除 → solid fill again", () => env.ui.clearGrad(), async () => typeof (await env.props(RECT)).fill === "string", true);

  // ── 6 效果: none / 陰影 / 光暈 + colour + 模糊 + 位移
  await step("6 陰影 (colour/blur/offset)", () => env.ui.fx({ type: "shadow", color: "#112233", blur: 20, off: 8 }), async () => (await env.props(RECT)).sh, { c: "#112233", b: 20, x: 8, y: 8 }, { roundtrip: true });
  await step("6 模糊 30", () => env.ui.fxBlur(30), async () => (await env.props(RECT)).sh?.b, 30);
  await step("6 位移 14", () => env.ui.fxOff(14), async () => { const s = (await env.props(RECT)).sh; return [s?.x, s?.y]; }, [14, 14]);
  await step("6 顏色", () => env.ui.fxColor("#445566"), async () => (await env.props(RECT)).sh?.c, "#445566");
  await step("6 光暈 (offset 0, blur >= 10)", () => env.ui.fxType("glow"), async () => { const s = (await env.props(RECT)).sh; return [s?.x, s?.y, s?.b >= 10]; }, [0, 0, true]);
  await step("6 無", () => env.ui.fxType("none"), async () => (await env.props(RECT)).sh, null);

  // ── 7 翻轉 (panel buttons + the toolbar buttons where there are some)
  await step("7 ↔ 水平翻轉 (panel)", () => env.ui.flip("x"), async () => (await env.props(RECT)).fx, true);
  await step("7 ↕ 垂直翻轉 (panel)", () => env.ui.flip("y"), async () => (await env.props(RECT)).fy, true);
  if (env.toolbarFlip) await step("7 ⇋ toolbar flips back", () => env.toolbarFlip("x"), async () => (await env.props(RECT)).fx, false);
  else await step("7 ↔ again flips back", () => env.ui.flip("x"), async () => (await env.props(RECT)).fx, false);
  await step("7 ↕ again flips back", () => env.ui.flip("y"), async () => (await env.props(RECT)).fy, false);

  // ── 8 遮罩 圓形 / 圓角 / 無
  await step("8 圓形遮罩", () => env.ui.clip("circle"), async () => { const c = (await env.props(RECT)).clip; return c ? { t: c.t, r: Math.round(c.r) } : null; },
    async () => { const p = await env.props(RECT); return { t: "circle", r: Math.round(Math.min(p.clip.w, p.clip.h) / 2) }; }, { roundtrip: true });
  await step("8 圓角遮罩", () => env.ui.clip("round"), async () => { const c = (await env.props(RECT)).clip; return c ? { t: c.t, rounded: c.rx > 0 } : null; }, { t: "rect", rounded: true });
  eq(t("8 mask button shows the active state"), (await env.ui.read()).clip, "round");
  await step("8 無遮罩", () => env.ui.clip("none"), async () => (await env.props(RECT)).clip, null);
  // the mask really clips: a circle mask on a solid rect leaves the corner pixel empty
  await env.select(RECT); await env.ui.fill("#ff0000"); await env.ui.strokeW(0); await env.ui.rx(0); await env.ui.clip("circle"); await page.waitForTimeout(520);
  eq(t("8 circle mask clips the rect corner (artboard white shows) but not the centre (fill red)"), await env.cornerVsCentre(RECT), { corner: [255, 255, 255], centre: [255, 0, 0] });
  await env.ui.clip("none"); await page.waitForTimeout(400);

  // ── locked object: style still applies, position does not move
  await env.select(CIRCLE); await page.waitForTimeout(150); env.sel = CIRCLE;
  await env.lock(CIRCLE, true); await page.waitForTimeout(100);
  const posBefore = await env.props(CIRCLE);
  await step("lock: locked circle still takes a fill", () => env.ui.fill("#aa00aa"), P(CIRCLE, "fill"), "#aa00aa");
  await step("lock: locked circle still takes opacity", () => env.ui.opacity(70), P(CIRCLE, "op"), 0.7);
  const posAfter = await env.props(CIRCLE);
  eq(t("lock: position untouched by style changes"), [posAfter.left, posAfter.top], [posBefore.left, posBefore.top]);
  await env.lock(CIRCLE, false);

  // ── save-state reset
  await env.saveFlow();

  // ── 10 selection sync: objects carry values set DIRECTLY on Fabric → selecting fills every control
  await env.setupSyncObjects(); await env.deselect(); await page.waitForTimeout(200);
  await env.select(CIRCLE); await page.waitForTimeout(250);
  const u = await env.ui.read();
  eq(t("10 sync solid obj: fill/stroke/width/opacity/blend"), [u.fill, u.stroke, u.sw, u.opacity, u.blend], ["#336699", "#cc3300", 9, 35, "multiply"]);
  eq(t("10 sync solid obj: dash + gap"), [u.dash, u.gap], [true, 6]);
  eq(t("10 sync solid obj: effect type/colour/blur/offset"), [u.fxType, u.fxColor, u.fxBlur, u.fxOff], ["shadow", "#224466", 18, 7]);
  eq(t("10 sync solid obj: mask = circle"), u.clip, "circle");
  await env.select(RECT); await page.waitForTimeout(250);
  const r = await env.ui.read();
  eq(t("10 sync rect: 圓角 + gradient controls (3-stop radial)"), [r.rx, r.gradType, r.gradA, r.gradB, r.gradMid, r.gradC], [22, "radial", "#ff0000", "#0000ff", true, "#00ff00"]);
  eq(t("10 sync rect: no effect, no mask, not 無填色"), [r.fxType, r.clip, r.noFillOn], ["none", "none", false]);
  await env.select(TEXT); await page.waitForTimeout(250);
  const x = await env.ui.read();
  eq(t("10 sync text: fill + opacity"), [x.fill, x.opacity], ["#101010", 100]);

  // ── 9 default-for-next: nothing selected → controls edit the next new shape (no existing object changes)
  await env.deselect(); await page.waitForTimeout(150);
  const snap = JSON.stringify(await env.allProps());
  await env.ui.fill("#abcdef"); await env.ui.stroke("#123456"); await env.ui.strokeW(7); await env.ui.dash(true, 4); await env.ui.rx(20);
  await env.ui.opacity(55); await env.ui.blend("screen"); await env.ui.fx({ type: "shadow", color: "#334455", blur: 9, off: 5 }); await env.ui.clip("circle");
  await page.waitForTimeout(500);
  eq(t("9 nothing selected: no existing object changed"), JSON.stringify(await env.allProps()), snap);
  const nObj = (await env.kinds()).length;
  await env.addShape("rect"); await page.waitForTimeout(400);
  const nr = await env.props(nObj);
  eq(t("9 next rect gets fill/stroke/width/dash/rx/opacity/blend"), [nr.type, nr.fill, nr.stroke, nr.sw, nr.dash, nr.rx, nr.op, nr.gco], ["rect", "#abcdef", "#123456", 7, [4, 4], 20, 0.55, "screen"]);
  eq(t("9 next rect gets the effect + mask"), [nr.sh && { c: nr.sh.c, b: nr.sh.b, x: nr.sh.x }, nr.clip && nr.clip.t], [{ c: "#334455", b: 9, x: 5 }, "circle"]);
  await env.deselect(); await page.waitForTimeout(150);
  await env.ui.clip("none"); await env.ui.grad({ a: "#ff0000", b: "#0000ff", c: "#00ff00", mid: false, type: "linear", angle: "0" }); await env.ui.applyGrad(); await page.waitForTimeout(500);
  await env.addShape("circle"); await page.waitForTimeout(400);
  const nc = await env.props(nObj + 1);
  eq(t("9 next circle gets the gradient as default"), [nc.type, nc.fill?.g, nc.fill?.stops], ["circle", "linear", ["#ff0000", "#0000ff"]]);
  await env.deselect(); await env.ui.clearGrad(); await page.waitForTimeout(300);
  await env.addShape("circle"); await page.waitForTimeout(400);
  eq(t("9 清除 on the default → next shape is solid again"), typeof (await env.props(nObj + 2)).fill, "string");
  // controls show the default again after a selection is dropped
  await env.select(CIRCLE); await page.waitForTimeout(200); await env.deselect(); await page.waitForTimeout(250);
  const d = await env.ui.read();
  eq(t("10 deselect → controls show the next-shape default again"), [d.fill, d.stroke, d.opacity, d.blend, d.clip], ["#abcdef", "#123456", 55, "screen", "none"]);

  // screenshot: a styled object selected, panel on screen
  await env.select(CIRCLE); await page.waitForTimeout(250);
  await env.shot();
}

// ───────────────────────── Canvas Editor ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 2200 }, acceptDownloads: true });
  await ctx.addInitScript(EYE_STUB);
  const page = await ctx.newPage();
  watch(page, "canvas");
  await page.goto(`${BASE}/tools/canvas`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector('button[title="加文字"]') && !document.querySelector('button[title="加文字"]').disabled, null, { timeout: 90000 });
  await page.waitForFunction(() => !!window.__cvTest, null, { timeout: 30000 });
  await page.locator("button", { hasText: "形狀 / 畫筆 / 設計檔" }).first().click();
  await page.locator('button[title="加方框"]').click(); await page.waitForTimeout(300);
  await page.locator('button[title="加圓形"]').click(); await page.waitForTimeout(300);
  await page.locator('button[title="加文字"]').first().click(); await page.waitForTimeout(300);
  await page.locator("button", { hasText: "外觀 / 物件效果" }).first().click();
  await page.waitForSelector('input[title="填色"]');
  await page.evaluate(() => { const a = window.__cvTest.undoStack; window.__pushes = 0; const p = a.push; a.push = function (...x) { window.__pushes++; return p.apply(this, x); }; });
  const O = (i) => `window.__cvTest.canvas.getObjects()[${i}]`;
  const L = (title) => page.locator(`[title="${title}"]`).first();
  const outlined = (title) => page.locator(`button[title="${title}"]`).evaluate((b) => b.style.outline.includes("solid"));
  const ui = {
    fill: (v) => L("填色").fill(v), stroke: (v) => L("描邊色").fill(v), strokeW: (n) => L("描邊寬度").fill(String(n)),
    noFill: () => page.locator('button[title="無填色"]').click(), noFillOn: () => outlined("無填色"),
    swatch: (c) => page.locator(`button[title="${c}"]`).click(),
    eyeVisible: async () => (await page.locator('button[title^="吸色"]').count()) === 1,
    eye: () => page.locator('button[title^="吸色"]').click(),
    dash: async (on, gap) => { await L("虛線長度/間距").fill(String(gap)); await page.locator('input[title="虛線"]').setChecked(on); },
    rx: (n) => L("圓角").fill(String(n)), opacity: (n) => L("不透明度").fill(String(n)), blend: (m) => L("混合模式").selectOption(m),
    blendOptions: () => L("混合模式").locator("option").evaluateAll((os) => os.map((o) => o.value)),
    grad: async (g) => { await L("漸層起色").fill(g.a); await L("漸層終色").fill(g.b); await L("漸層中間色").fill(g.c); await page.locator('input[title="漸層中間色開關"]').setChecked(g.mid); await L("漸層類型").selectOption(g.type); await L("漸層角度").selectOption(g.angle); },
    applyGrad: () => page.locator('button[title="套用漸層"]').click(), clearGrad: () => page.locator('button[title="清除漸層"]').click(),
    fx: async (f) => { await L("效果類型").selectOption(f.type); await L("效果顏色").fill(f.color); await L("效果模糊").fill(String(f.blur)); await L("效果位移").fill(String(f.off)); },
    fxType: (v) => L("效果類型").selectOption(v), fxBlur: (n) => L("效果模糊").fill(String(n)), fxOff: (n) => L("效果位移").fill(String(n)), fxColor: (v) => L("效果顏色").fill(v),
    flip: (a) => page.locator(`button[title="${a === "x" ? "水平翻轉" : "垂直翻轉"}"]`).click(),
    clip: (k) => page.locator(`button[title="${{ circle: "圓形遮罩", round: "圓角遮罩", none: "移除遮罩" }[k]}"]`).click(),
    read: async () => ({
      fill: await L("填色").inputValue(), stroke: await L("描邊色").inputValue(), sw: +(await L("描邊寬度").inputValue()),
      dash: await page.locator('input[title="虛線"]').isChecked(), gap: +(await L("虛線長度/間距").inputValue()), rx: +(await L("圓角").inputValue()),
      opacity: +(await L("不透明度").inputValue()), blend: await L("混合模式").inputValue(),
      gradA: await L("漸層起色").inputValue(), gradB: await L("漸層終色").inputValue(), gradC: await L("漸層中間色").inputValue(),
      gradMid: await page.locator('input[title="漸層中間色開關"]').isChecked(), gradType: await L("漸層類型").inputValue(),
      fxType: await L("效果類型").inputValue(), fxColor: await L("效果顏色").inputValue(), fxBlur: +(await L("效果模糊").inputValue()), fxOff: +(await L("效果位移").inputValue()),
      clip: (await outlined("圓形遮罩")) ? "circle" : (await outlined("圓角遮罩")) ? "round" : (await outlined("移除遮罩")) ? "none" : null,
      noFillOn: await outlined("無填色"),
    }),
  };
  const env = {
    sel: 0, ui,
    kinds: () => page.evaluate(() => window.__cvTest.canvas.getObjects().map((o) => String(o.type).toLowerCase().replace(/-/g, ""))),
    props: (i) => page.evaluate(`(${PROPS})(${O(i)})`),
    allProps: () => page.evaluate(`window.__cvTest.canvas.getObjects().map(${PROPS})`),
    select: async (i) => { await page.evaluate(`window.__cvTest.canvas.setActiveObject(${O(i)}); window.__cvTest.canvas.requestRenderAll()`); await page.waitForTimeout(120); },
    deselect: async () => { await page.evaluate(`window.__cvTest.canvas.discardActiveObject(); window.__cvTest.canvas.requestRenderAll()`); await page.waitForTimeout(120); },
    pushes: () => page.evaluate(() => window.__pushes),
    undo: () => page.locator('button[title="復原 (Ctrl+Z)"]').click(), redo: () => page.locator('button[title="重做 (Ctrl+Shift+Z)"]').click(),
    lock: (i, on) => page.evaluate(`${O(i)}.set({ lockMovementX:${on}, lockMovementY:${on}, lockScalingX:${on}, lockScalingY:${on}, lockRotation:${on}, hasControls:${!on} })`),
    addShape: async (k) => { await page.locator(`button[title="${k === "rect" ? "加方框" : "加圓形"}"]`).click(); },
    cornerVsCentre: (i) => page.evaluate(async (idx) => {
      const c = window.__cvTest.canvas, o = c.getObjects()[idx]; c.discardActiveObject(); const others = c.getObjects().filter((x) => x !== o); others.forEach((x) => x.set({ visible: false })); c.renderAll();
      const el = c.lowerCanvasEl, z = c.getZoom(); const px = (x, y) => Array.from(el.getContext("2d").getImageData(Math.round(x * z), Math.round(y * z), 1, 1).data.slice(0, 3));
      const w = o.getScaledWidth(), h = o.getScaledHeight(), ox = o.originX === "center" ? o.left - w / 2 : o.left, oy = o.originY === "center" ? o.top - h / 2 : o.top;
      const out = { corner: px(ox + 2, oy + 2), centre: px(ox + w / 2, oy + h / 2) }; others.forEach((x) => x.set({ visible: true })); c.requestRenderAll(); return out;
    }, i),
    setupSyncObjects: async () => {
      await page.evaluate(`(() => { const { canvas: c, fabric: f } = window.__cvTest; const [rect, circle, text] = c.getObjects();
        circle.set({ fill:"#336699", stroke:"#cc3300", strokeWidth:9, opacity:0.35, globalCompositeOperation:"multiply", strokeDashArray:[6,6],
          shadow:new f.Shadow({ color:"#224466", blur:18, offsetX:7, offsetY:7 }), clipPath:new f.Circle({ radius:40, originX:"center", originY:"center" }) });
        rect.set({ rx:22, ry:22, shadow:null, clipPath:undefined, fill:new f.Gradient({ type:"radial", gradientUnits:"pixels", coords:{x1:10,y1:10,r1:0,x2:10,y2:10,r2:50}, colorStops:[{offset:0,color:"#ff0000"},{offset:0.5,color:"#00ff00"},{offset:1,color:"#0000ff"}] }) });
        text.set({ fill:"#101010", opacity:1 }); c.requestRenderAll(); })()`);
    },
    saveFlow: async () => {
      await page.route("**/api/tools/designs", (rt) => rt.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, asset: { id: "x" } }) }));
      const saveBtn = page.locator("button", { hasText: /存入 My Designs|已存入|儲存失敗/ }).first();
      if ((await saveBtn.count()) === 0) await page.locator("button", { hasText: "匯出 / 存入" }).first().click(); // panel ships collapsed
      await saveBtn.click(); await page.waitForTimeout(1200);
      eq("canvas save: 已存入 before the style edit", (await saveBtn.textContent()).trim(), "已存入 ✓");
      await env.select(1); await ui.opacity(60); await page.waitForTimeout(500);
      eq("canvas save: a style edit resets 已存入 → 存入 My Designs", (await saveBtn.textContent()).trim(), "存入 My Designs");
      await page.unroute("**/api/tools/designs");
    },
    shot: async () => { await L("填色").scrollIntoViewIfNeeded(); await L("填色").locator("xpath=ancestor::div[contains(@style,'sticky')]").screenshot({ path: join(OUT, "card-04-canvas.png") }); },
  };
  await suite("canvas", page, env);
  // EyeDropper missing → the button stays (falls back to picking a pixel on the artboard)
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 1500 } });
  await ctx2.addInitScript(NO_EYE);
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/tools/canvas`, { waitUntil: "domcontentloaded" });
  await p2.waitForFunction(() => !!document.querySelector('button[title="加文字"]') && !document.querySelector('button[title="加文字"]').disabled, null, { timeout: 90000 });
  await p2.locator("button", { hasText: "外觀 / 物件效果" }).first().click(); await p2.waitForSelector('input[title="填色"]');
  eq("canvas 1 吸色 button still shown (artboard-pixel fallback) when EyeDropper is missing", [await p2.evaluate(() => !!window.EyeDropper), await p2.locator('button[title^="吸色"]').count()], [false, 1]);
  await ctx2.close();
  await ctx.close();
}

await browser.close();
const envNoise = (e) => /Failed to load resource|supabase_unavailable/.test(e);
const consoleErrs = errors.filter((e) => !envNoise(e));
const resourceErrs = errors.filter(envNoise);
check("no console/page errors on the page", consoleErrs.length === 0, consoleErrs.join(" | "));
if (resourceErrs.length) console.log(`NOTE ${resourceErrs.length} failed resource loads (dev-server no-Supabase noise, excluded)`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
