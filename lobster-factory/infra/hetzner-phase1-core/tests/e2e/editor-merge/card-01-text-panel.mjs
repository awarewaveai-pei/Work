// CARD-01 text-panel union: drives /tools/canvas and /tools/vector-editor and reads the text object's real props after
// every control (canvas: exported .design.json; vector: the live fabric `canvas` global).
// Run (dev server first): node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904
//   cd lobster-factory/infra/hetzner-phase1-core/tests && node e2e/editor-merge/card-01-text-panel.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3904";
const OUT = process.argv[3] ?? "../../../../agency-os/reports/e2e/2026-11-04/editor-merge";
mkdirSync(OUT, { recursive: true });
const FONT_FILE = "C:/Windows/Fonts/arial.ttf";

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + detail}`); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
const near = (name, got, want) => check(name, Math.abs(got - want) < 0.001, `got=${got} want=${want}`);

const browser = await chromium.launch();
const errors = [];
function watch(page, tag) {
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
}

// native-setter + input/change events: works for range/number/color on React and plain pages
async function setVal(loc, v) {
  await loc.evaluate((el, val) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, String(val));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, v);
}

// ───────────────────────── Canvas Editor ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1700 }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, "canvas");
  await page.goto(`${BASE}/tools/canvas`, { waitUntil: "domcontentloaded" });
  const addBtn = page.getByRole("button", { name: "加文字", exact: true });
  await page.locator("button", { hasText: "🔤 文字" }).first().click();
  await addBtn.waitFor();
  await page.waitForFunction(() => !document.querySelector('button[title="加文字"]')?.disabled, null, { timeout: 60000 });

  const ctl = {
    input: page.locator('input[title="新文字內容"]'),
    color: page.locator('input[title="文字顏色"]'),
    sizeR: page.locator('input[title="字級滑桿"]'),
    sizeN: page.locator('input[title="字級 px"]'),
    B: page.locator('button[title="粗體（切換）"]'),
    I: page.locator('button[title="斜體（切換）"]'),
    U: page.locator('button[title="底線（切換）"]'),
    arc: page.locator('button[title="弧形文字 開／關"]'),
    spacing: page.locator('input[title="字距"]'),
    lineH: page.locator('input[title="行距"]'),
    search: page.getByPlaceholder("搜尋字型…"),
  };
  const align = (k) => page.locator(`button[title="對齊：${k}"]`);
  const row = (title) => page.locator(`button[title="${title}"]`).first();

  async function exportTexts() {
    // 🧰 形狀 / 畫筆 / 設計檔 → 💾 匯出 downloads the full canvas JSON
    const more = page.locator("button", { hasText: "形狀 / 畫筆 / 設計檔" }).first();
    if (!(await page.locator('button[title="匯出可再編輯的設計檔（.design.json）"]').isVisible())) await more.click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator('button[title="匯出可再編輯的設計檔（.design.json）"]').click()]);
    const json = JSON.parse(readFileSync(await dl.path(), "utf8"));
    // awarewave-design/1 (CARD-03) wraps the fabric JSON in { format, json, meta }; older files are the bare fabric JSON
    const fab = json.format ? json.json : json;
    return fab.objects.filter((o) => /text/i.test(o.type));
  }

  // 1) nothing selected → controls set the DEFAULT of the next text
  await ctl.input.fill("測試AB");
  await setVal(ctl.color, "#ff0000");
  await setVal(ctl.sizeN, 72);
  await ctl.B.click(); await ctl.I.click(); await ctl.U.click();
  await align("置中").click();
  await setVal(ctl.spacing, 120);
  await setVal(ctl.lineH, 1.5);
  await row("明體（中）").click(); // preset row at the top of the list
  await ctl.arc.click();
  await addBtn.click();
  await page.waitForTimeout(400);
  let t = await exportTexts();
  eq("canvas 1 加文字: text", t[0]?.text, "測試AB");
  eq("canvas 1 字型 preset at top → new text", t[0]?.fontFamily, '"Noto Serif TC","Source Han Serif TC","PMingLiU",serif');
  eq("canvas 3 顏色 default → new text", t[0]?.fill, "#ff0000");
  eq("canvas 4 字級 number → new text", t[0]?.fontSize, 72);
  eq("canvas 5 B", t[0]?.fontWeight, "bold");
  eq("canvas 5 I", t[0]?.fontStyle, "italic");
  eq("canvas 5 U", t[0]?.underline, true);
  eq("canvas 5 對齊 置中", t[0]?.textAlign, "center");
  eq("canvas 5 字距", t[0]?.charSpacing, 120);
  near("canvas 5 行距", t[0]?.lineHeight, 1.5);
  check("canvas 5 弧形 on → path set", !!t[0]?.path, JSON.stringify(t[0]?.path));

  // 2) text selected (the new text is active) → every control edits THAT object
  await setVal(ctl.sizeR, 100);
  await ctl.B.click(); await ctl.I.click(); await ctl.U.click();
  await align("靠右").click();
  await setVal(ctl.spacing, -50);
  await setVal(ctl.lineH, 2.2);
  await setVal(ctl.color, "#00aa00");
  await ctl.arc.click();
  await ctl.search.fill("Noto Sans TC");
  await row("Noto Sans TC").click();
  await page.waitForTimeout(400);
  t = await exportTexts();
  eq("canvas 4 字級 range → selected", t[0]?.fontSize, 100);
  eq("canvas 5 B off", t[0]?.fontWeight, "normal");
  eq("canvas 5 I off", t[0]?.fontStyle, "normal");
  eq("canvas 5 U off", t[0]?.underline, false);
  eq("canvas 5 對齊 靠右", t[0]?.textAlign, "right");
  eq("canvas 5 字距 −50", t[0]?.charSpacing, -50);
  near("canvas 5 行距 2.2", t[0]?.lineHeight, 2.2);
  eq("canvas 3 顏色 → selected", t[0]?.fill, "#00aa00");
  check("canvas 5 弧形 off → no path", !t[0]?.path, JSON.stringify(t[0]?.path));
  eq("canvas 2 Google font row → selected", t[0]?.fontFamily, "Noto Sans TC");

  // 3) selection sync: add a second, different text, then re-select the first through the layer list
  await ctl.search.fill("");
  const cb = await page.locator("canvas.upper-canvas").boundingBox();
  await page.mouse.click(cb.x + 6, cb.y + 6); // empty artboard corner → deselect, so 30 becomes the default, not an edit of text 1
  await page.waitForTimeout(200);
  await setVal(ctl.sizeN, 30);
  await addBtn.click();
  await page.waitForTimeout(300);
  await page.locator("button", { hasText: "圖層（" }).first().click();
  const layerBtns = page.locator('button[title="點選圖層（雙擊改名）"]');
  await layerBtns.nth(1).click(); // top layer = 2nd text, so index 1 = first text (測試AB)
  await page.waitForTimeout(300);
  eq("canvas 7 sync 字級 number", await ctl.sizeN.inputValue(), "100");
  eq("canvas 7 sync 顏色", await ctl.color.inputValue(), "#00aa00");
  eq("canvas 7 sync 字距", await ctl.spacing.inputValue(), "-50");
  eq("canvas 7 sync 行距", await ctl.lineH.inputValue(), "2.2");
  check("canvas 7 sync 靠右 highlighted", (await align("靠右").getAttribute("style"))?.includes("outline"), "no outline");
  check("canvas 7 sync B/I/U off", !(await ctl.B.getAttribute("style"))?.includes("outline") && !(await ctl.U.getAttribute("style"))?.includes("outline"), "outline present");

  // 4) upload font file → listed as 自有 and applied
  await page.locator('input[type=file][accept=".ttf,.otf,.woff,.woff2"]').setInputFiles(FONT_FILE);
  await page.waitForTimeout(600);
  check("canvas 2 upload → （自有）row", (await page.getByText("arial（自有）").count()) > 0, "no row");
  t = await exportTexts();
  check("canvas 2 upload → applied to selected", t.some((o) => o.fontFamily === "arial"), JSON.stringify(t.map((o) => o.fontFamily)));
  await page.screenshot({ path: join(OUT, "card-01-canvas.png"), clip: { x: 1080, y: 0, width: 320, height: 1700 } });
  await ctx.close();
}

// ───────────────────────── Vector Editor ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  watch(page, "vector");
  await page.goto(`${BASE}/tools/vector-editor`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("iframe")].some((f) => f.src.includes("vector-editor.html")), null, { timeout: 60000 });
  const frame = page.frames().find((f) => f.url().includes("vector-editor.html"));
  await frame.waitForFunction(() => typeof canvas !== "undefined" && document.getElementById("btnArc"));
  await frame.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; })); // panels ship collapsed
  const $ = (id) => frame.locator("#" + id);
  const text = () => frame.evaluate(() => canvas.getObjects().filter((o) => /text/i.test(o.type)).map((o) => ({
    text: o.text, fontFamily: o.fontFamily, fontSize: o.fontSize, fill: o.fill, fontWeight: o.fontWeight, fontStyle: o.fontStyle,
    underline: o.underline, textAlign: o.textAlign, charSpacing: o.charSpacing, lineHeight: o.lineHeight, hasPath: !!o.path })));
  const align = (k) => frame.locator(`[data-talign="${k}"]`);
  const fontRow = (name) => frame.locator(`#fontList .fontrow:has(.fname:text-is("${name}"))`).first();

  // 1) nothing selected → defaults
  await $("txtInput").fill("測試AB");
  await setVal($("txtFill"), "#ff0000");
  await setVal($("fontSize"), 72);
  check("vector 4 number → range follows", (await $("fontSizeR").inputValue()) === "72", await $("fontSizeR").inputValue());
  await $("btnBold").click(); await $("btnItalic").click(); await $("btnUnderline").click();
  await align("center").click();
  await setVal($("letterSp"), 120);
  await setVal($("lineH"), 1.5);
  await fontRow("明體（中）").click(); // preset row at the top of the list
  await $("btnArc").click();
  await $("addText").click();
  await page.waitForTimeout(300);
  let t = await text();
  eq("vector 1 加文字: text", t[0]?.text, "測試AB");
  eq("vector 2 字型 preset at top → new text", t[0]?.fontFamily, '"Noto Serif TC","Source Han Serif TC","PMingLiU",serif');
  eq("vector 3 顏色 default → new text", t[0]?.fill, "#ff0000");
  eq("vector 4 字級 → new text", t[0]?.fontSize, 72);
  eq("vector 5 B", t[0]?.fontWeight, "bold");
  eq("vector 5 I", t[0]?.fontStyle, "italic");
  eq("vector 5 U", t[0]?.underline, true);
  eq("vector 5 對齊 置中", t[0]?.textAlign, "center");
  eq("vector 5 字距", t[0]?.charSpacing, 120);
  near("vector 5 行距", t[0]?.lineHeight, 1.5);
  eq("vector 5 弧形 on → path", t[0]?.hasPath, true);

  // 2) text selected → every control edits that object
  await setVal($("fontSizeR"), 100);
  await $("btnBold").click(); await $("btnItalic").click(); await $("btnUnderline").click();
  await align("right").click();
  await setVal($("letterSp"), -50);
  await setVal($("lineH"), 2.2);
  await setVal($("txtFill"), "#00aa00");
  await $("btnArc").click();
  await $("fontSearch").fill("Noto Sans TC");
  await $("fontSearch").dispatchEvent("input");
  await fontRow("Noto Sans TC").click();
  await page.waitForTimeout(300);
  t = await text();
  eq("vector 4 字級 range → selected", t[0]?.fontSize, 100);
  eq("vector 5 B off", t[0]?.fontWeight, "normal");
  eq("vector 5 I off", t[0]?.fontStyle, "normal");
  eq("vector 5 U off", t[0]?.underline, false);
  eq("vector 5 對齊 靠右", t[0]?.textAlign, "right");
  eq("vector 5 字距 −50", t[0]?.charSpacing, -50);
  near("vector 5 行距 2.2", t[0]?.lineHeight, 2.2);
  eq("vector 3 顏色 → selected", t[0]?.fill, "#00aa00");
  eq("vector 5 弧形 off → no path", t[0]?.hasPath, false);
  eq("vector 2 Google font row → selected", t[0]?.fontFamily, "Noto Sans TC");
  // 顏色 is text-only: a rect selected keeps its fill when the text colour changes
  await frame.evaluate(() => { const r = new fabric.Rect({ width: 50, height: 50, fill: "#123456", left: 5, top: 5 }); canvas.add(r); canvas.setActiveObject(r); });
  await setVal($("txtFill"), "#abcdef");
  check("vector 3 顏色 leaves non-text fill alone", (await frame.evaluate(() => canvas.getActiveObject().fill)) === "#123456", "rect fill changed");

  // 3) selection sync
  await frame.evaluate(() => canvas.discardActiveObject());
  await setVal($("fontSize"), 30);
  await $("addText").click();
  await page.waitForTimeout(200);
  await frame.evaluate(() => { const first = canvas.getObjects().find((o) => o.type === "i-text"); canvas.setActiveObject(first); });
  await page.waitForTimeout(200);
  eq("vector 7 sync 字級 number", await $("fontSize").inputValue(), "100");
  eq("vector 7 sync 字級 range", await $("fontSizeR").inputValue(), "100");
  eq("vector 7 sync 顏色", await $("txtFill").inputValue(), "#00aa00");
  eq("vector 7 sync 字距", await $("letterSp").inputValue(), "-50");
  eq("vector 7 sync 行距", await $("lineH").inputValue(), "2.2");
  check("vector 7 sync 靠右 on", await align("right").evaluate((b) => b.classList.contains("on")), "not on");
  check("vector 7 sync B/I/U off", !(await $("btnBold").evaluate((b) => b.classList.contains("on"))) && !(await $("btnUnderline").evaluate((b) => b.classList.contains("on"))), "on");
  eq("vector 7 mode label", await $("txtMode").textContent(), "套用到選取文字");

  // 4) upload font
  await $("fontSearch").fill("");
  await $("fontSearch").dispatchEvent("input");
  await $("fontUpload").setInputFiles(FONT_FILE);
  await page.waitForTimeout(600);
  check("vector 2 upload → （自有）row", (await frame.locator('#fontList .fname:text-is("arial（自有）")').count()) > 0, "no row");
  check("vector 2 upload → applied to selected", (await text()).some((o) => o.fontFamily === "arial"), JSON.stringify((await text()).map((o) => o.fontFamily)));
  // vector 6: the 6th card item is covered by sections 1 (defaults) and 2 (selected) above
  await frame.locator("#textPanel").screenshot({ path: join(OUT, "card-01-vector.png") });
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
