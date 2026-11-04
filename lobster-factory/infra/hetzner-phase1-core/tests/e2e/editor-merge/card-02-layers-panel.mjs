// CARD-02 layers-panel union: drives /tools/canvas and /tools/vector-editor with 3 objects each, exercises every layer
// control and reads the real object props / stack order / undo history after each action (never screenshots alone).
//   canvas: dev-only probe window.__cvTest = { canvas, fabric, undoStack }   vector: the page globals `canvas`, `history`, `hi`
// Run (dev server first): node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904
//   cd lobster-factory/infra/hetzner-phase1-core/tests && node e2e/editor-merge/card-02-layers-panel.mjs [baseUrl] [outDir]
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
function watch(page, tag) {
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
}

// One suite for both editors. `env` adapts how to read the live canvas, the newest undo snapshot, the rows and the buttons.
async function suite(tag, page, env) {
  const { state, topSnap, rows, rowBy, btn, undo, selected, nameEl } = env;
  const t = (n) => `${tag} ${n}`;
  const types = (s) => s.map((o) => o.kind);

  // ── base: 3 objects, rect(bottom) circle text(top), spread apart so real clicks hit one object each ──
  let s = await state();
  eq(t("base stack bottom→top"), types(s), ["rect", "circle", "itext"]);
  // 1+2) list = top layer first, one row per object, label = type label
  eq(t("1/2 rows top first, type labels"), await rows.allLabels(), ["📝 你的文字", "🔷 圓", "🔷 矩形"]);
  for (const title of ["顯示/隱藏", "鎖定/解鎖", "上移", "下移", "移至最前", "移至最後", "複製", "刪除"]) {
    eq(t(`1 every row has [${title}]`), await rows.count(`[title="${title}"]`), 3);
  }

  // 1) 👁 hide: prop, dimmed row stays listed, undo step, undo reverts
  await btn(rowBy("圓"), "顯示/隱藏").click(); await page.waitForTimeout(250);
  s = await state(); eq(t("1 hide → visible=false"), s[1].visible, false);
  eq(t("5 hidden row stays listed"), await rows.count(""), 3);
  eq(t("5 hidden row dimmed .45"), await nameEl(rowBy("圓")).evaluate((e) => getComputedStyle(e).opacity), "0.45");
  eq(t("5 hidden row marked"), await rowBy("圓").getAttribute("data-hidden"), "1");
  eq(t("6 hide recorded as newest undo snapshot"), (await topSnap())[1].visible, false);
  await undo(); s = await state(); eq(t("6 undo hide → visible=true"), s[1].visible, true);
  await btn(rowBy("圓"), "顯示/隱藏").click(); await page.waitForTimeout(250); // hide again then show
  await btn(rowBy("圓"), "顯示/隱藏").click(); await page.waitForTimeout(250);
  s = await state(); eq(t("1 show again → visible=true"), s[1].visible, true);
  eq(t("5 shown row not dimmed"), await nameEl(rowBy("圓")).evaluate((e) => getComputedStyle(e).opacity), "1");
  await undo(); await undo(); // back to the base (no visible change)

  // 1) 🔒 lock the rect: lockMovementX/Y + lockScalingX/Y + lockRotation + no controls, still selectable
  await btn(rowBy("矩形"), "鎖定/解鎖").click(); await page.waitForTimeout(250);
  s = await state(); const r = s[0];
  check(t("1 lock → move/scale/rotate locked"), r.lockMovementX && r.lockMovementY && r.lockScalingX && r.lockScalingY && r.lockRotation && r.hasControls === false, JSON.stringify(r));
  eq(t("1 locked object stays selectable"), r.selectable, true);
  eq(t("1 lock icon"), (await btn(rowBy("矩形"), "鎖定/解鎖").textContent()).trim(), "🔒");
  const lk = (await topSnap())[0]; check(t("6 lock recorded in newest undo snapshot (persisted props)"), lk.lockMovementX === true && lk.lockRotation === true, JSON.stringify(lk));
  await undo(); s = await state(); check(t("6 undo lock → unlocked"), !s[0].lockMovementX && !s[0].lockScalingX && !s[0].lockRotation, JSON.stringify(s[0]));

  // 1) name click = select; row highlighted
  await nameEl(rowBy("圓")).click(); await page.waitForTimeout(200);
  eq(t("1 name click selects that object"), await selected(), ["circle"]);
  eq(t("3 selected row highlighted, others not"), await rows.sel(), ["0", "1", "0"]);

  // 1) dblclick name = rename → name prop persisted in snapshot; label shows it; undo removes it
  page.once("dialog", (d) => d.accept("我的圓"));
  await nameEl(rowBy("圓")).dblclick(); await page.waitForTimeout(300);
  s = await state(); eq(t("1 rename → name prop"), s[1].name, "我的圓");
  eq(t("2 label = name when set"), (await rows.allLabels())[1], "🏷 我的圓");
  eq(t("6 rename recorded in newest undo snapshot (name in toJSON)"), (await topSnap())[1].name, "我的圓");
  await undo(); s = await state(); eq(t("6 undo rename → name gone"), s[1].name ?? null, null);
  eq(t("2 label back to type label"), (await rows.allLabels())[1], "🔷 圓");
  page.once("dialog", (d) => d.accept("我的圓"));
  await nameEl(rowBy("圓")).dblclick(); await page.waitForTimeout(300); // keep this name for the duplicate check

  // 1) ↑ ↓ ⤒ ⤓: real stack order, newest undo snapshot order, undo reverts
  const base = ["rect", "circle", "itext"];
  const moves = [
    ["↑ 上移 circle", "上移", "我的圓", ["rect", "itext", "circle"]],
    ["↓ 下移 circle", "下移", "我的圓", ["circle", "rect", "itext"]],
    ["⤒ 移至最前 rect", "移至最前", "矩形", ["circle", "itext", "rect"]],
    ["⤓ 移至最後 text", "移至最後", "你的文字", ["itext", "rect", "circle"]],
  ];
  for (const [label, title, row, want] of moves) {
    await btn(rowBy(row), title).click(); await page.waitForTimeout(250);
    eq(t(`1 ${label} → stack`), types(await state()), want);
    eq(t(`6 ${label} recorded in newest undo snapshot`), types(await topSnap()), want);
    eq(t(`1 ${label} → list order = reversed stack`), (await rows.allKinds()), [...want].reverse());
    await undo(); eq(t(`6 undo ${label}`), types(await state()), base);
  }
  // no-op move (top layer ↑) must not add a snapshot
  const depth0 = await env.depth();
  await btn(rowBy("你的文字"), "上移").click(); await page.waitForTimeout(250);
  eq(t("6 no-op ↑ on top layer adds no undo step"), await env.depth(), depth0);

  // 1) ⧉ duplicate: clone keeps type + name, becomes selected, undo removes it
  await btn(rowBy("我的圓"), "複製").click(); await page.waitForTimeout(400);
  s = await state(); eq(t("1 duplicate → 4 objects"), s.length, 4);
  eq(t("1 duplicate keeps type + name"), s.filter((o) => o.kind === "circle").map((o) => o.name), ["我的圓", "我的圓"]);
  eq(t("6 duplicate recorded in newest undo snapshot"), (await topSnap()).length, 4);
  await undo(); eq(t("6 undo duplicate → 3 objects"), (await state()).length, 3);

  // 1) 🗑 delete (text)
  await btn(rowBy("你的文字"), "刪除").click(); await page.waitForTimeout(300);
  eq(t("1 delete → text gone"), types(await state()), ["rect", "circle"]);
  eq(t("6 delete recorded in newest undo snapshot"), (await topSnap()).length, 2);
  await undo(); eq(t("6 undo delete → 3 objects"), types(await state()), base);

  // 4) 群組 / 解散 in the layers panel: enabled only for the right selection
  eq(t("4 nothing selected → 群組 disabled"), await env.groupBtn("群組").isDisabled(), true);
  eq(t("4 nothing selected → 解散 disabled"), await env.groupBtn("解散").isDisabled(), true);
  await env.multiSelect(["rect", "circle"]); await page.waitForTimeout(250);
  eq(t("3 multi-select highlights every selected row"), await rows.sel(), ["0", "1", "1"]);
  eq(t("4 multi → 群組 enabled"), await env.groupBtn("群組").isDisabled(), false);
  eq(t("4 multi → 解散 disabled"), await env.groupBtn("解散").isDisabled(), true);
  if (env.extraGroupBtn) eq(t("4 other group entry point still there"), await env.extraGroupBtn(), true);
  await env.groupBtn("群組").click(); await page.waitForTimeout(400);
  s = await state(); eq(t("4 群組 → one group + text"), types(s).sort(), ["group", "itext"]);
  eq(t("2 group label 群組(N)"), (await rows.allLabels()).filter((l) => l.includes("群組")), ["🗂 群組(2)"]);
  eq(t("4 group selected → 解散 enabled"), await env.groupBtn("解散").isDisabled(), false);
  eq(t("4 group selected → 群組 disabled"), await env.groupBtn("群組").isDisabled(), true);
  await env.groupBtn("解散").click(); await page.waitForTimeout(400);
  eq(t("4 解散 → 3 plain objects"), types(await state()).sort(), ["circle", "itext", "rect"]);
  eq(t("6 ungroup recorded in newest undo snapshot"), (await topSnap()).map((o) => o.kind).sort(), ["circle", "itext", "rect"]);
  await undo(); eq(t("6 undo ungroup → group again"), types(await state()).sort(), ["group", "itext"]);
  await undo(); eq(t("6 undo group → 3 plain objects"), types(await state()).sort(), ["circle", "itext", "rect"]);

  // 3) selecting ON THE CANVAS (real mouse) highlights + scrolls the row
  await env.discard(); await page.waitForTimeout(150);
  eq(t("3 nothing selected → no row highlighted"), await rows.sel(), ["0", "0", "0"]);
  const pts = await env.centers();
  await page.mouse.click(pts.rect.x, pts.rect.y); await page.waitForTimeout(250);
  eq(t("3 click rect on canvas → rect row highlighted"), [await selected(), await rows.sel()], [["rect"], ["0", "0", "1"]]);
  await page.mouse.click(pts.circle.x, pts.circle.y); await page.waitForTimeout(250);
  eq(t("3 click circle on canvas → circle row highlighted"), [await selected(), await rows.sel()], [["circle"], ["0", "1", "0"]]);
  await page.mouse.click(pts.empty.x, pts.empty.y); await page.waitForTimeout(250);
  eq(t("3 click empty → highlight cleared"), await rows.sel(), ["0", "0", "0"]);
  // scroll: shrink the list box so only ~2 rows fit, select the bottom layer on the canvas, the row must be inside the box
  await env.shrinkList();
  await page.mouse.click(pts.rect.x, pts.rect.y); await page.waitForTimeout(300);
  check(t("3 selecting a row below the fold on the canvas scrolls it into view"), await env.rowVisible("矩形"), "row not visible in list box");

  // leave a multi-selection up for the screenshot
  await env.multiSelect(["rect", "circle"]); await page.waitForTimeout(250);
  await env.shot();
}

