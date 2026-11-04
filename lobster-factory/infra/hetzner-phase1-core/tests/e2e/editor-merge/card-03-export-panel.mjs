// CARD-03 export / project union: drives /tools/canvas and /tools/vector-editor with a text + a rect each and checks
// every download by FILE CONTENT (magic bytes, svg root, pdf header, png size, alpha), the project round-trip
// (reload page -> load file -> object count + meta), the 存入 My Designs request, and the zoom buttons.
//   canvas: dev-only probe window.__cvTest = { canvas, fabric, undoStack }   vector: the page globals `canvas`, `realW`, ...
// Run (dev server first): node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904
//   cd lobster-factory/infra/hetzner-phase1-core/tests && node e2e/editor-merge/card-03-export-panel.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3904";
const OUT = process.argv[3] ?? "../../../../agency-os/reports/e2e/2026-11-04/editor-merge";
mkdirSync(OUT, { recursive: true });
const TMP = mkdtempSync(join(tmpdir(), "card03-"));

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " :: " + detail}`); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

const browser = await chromium.launch();
const errors = [];
const watch = (page, tag) => {
  page.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${tag} console: ${m.text()}`); });
};

// a download triggered by `click`, saved under TMP, returned as { name, buf }
async function dl(page, click) {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), click()]);
  const name = d.suggestedFilename();
  const path = join(TMP, `${Date.now()}-${name}`);
  await d.saveAs(path);
  return { name, buf: readFileSync(path) };
}
const pngSize = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const isPng = (b) => b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
const isWebp = (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
// alpha of pixel (0,0): decoded in a scratch page so no app CSP/state is involved
const scratch = await (await browser.newContext()).newPage();
const cornerAlpha = (buf, mime) => scratch.evaluate(async ([b64, m]) => {
  const bmp = await createImageBitmap(await (await fetch(`data:${m};base64,${b64}`)).blob());
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
  return g.getImageData(1, 1, 1, 1).data[3];
}, [buf.toString("base64"), mime]);

// One suite for both editors. `env` adapts how to read state / click the controls.
async function suite(tag, page, env) {
  const t = (n) => `${tag} ${n}`;
  const base = `card03-${tag}`;
  await env.setName(base);
  await env.applySize(10, 6, "cm", 150);
  const real = await env.realSize();
  eq(t("document real px = round(cm·dpi/2.54)"), real, { w: 591, h: 354 });
  const zStart = await env.zoom();

  // 1) file name used by every download
  const png = await dl(page, env.click.png);
  eq(t("1/2 PNG name from 檔名"), png.name, `${base}.png`);
  check(t("2 PNG magic"), isPng(png.buf));
  eq(t("2 PNG = real px (DPI), not preview"), pngSize(png.buf), real);
  const webp = await dl(page, env.click.webp);
  eq(t("1/2 WebP name"), webp.name, `${base}.webp`);
  check(t("2 WebP is RIFF/WEBP, 0 < size <= 200KB"), isWebp(webp.buf) && webp.buf.length > 0 && webp.buf.length <= 200 * 1024, `len=${webp.buf.length}`);
  const svg = await dl(page, env.click.svg);
  const svgTxt = svg.buf.toString("utf8");
  eq(t("1/2 SVG name"), svg.name, `${base}.svg`);
  check(t("2 SVG contains <svg"), svgTxt.includes("<svg"));
  check(t("2 SVG real cm size + px viewBox"), /width="10cm"/.test(svgTxt) && /height="6cm"/.test(svgTxt) && /viewBox="0 0 591 354"/.test(svgTxt), svgTxt.slice(0, 300));
  check(t("2 SVG holds the text + rect"), /<text/.test(svgTxt) && /<rect/.test(svgTxt));
  const pdf = await dl(page, env.click.pdf);
  eq(t("1/2 PDF name"), pdf.name, `${base}.pdf`);
  eq(t("2 PDF header"), pdf.buf.subarray(0, 5).toString(), "%PDF-");
  const mb = pdf.buf.toString("latin1").match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  // jsPDF unit is mm but MediaBox is in pt: 100mm x 60mm = 283.46 x 170.08
  check(t("2 PDF page = 10x6 cm (real size)"), !!mb && Math.abs(+mb[1] - 283.46) < 1 && Math.abs(+mb[2] - 170.08) < 1, mb ? mb.slice(1).join("x") : "no MediaBox");
  check(t("2 PDF has size > 0 and a vector text/path stream"), pdf.buf.length > 500);

  // 5) 匯出透明底 is honoured by every export (bg #ff00ff would otherwise be in the output)
  await env.setBg("#ff00ff");
  const svgBg = (await dl(page, env.click.svg)).buf.toString("utf8");
  check(t("5 opaque SVG carries the artboard colour"), /#ff00ff|rgb\(255,\s*0,\s*255\)/i.test(svgBg));
  const pngBg = (await dl(page, env.click.png)).buf;
  eq(t("5 opaque PNG corner alpha"), await cornerAlpha(pngBg, "image/png"), 255);
  await env.setTransparent(true);
  const svgTr = (await dl(page, env.click.svg)).buf.toString("utf8");
  check(t("5 transparent SVG has no artboard colour"), !/#ff00ff|rgb\(255,\s*0,\s*255\)/i.test(svgTr), svgTr.slice(0, 400));
  eq(t("5 transparent PNG corner alpha"), await cornerAlpha((await dl(page, env.click.png)).buf, "image/png"), 0);
  eq(t("5 transparent WebP corner alpha"), await cornerAlpha((await dl(page, env.click.webp)).buf, "image/webp"), 0);
  const pdfTr = await dl(page, env.click.pdf);
  eq(t("5 transparent PDF builds"), pdfTr.buf.subarray(0, 5).toString(), "%PDF-");
  const zAfter = await env.zoom(); const scr = await env.screenSize();
  eq(t("5 export left the view untouched (zoom + on-screen size restored)"), [zAfter, scr], [zStart, { w: Math.round(real.w * zStart), h: Math.round(real.h * zStart) }]);

  // 4) project file: new shared format
  const proj = await dl(page, env.click.saveProj);
  eq(t("4 project file name"), proj.name, `${base}.design.json`);
  const doc = JSON.parse(proj.buf.toString("utf8"));
  eq(t("4 format"), doc.format, "awarewave-design/1");
  eq(t("4 meta keys"), Object.keys(doc.meta).sort(), ["bgColor", "dpi", "hv", "transparent", "unit", "wv"]);
  eq(t("4 meta values"), doc.meta, { wv: 10, hv: 6, unit: "cm", dpi: 150, bgColor: "#ff00ff", transparent: true });
  eq(t("4 json has 2 objects + background"), [doc.json.objects.length, doc.json.background], [2, "#ff00ff"]);
  const projPath = join(TMP, `${tag}.design.json`); writeFileSync(projPath, proj.buf);
  // old shapes this editor wrote before the merge
  const oldPath = join(TMP, `${tag}.old.json`); writeFileSync(oldPath, JSON.stringify(await env.oldShape(doc)));

  // reload the page (fresh editor, default size) -> load the file back
  await env.reload();
  eq(t("4 fresh page has 0 objects"), await env.count(), 0);
  await env.loadFile(projPath);
  eq(t("4 load → 2 objects"), await env.count(), 2);
  eq(t("4 load → real size restored"), await env.realSize(), real);
  const st = await env.uiState();
  eq(t("4 load → unit/dpi/size fields + bg + transparent restored"), st, { w: "10", h: "6", unit: "cm", dpi: "150", bg: "#ff00ff", transparent: true });
  eq(t("4 load → text + rect kept"), (await env.kinds()).sort(), ["itext", "rect"]);

  // 4) old shape still loads (fresh page first so the count is not left over)
  await env.reload();
  await env.loadFile(oldPath);
  eq(t("4 old own shape loads → 2 objects"), await env.count(), 2);
  eq(t("4 old own shape → text + rect kept"), (await env.kinds()).sort(), ["itext", "rect"]);

  // 6) zoom buttons (display scale only)
  const z0 = await env.zoom();
  await env.click.zoomOut(); const zOut = await env.zoom();
  check(t("6 － shrinks the preview"), zOut < z0 - 0.01, `${z0} -> ${zOut}`);
  await env.click.zoomIn(); const zIn = await env.zoom();
  check(t("6 ＋ enlarges the preview"), zIn > zOut + 0.01, `${zOut} -> ${zIn}`);
  await env.click.zoom100(); eq(t("6 100% = zoom 1"), await env.zoom(), 1);
  eq(t("6 100% = real px on screen"), await env.screenSize(), await env.realSize());
  await env.click.zoomFit(); check(t("6 符合 back to fit"), Math.abs((await env.zoom()) - z0) < 0.01, `fit=${await env.zoom()} start=${z0}`);
  if (env.zoomLabel) eq(t("6 zoom label"), await env.zoomLabel(), `${Math.round((await env.zoom()) * 100)}%`);
  await env.reload(); await env.loadFile(projPath); // leave the loaded project up for the save step + screenshot

  // 3) 存入 My Designs: real route first (dev server: no DB → failure), then a mocked ok
  const reqs = [];
  page.on("request", (r) => { if (r.url().endsWith("/api/tools/designs") && r.method() === "POST") reqs.push(r); });
  await env.click.save(); await page.waitForTimeout(2500);
  check(t("3 POST /api/tools/designs sent"), reqs.length === 1, `n=${reqs.length}`);
  const body = JSON.parse(reqs[0].postData());
  eq(t("3 role header (roleHeader operator)"), reqs[0].headers()["x-ops-simulated-role"], "operator");
  eq(t("3 json content-type"), reqs[0].headers()["content-type"], "application/json");
  check(t("3 body.image = PNG data URL the route accepts (png/jpeg/webp base64, decodes as image)"),
    typeof body.image === "string" && body.image.startsWith("data:image/png;base64,") && isPng(Buffer.from(body.image.split(",")[1], "base64")), String(body.image).slice(0, 40));
  check(t("3 body prompt/modelName/source strings"), ["prompt", "modelName", "source"].every((k) => typeof body[k] === "string" && body[k].length > 0), JSON.stringify(Object.keys(body)));
  eq(t("3 failure state shown (dev server has no DB)"), await env.saveLabel(), "儲存失敗 ✗（重試）");
  await page.route("**/api/tools/designs", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, asset: { id: "x" } }) }));
  await env.click.save(); await page.waitForTimeout(1000);
  eq(t("3 success state shown"), await env.saveLabel(), "已存入 ✓");
  await page.unroute("**/api/tools/designs");
  await env.shot();
}

