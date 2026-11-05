// CARD-01 text-panel union: drives /tools/canvas and reads the text object's real props after
// every control (exported .design.json).
// Run (dev server first): node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904
//   cd lobster-factory/infra/hetzner-phase1-core/tests && node e2e/editor-merge/card-01-text-panel.mjs [baseUrl] [outDir]
// The old Vector Editor (public/vector-editor.html) retired 2026-11-05 (R0-PLAN C7.3): /tools/vector-editor redirects to
// /tools/vector-pro, so only the Canvas Editor half of this card runs.
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

await browser.close();
// dev server has no Supabase: its server-component theme fetch logs "supabase_unavailable" into the browser console
// (and the matching 503 resource line); neither comes from the editors.
const envNoise = (e) => /Failed to load resource|supabase_unavailable/.test(e);
const consoleErrs = errors.filter((e) => !envNoise(e));
const resourceErrs = errors.filter(envNoise);
check("no console/page errors on the page", consoleErrs.length === 0, consoleErrs.join(" | "));
if (resourceErrs.length) console.log(`NOTE ${resourceErrs.length} failed resource loads (dev-server no-Supabase noise, excluded): ${resourceErrs.map((e) => e.slice(0, 90)).join(" | ")}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
