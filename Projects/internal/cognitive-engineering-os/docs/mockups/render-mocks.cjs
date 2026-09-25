#!/usr/bin/env node
/* Render the five mocks (the home page once per view: home, tools, workflows, projects = mockkit.NAV) to PNG slices so a reviewer (human or model) can look at the real page instead of
   trusting computed styles. Desktop light (1200px), mobile light (375px), desktop dark (1200px); mobile and
   dark are capped at a few slices and the log says TRUNCATED when a page was cut (use --full for everything).
   CommonJS on purpose (.cjs): the repo root package.json is "type":"module", and NODE_PATH resolution only
   works for require(). Needs Playwright with a Chromium build. From the repo root:
     NODE_PATH="$LOCALAPPDATA/npm-cache/_npx/<hash>/node_modules" node Projects/internal/cognitive-engineering-os/docs/mockups/render-mocks.cjs <out-dir> [--full]
   (<hash> = the npx cache folder that `npx playwright` populated; any node_modules that holds `playwright` works).
   Output: <out-dir>/<page>-<mode>-<n>.png, stale slices of the same page/mode are deleted first; view with the
   Read tool. Exit 0 ok, 1 = a page scrolls horizontally, 2 = usage / playwright missing, 3 = render failed.
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
const FILES = ["home-mock.html", "iceberg-result-mock.html", "iceberg-lesson-mock.html", "workflow-result-mock.html", "workflow-lesson-mock.html"];   // = mockkit.FILES
// = mockkit.NAV ids (the page shows one at a time) + two tool pages: one with a lesson and a demo, one without
const VIEWS = { "home-mock.html": ["home", "tools", "workflows", "projects", "t-systems.iceberg_model", "t-strategy.swot"] };
const TARGETS = FILES.flatMap((f) => (VIEWS[f] || [null]).map((v) => [f, v]));
// [mode, viewport width, colour scheme, slice height, max slices unless --full]
const MODES = [["desktop", 1200, "light", 1300, 8], ["mobile", 375, "light", 1400, 3], ["dark", 1200, "dark", 1300, 2]];
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
      const limit = full ? Infinity : max;
      let n = 0, y = 0;
      for (; y < h && n < limit; y += sh, n++) {
        const file = path.join(out, `${base}-${name}-${n}.png`);
        await page.screenshot({ path: file, fullPage: true, clip: { x: 0, y, width, height: Math.min(sh, h - y) } });
      }
      const cut = y < h ? `, rendered ${Math.min(y, h)}/${h}px (TRUNCATED, use --full)` : "";
      console.log(`${f}${view ? "#" + view : ""} ${name}: height ${h}, slices ${n}${cut}${overflow ? ", HORIZONTAL OVERFLOW" : ""}`);
      if (overflow) process.exitCode = 1;
      await ctx.close();
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(3); });