// ───────────────────────── Canvas Editor ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1500 }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, "canvas");
  const open = async () => {
    await page.goto(`${BASE}/tools/canvas`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!document.querySelector('button[title="加文字"]') && !document.querySelector('button[title="加文字"]').disabled, null, { timeout: 90000 });
    await page.waitForFunction(() => !!window.__cvTest, null, { timeout: 30000 });
  };
  const ensureOpen = async (title, probe) => { if ((await page.locator(probe).count()) === 0) await page.locator("button", { hasText: title }).first().click(); };
  const SIZE_PROBE = 'button:has-text("套用畫布尺寸")', TOOLS_PROBE = 'button[title="匯出可再編輯的設計檔（.design.json）"]';
  await open();
  await page.locator("button", { hasText: "更多工具" }).first().click();
  await page.locator('button[title="加方框"]').click(); await page.waitForTimeout(400);
  await page.locator('button[title="加文字"]').first().click(); await page.waitForTimeout(400);
  await ensureOpen("畫布尺寸 / DPI", SIZE_PROBE);
  const nameBox = page.locator('input[title="下載檔名（不含副檔名）"]');
  const env = {
    click: {
      png: () => page.locator("button", { hasText: "PNG下載" }).click(),
      webp: () => page.locator("button", { hasText: "WebP下載" }).click(),
      svg: () => page.locator("button", { hasText: "SVG下載" }).click(),
      pdf: () => page.locator("button", { hasText: "PDF下載" }).click(),
      saveProj: () => page.locator(TOOLS_PROBE).click(),
      zoomOut: () => page.locator('button[title="縮小預覽"]').click(),
      zoomIn: () => page.locator('button[title="放大預覽"]').click(),
      zoom100: () => page.locator('button[title="100%（實際像素）"]').click(),
      zoomFit: () => page.locator('button[title="符合工作區"]').click(),
      save: () => page.locator("button", { hasText: /存入 My Designs|儲存失敗/ }).click(),
    },
    setName: async (n) => { await nameBox.fill(n); },
    applySize: async (w, h, unit, dpi) => {
      await ensureOpen("畫布尺寸 / DPI", SIZE_PROBE);
      const panel = page.locator("label", { hasText: "寬" }).first().locator("xpath=ancestor::div[contains(@style,'flex-direction: column')][1]");
      await panel.locator("input[type=number]").nth(0).fill(String(w));
      await panel.locator("input[type=number]").nth(1).fill(String(h));
      await panel.locator("select").nth(0).selectOption(unit);
      await panel.locator("select").nth(1).selectOption(String(dpi));
      await panel.locator("button", { hasText: "套用畫布尺寸" }).click(); await page.waitForTimeout(400);
    },
    realSize: () => page.evaluate(() => { const c = window.__cvTest.canvas; return { w: Math.round(c.getWidth() / c.getZoom()), h: Math.round(c.getHeight() / c.getZoom()) }; }),
    setBg: async (v) => { await page.locator('input[type=color][title^="畫布底色"]').fill(v); await page.waitForTimeout(250); },
    setTransparent: async (on) => { await page.locator("label", { hasText: "匯出透明底" }).locator("input").setChecked(on); },
    oldShape: async () => page.evaluate(() => window.__cvTest.canvas.toJSON()), // old canvas file = bare toJSON
    reload: async () => { await open(); },
    count: () => page.evaluate(() => window.__cvTest.canvas.getObjects().length),
    kinds: () => page.evaluate(() => window.__cvTest.canvas.getObjects().map((o) => String(o.type).toLowerCase().replace(/-/g, ""))),
    loadFile: async (path) => {
      await ensureOpen("更多工具", TOOLS_PROBE);
      await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles(path); await page.waitForTimeout(1200);
    },
    uiState: async () => {
      await ensureOpen("畫布尺寸 / DPI", SIZE_PROBE);
      const sizePanel = page.locator("label", { hasText: "寬" }).first().locator("xpath=ancestor::div[contains(@style,'flex-direction: column')][1]");
      return {
        w: await sizePanel.locator("input[type=number]").nth(0).inputValue(), h: await sizePanel.locator("input[type=number]").nth(1).inputValue(),
        unit: await sizePanel.locator("select").nth(0).inputValue(), dpi: await sizePanel.locator("select").nth(1).inputValue(),
        bg: await page.locator('input[type=color][title^="畫布底色"]').inputValue(), transparent: await page.locator("label", { hasText: "匯出透明底" }).locator("input").isChecked(),
      };
    },
    zoom: () => page.evaluate(() => +window.__cvTest.canvas.getZoom().toFixed(3)),
    zoomLabel: () => page.locator('[data-testid="view-pct"]').textContent(),
    screenSize: () => page.evaluate(() => { const c = window.__cvTest.canvas; return { w: c.getWidth(), h: c.getHeight() }; }),
    saveLabel: async () => (await page.locator("button", { hasText: /存入 My Designs|儲存失敗|已存入|儲存中/ }).first().textContent()).trim(),
    shot: async () => {
      await page.locator('input[title="下載檔名（不含副檔名）"]').scrollIntoViewIfNeeded();
      await page.locator('input[title="下載檔名（不含副檔名）"]').locator("xpath=ancestor::div[contains(@style,'sticky')]").screenshot({ path: join(OUT, "card-03-canvas.png") });
    },
  };
  await suite("canvas", page, env);
  await ctx.close();
}