// ───────────────────────── Canvas Editor ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1700 } });
  const page = await ctx.newPage();
  watch(page, "canvas");
  await page.goto(`${BASE}/tools/canvas`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!document.querySelector('button[title="加文字"]') && !document.querySelector('button[title="加文字"]').disabled, null, { timeout: 90000 });
  await page.waitForFunction(() => !!window.__cvTest, null, { timeout: 30000 });
  // shapes live in 形狀 / 畫筆 / 設計檔 (collapsed by default)
  await page.locator("button", { hasText: "形狀 / 畫筆 / 設計檔" }).first().click();
  await page.locator('button[title="加方框"]').click(); await page.waitForTimeout(400);
  await page.locator('button[title="加圓形"]').click(); await page.waitForTimeout(400);
  await page.locator('button[title="加文字"]').first().click(); await page.waitForTimeout(400);
  // spread them apart; object:modified records the positions into the undo baseline
  await page.evaluate(() => {
    const { canvas } = window.__cvTest; const [rect, circle, text] = canvas.getObjects();
    rect.set({ left: 150, top: 150 }); circle.set({ left: 600, top: 600 }); text.set({ left: 400, top: 400 });
    [rect, circle, text].forEach((o) => { o.setCoords(); canvas.fire("object:modified", { target: o }); });
    canvas.discardActiveObject(); canvas.requestRenderAll();
  });
  await page.waitForTimeout(300);
  await page.locator("button", { hasText: "圖層（" }).first().click();
  await page.waitForSelector('[data-layer-row="1"]');

  const rowsLoc = page.locator('[data-layer-row="1"]');
  const env = {
    state: () => page.evaluate(() => {
      const k = (o) => String(o.type).toLowerCase().replace(/-/g, "");
      return window.__cvTest.canvas.getObjects().map((o) => ({ kind: k(o), name: o.name, visible: o.visible !== false, lockMovementX: !!o.lockMovementX, lockMovementY: !!o.lockMovementY,
        lockScalingX: !!o.lockScalingX, lockScalingY: !!o.lockScalingY, lockRotation: !!o.lockRotation, hasControls: o.hasControls, selectable: o.selectable }));
    }),
    topSnap: () => page.evaluate(() => {
      const k = (o) => String(o.type).toLowerCase().replace(/-/g, "");
      const st = window.__cvTest.undoStack; const snap = JSON.parse(st[st.length - 1]);
      return snap.json.objects.map((o) => ({ kind: k(o), name: o.name, visible: o.visible !== false, lockMovementX: !!o.lockMovementX, lockScalingX: !!o.lockScalingX, lockRotation: !!o.lockRotation }));
    }),
    depth: () => page.evaluate(() => window.__cvTest.undoStack.length),
    undo: async () => { await page.locator('button[title="復原 (Ctrl+Z)"]').click(); await page.waitForTimeout(500); },
    selected: () => page.evaluate(() => window.__cvTest.canvas.getActiveObjects().map((o) => String(o.type).toLowerCase().replace(/-/g, ""))),
    discard: () => page.evaluate(() => { window.__cvTest.canvas.discardActiveObject(); window.__cvTest.canvas.requestRenderAll(); }),
    multiSelect: (kinds) => page.evaluate((ks) => {
      const { canvas, fabric } = window.__cvTest; const k = (o) => String(o.type).toLowerCase().replace(/-/g, "");
      const objs = canvas.getObjects().filter((o) => ks.includes(k(o)));
      canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas })); canvas.requestRenderAll();
    }, kinds),
    groupBtn: (name) => page.locator(`button[title="${name === "群組" ? "群組選取的多個物件" : "解散選取的群組"}"]`),
    extraGroupBtn: async () => (await page.locator('button[title="把選取的多個物件組成群組"]').count()) === 1,
    centers: () => page.evaluate(() => {
      const { canvas } = window.__cvTest; const k = (o) => String(o.type).toLowerCase().replace(/-/g, "");
      const b = canvas.upperCanvasEl.getBoundingClientRect(); const z = canvas.getZoom(); const out = {};
      canvas.getObjects().forEach((o) => { const c = o.getCenterPoint(); out[k(o)] = { x: b.left + c.x * z, y: b.top + c.y * z }; });
      out.empty = { x: b.left + 8, y: b.top + 8 };
      return out;
    }),
    shrinkList: () => page.locator('[data-layer-row="1"]').first().locator("..").evaluate((el) => { el.style.maxHeight = "70px"; }),
    rowVisible: (label) => page.locator('[data-layer-row="1"]', { hasText: label }).first().evaluate((row) => {
      const box = row.parentElement; const rb = row.getBoundingClientRect(); const bb = box.getBoundingClientRect();
      return rb.top >= bb.top - 1 && rb.bottom <= bb.bottom + 1;
    }),
    shot: async () => { await page.locator('[data-layer-row="1"]').first().locator("..").evaluate((el) => { el.style.maxHeight = "520px"; });
      const list = page.locator('[data-layer-row="1"]').first().locator("..");
      await list.scrollIntoViewIfNeeded();
      await list.locator("..").screenshot({ path: join(OUT, "card-02-canvas.png") }); },
  };
  const rowBy = (label) => rowsLoc.filter({ hasText: label }).first();
  const rows = {
    count: (sel) => (sel ? rowsLoc.locator(sel).count() : rowsLoc.count()),
    allLabels: async () => (await rowsLoc.locator('button[title="點選圖層（雙擊改名）"]').allTextContents()).map((s) => s.trim()),
    sel: async () => rowsLoc.evaluateAll((els) => els.map((e) => e.getAttribute("data-sel"))),
  };
  rows.allKinds = async () => (await rows.allLabels()).map((l) => (l.includes("矩形") ? "rect" : l.includes("圓") ? "circle" : l.includes("📝") ? "itext" : l.includes("群組") ? "group" : "?"));
  await suite("canvas", page, {
    ...env, rows, rowBy,
    btn: (row, title) => row.locator(`button[title="${title}"]`),
    nameEl: (row) => row.locator('button[title="點選圖層（雙擊改名）"]'),
  });
  await ctx.close();
}

