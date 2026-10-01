#!/usr/bin/env node
/* Render the five mocks (the home page once per view: home, tools, workflows, projects = mockkit.NAV) to PNG slices so a reviewer (human or model) can look at the real page instead of
   trusting computed styles. Desktop light (1200px), mobile light (375px), desktop dark (1200px); mobile and
   dark are capped at a few slices and the log says TRUNCATED when a page was cut (use --full for everything).
   CommonJS on purpose (.cjs): the repo root package.json is "type":"module", and NODE_PATH resolution only
   works for require(). Needs Playwright with a Chromium build. From the repo root:
     NODE_PATH="$LOCALAPPDATA/npm-cache/_npx/<hash>/node_modules" node Projects/internal/cognitive-engineering-os/docs/mockups/render-mocks.cjs <out-dir> [--full]
   (<hash> = the npx cache folder that `npx playwright` populated; any node_modules that holds `playwright` works).
   Output: <out-dir>/<page>-<mode>-<n>.png, stale slices of the same page/mode are deleted first; view with the
   Read tool. Exit 0 ok, 1 = a page scrolls horizontally, 2 = usage / playwright missing, 3 = render failed,
   4 = U22 on the rendered page: text you read computes under 14px outside the label selectors, or a prose block is
   wider than 80 characters of its own size. check-mocks.py's stylesheet rules cannot see the cascade (an override,
   an inherited 12px); this measures what the browser computed. The sets come from `check-mocks.py --type-sets`, so
   this also needs Python with the mock checker's imports (PYTHON=<exe> overrides the default `python`).
   Plan I11 / §10: run after check-mocks.py is green and before publishing. */
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const args = process.argv.slice(2);
const full = args.includes("--full");
const out = args.filter((a) => !a.startsWith("-"))[0];
if (!out || args.some((a) => a.startsWith("-") && a !== "--full") || args.length > 2) {
  console.error("usage: render-mocks.cjs <out-dir> [--full]"); process.exit(2);
}
let chromium;
try { ({ chromium } = require("playwright")); }
catch (e) { console.error("playwright not resolvable: set NODE_PATH to a node_modules that contains it"); process.exit(2); }
const HERE = __dirname;
let TYPE;
try { TYPE = JSON.parse(require("child_process").execFileSync(process.env.PYTHON || "python", [path.join(HERE, "check-mocks.py"), "--type-sets"], { encoding: "utf8" })); }
catch (e) { console.error(`check-mocks.py --type-sets failed: ${e.message}`); process.exit(2); }
// in the page: every visible element that holds text of its own, outside svg drawings
function typeFindings(t) {
  const out = [], tagSel = t.tag_ok.join(","), proseSel = t.prose.join(",");
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const name = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : "");
  for (const e of document.querySelectorAll("body *")) {
    if (e.closest("svg, script, style, title") || !shown(e)) continue;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (own && fs < t.min_read_px && !e.closest(tagSel)) out.push(`${name(e)} ${fs}px: "${e.textContent.trim().slice(0, 24)}"`);
    if (e.matches(proseSel)) {
      const cs = getComputedStyle(e), inner = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (inner > t.measure_em * fs + 1) out.push(`${name(e)} ${Math.round(inner / fs)} characters wide (max ${t.measure_em})`);
    }
  }
  return [...new Set(out)];
}
const FILES = ["home-mock.html", "iceberg-result-mock.html", "iceberg-lesson-mock.html", "workflow-result-mock.html", "workflow-lesson-mock.html"];   // = mockkit.FILES
// = mockkit.NAV ids (the page shows one at a time) + two tool pages: one with a lesson and a demo, one without;
// lessons: the first tab (null) plus the other learning tabs (mockkit.LESSON_TABS); run pages: saved run (null) and #new
const VIEWS = { "home-mock.html": ["home", "tools", "workflows", "projects", "t-systems.iceberg_model", "t-strategy.swot"],
  "iceberg-lesson-mock.html": [null, "panel-example", "panel-fill", "panel-read", "panel-teach"],
  "workflow-lesson-mock.html": [null, "panel-stations", "panel-walk", "panel-read"],
  "iceberg-result-mock.html": [null, "new"], "workflow-result-mock.html": [null, "new"] };
const TARGETS = FILES.flatMap((f) => (VIEWS[f] || [null]).map((v) => [f, v]));
// [mode, viewport width, colour scheme, slice height, max slices unless --full]
const MODES = [["desktop", 1200, "light", 1300, 8], ["mobile", 375, "light", 1400, 3], ["dark", 1200, "dark", 1300, 2]];
const WIDE = 1920;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const [f, view] of TARGETS) {
    const base = f.replace("-mock.html", "") + (view ? `-${view}` : "");
    for (const [name, width, scheme, sh, max] of MODES) {
      for (const old of fs.readdirSync(out)) {
        if (old.startsWith(`${base}-${name}-`) && old.endsWith(".png")) fs.unlinkSync(path.join(out, old));
      }
      const ctx = await browser.newContext({ viewport: { width, height: sh }, colorScheme: scheme, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(path.join(HERE, f)).href + (view ? `#${view}` : ""), { waitUntil: "load" });
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      const type = await page.evaluate(typeFindings, TYPE);
      for (const line of type.slice(0, 8)) console.log(`${f}${view ? "#" + view : ""} ${name}: U22 ${line}`);
      if (type.length > 8) console.log(`${f}${view ? "#" + view : ""} ${name}: U22 … ${type.length - 8} more`);
      if (type.length && !process.exitCode) process.exitCode = 4;
      const limit = full ? Infinity : max;
      let n = 0, y = 0;
      for (; y < h && n < limit; y += sh, n++) {
        const file = path.join(out, `${base}-${name}-${n}.png`);
        await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y, width, height: Math.min(sh, h - y) } });
      }
      const cut = y < h ? `, rendered ${Math.min(y, h)}/${h}px (TRUNCATED, use --full)` : "";
      console.log(`${f}${view ? "#" + view : ""} ${name}: height ${h}, slices ${n}${cut}${overflow ? ", HORIZONTAL OVERFLOW" : ""}`);
      if (overflow && !process.exitCode) process.exitCode = 1;   // the first failure's code stands (1 overflow, 4 U22)
      await ctx.close();
    }
    // measured only, no slices: the column reaches its 80-character prose cap only on a wide screen (>= 1600px)
    const wide = await browser.newContext({ viewport: { width: WIDE, height: 1000 }, deviceScaleFactor: 1 });
    const wp = await wide.newPage();
    await wp.goto(pathToFileURL(path.join(HERE, f)).href + (view ? `#${view}` : ""), { waitUntil: "load" });
    const wtype = await wp.evaluate(typeFindings, TYPE);
    for (const line of wtype.slice(0, 8)) console.log(`${f}${view ? "#" + view : ""} wide ${WIDE}: U22 ${line}`);
    if (wtype.length > 8) console.log(`${f}${view ? "#" + view : ""} wide ${WIDE}: U22 … ${wtype.length - 8} more`);
    if (wtype.length && !process.exitCode) process.exitCode = 4;
    await wide.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(3); });