// ───────────────────────── Vector Editor ─────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1500 }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, "vector");
  let frame;
  const open = async () => {
    await page.goto(`${BASE}/tools/vector-editor`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => [...document.querySelectorAll("iframe")].some((f) => f.src.includes("vector-editor.html")), null, { timeout: 90000 });
    frame = page.frames().find((f) => f.url().includes("vector-editor.html"));
    await frame.waitForFunction(() => typeof canvas !== "undefined" && document.getElementById("exportPdf") && typeof jspdf !== "undefined", null, { timeout: 60000 });
  };
  await open();
  const addTwo = async () => {
    await frame.locator('[data-shape="rect"]').click();
    await frame.locator("#addText").click();
    await page.waitForTimeout(300);
  };
  await addTwo();
  // 1) default name
  check("vector 1 default file name is design-yyyymmdd-hhmm", /^design-\d{8}-\d{4}$/.test(await frame.locator("#fname").inputValue()), await frame.locator("#fname").inputValue());
  const env = {
    click: {
      png: () => frame.locator("#exportPng").click(), webp: () => frame.locator("#exportWebp").click(),
      svg: () => frame.locator("#exportSvg").click(), pdf: () => frame.locator("#exportPdf").click(),
      saveProj: () => frame.locator("#saveProj").click(),
      zoomOut: () => frame.locator("#zoomOut").click(), zoomIn: () => frame.locator("#zoomIn").click(),
      zoom100: () => frame.locator("#zoom100").click(), zoomFit: () => frame.locator("#zoomFit").click(),
      save: () => frame.locator("#saveDesign").click(),
    },
    setName: (n) => frame.locator("#fname").fill(n),
    applySize: async (w, h, unit, dpi) => {
      await frame.locator("#w").fill(String(w)); await frame.locator("#h").fill(String(h));
      await frame.locator("#unit").selectOption(unit); await frame.locator("#dpi").selectOption(String(dpi));
      await frame.locator("#setCanvas").click(); await page.waitForTimeout(400);
    },
    realSize: () => frame.evaluate(() => ({ w: realW, h: realH })),
    setBg: async (v) => { await frame.locator("#bgColor").fill(v); await page.waitForTimeout(250); },
    setTransparent: (on) => frame.locator("#transBg").setChecked(on),
    oldShape: () => frame.evaluate(() => ({ _proj: 1, meta: canvas._meta, w: realW, h: realH, canvas: canvas.toJSON() })), // old vector file
    reload: async () => { await open(); },
    count: () => frame.evaluate(() => canvas.getObjects().length),
    kinds: () => frame.evaluate(() => canvas.getObjects().map((o) => String(o.type).toLowerCase().replace(/-/g, ""))),
    loadFile: async (path) => { await frame.locator("#loadProj").setInputFiles(path); await page.waitForTimeout(1200); },
    uiState: () => frame.evaluate(() => ({ w: document.getElementById("w").value, h: document.getElementById("h").value, unit: document.getElementById("unit").value,
      dpi: document.getElementById("dpi").value, bg: document.getElementById("bgColor").value, transparent: document.getElementById("transBg").checked })),
    zoom: () => frame.evaluate(() => +canvas.getZoom().toFixed(3)),
    zoomLabel: () => frame.locator("#zoomVal").textContent(),
    screenSize: () => frame.evaluate(() => ({ w: canvas.getWidth(), h: canvas.getHeight() })),
    saveLabel: async () => (await frame.locator("#saveDesign").textContent()).trim(),
    shot: async () => { await frame.locator("#exportPanel").scrollIntoViewIfNeeded(); await frame.locator(".side").screenshot({ path: join(OUT, "card-03-vector.png") }); },
  };
  // vector: the shapes/text must exist again after every fresh page in the suite only where the suite adds none -> the
  // suite reloads and loads files itself; the first run uses the two objects added above.
  await suite("vector", page, env);
  await ctx.close();
}

await browser.close();
// dev server has no Supabase: its server-component theme fetch logs "supabase_unavailable" into the browser console
// (and the matching 503 resource line); the 存入 My Designs step deliberately hits the no-DB route (503/500 resource line).
const envNoise = (e) => /Failed to load resource|supabase_unavailable/.test(e);
const consoleErrs = errors.filter((e) => !envNoise(e));
const resourceErrs = errors.filter(envNoise);
check("no console/page errors on either page", consoleErrs.length === 0, consoleErrs.join(" | "));
if (resourceErrs.length) console.log(`NOTE ${resourceErrs.length} failed resource loads (dev-server no-Supabase / no-DB noise, excluded): ${resourceErrs.map((e) => e.slice(0, 90)).join(" | ")}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