// ───────────────────────── Vector Editor ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1300 } });
  const page = await ctx.newPage();
  watch(page, "vector");
  await page.goto(`${BASE}/tools/vector-editor`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("iframe")].some((f) => f.src.includes("vector-editor.html")), null, { timeout: 90000 });
  const frame = page.frames().find((f) => f.url().includes("vector-editor.html"));
  await frame.waitForFunction(() => typeof canvas !== "undefined" && document.getElementById("lyr-group"));
  await frame.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; })); // panels ship collapsed
  await frame.locator('[data-shape="rect"]').click();
  await frame.locator('[data-shape="circle"]').click();
  await frame.locator("#addText").click();
  await frame.evaluate(() => {
    const [rect, circle, text] = canvas.getObjects();
    rect.set({ left: 100, top: 100 }); circle.set({ left: 600, top: 300 }); text.set({ left: 700, top: 450 });
    [rect, circle, text].forEach((o) => { o.setCoords(); canvas.fire("object:modified", { target: o }); });
    canvas.discardActiveObject(); canvas.requestRenderAll();
  });
  await page.waitForTimeout(300);

  const env = {
    state: () => frame.evaluate(() => canvas.getObjects().map((o) => ({ kind: String(o.type).toLowerCase().replace(/-/g, ""), name: o.name, visible: o.visible !== false, lockMovementX: !!o.lockMovementX, lockMovementY: !!o.lockMovementY,
      lockScalingX: !!o.lockScalingX, lockScalingY: !!o.lockScalingY, lockRotation: !!o.lockRotation, hasControls: o.hasControls, selectable: o.selectable }))),
    topSnap: () => frame.evaluate(() => JSON.parse(history[hi]).objects.map((o) => ({ kind: String(o.type).toLowerCase().replace(/-/g, ""), name: o.name, visible: o.visible !== false, lockMovementX: !!o.lockMovementX, lockScalingX: !!o.lockScalingX, lockRotation: !!o.lockRotation }))),
    depth: () => frame.evaluate(() => history.length),
    undo: async () => { await frame.locator("#btn-undo").click(); await page.waitForTimeout(400); },
    selected: () => frame.evaluate(() => canvas.getActiveObjects().map((o) => String(o.type).toLowerCase().replace(/-/g, ""))),
    discard: () => frame.evaluate(() => { canvas.discardActiveObject(); canvas.requestRenderAll(); }),
    multiSelect: (kinds) => frame.evaluate((ks) => {
      const objs = canvas.getObjects().filter((o) => ks.includes(String(o.type).toLowerCase().replace(/-/g, "")));
      canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas })); canvas.requestRenderAll();
    }, kinds),
    groupBtn: (name) => frame.locator(name === "群組" ? "#lyr-group" : "#lyr-ungroup"),
    extraGroupBtn: async () => (await frame.locator("#btn-group").count()) === 1 && (await frame.locator("#btn-ungroup").count()) === 1,
    centers: async () => {
      const b = await frame.locator("canvas.upper-canvas").boundingBox();
      const p = await frame.evaluate(() => { const z = canvas.getZoom(); const out = {}; canvas.getObjects().forEach((o) => { const c = o.getCenterPoint(); out[String(o.type).toLowerCase().replace(/-/g, "")] = { x: c.x * z, y: c.y * z }; }); return out; });
      const out = {}; for (const [k, v] of Object.entries(p)) out[k] = { x: b.x + v.x, y: b.y + v.y };
      out.empty = { x: b.x + 6, y: b.y + 6 };
      return out;
    },
    shrinkList: () => frame.locator("#layers").evaluate((el) => { el.style.maxHeight = "70px"; }),
    rowVisible: (label) => frame.locator(".lyr", { hasText: label }).first().evaluate((row) => {
      const box = row.parentElement; const rb = row.getBoundingClientRect(); const bb = box.getBoundingClientRect();
      return rb.top >= bb.top - 1 && rb.bottom <= bb.bottom + 1;
    }),
    shot: async () => { await frame.locator("#layers").evaluate((el) => { el.style.maxHeight = "200px"; });
      await frame.locator("#layers").locator("xpath=..").screenshot({ path: join(OUT, "card-02-vector.png") }); },
  };
  const rowsLoc = frame.locator(".lyr");
  const rowBy = (label) => rowsLoc.filter({ hasText: label }).first();
  const rows = {
    count: (sel) => (sel ? rowsLoc.locator(sel).count() : rowsLoc.count()),
    allLabels: async () => (await rowsLoc.locator(".nm").allTextContents()).map((s) => s.trim()),
    sel: () => rowsLoc.evaluateAll((els) => els.map((e) => (e.classList.contains("sel") ? "1" : "0"))),
  };
  rows.allKinds = async () => (await rows.allLabels()).map((l) => (l.includes("矩形") ? "rect" : l.includes("圓") ? "circle" : l.includes("📝") ? "itext" : l.includes("群組") ? "group" : "?"));
  await suite("vector", page, {
    ...env, rows, rowBy,
    btn: (row, title) => row.locator(`button[title="${title}"]`),
    nameEl: (row) => row.locator(".nm"),
  });
  await ctx.close();
}

await browser.close();
// dev server has no Supabase: its server-component theme fetch logs "supabase_unavailable" into the browser console
// (and the matching 503 resource line); neither comes from the editors.
const envNoise = (e) => /Failed to load resource|supabase_unavailable/.test(e);
const consoleErrs = errors.filter((e) => !envNoise(e));
const resourceErrs = errors.filter(envNoise);
check("no console/page errors on either page", consoleErrs.length === 0, consoleErrs.join(" | "));
if (resourceErrs.length) console.log(`NOTE ${resourceErrs.length} failed resource loads (dev-server no-Supabase noise, excluded): ${resourceErrs.map((e) => e.slice(0, 90)).join(" | ")}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
