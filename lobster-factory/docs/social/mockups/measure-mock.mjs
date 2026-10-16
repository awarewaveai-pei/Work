// Rendered half of check-social-mocks.py: opens each page at 1280x660 and reports what only a browser can see.
//   node measure-mock.mjs <page.html>...   -> one JSON line per page: {file, views:{<view>:chips}, cards, noThumb} | {file, error}
// chips = visible boxes inside the viewport that are .chip/.pill, or pill-shaped (radius >= half the height, 14-40px high,
// width >= 1.1 x height so circles stay out, with a border or a fill), counted on the opening screen and after clicking
// every [data-view] control. cards / noThumb = week cards (.week .card) on the opening screen and how many lack a .cthumb.
// Playwright comes from the e2e tests' install.
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, "../../../infra/hetzner-phase1-core/tests/package.json"));
const { chromium } = require("@playwright/test");

const chips = () => {
  const seen = []; let n = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("svg")) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    const rad = parseFloat(cs.borderTopLeftRadius);
    const named = el.classList.contains("chip") || el.classList.contains("pill");  // a one-letter pill is near-square
    if (!named && !(r.height >= 14 && r.height <= 40 && r.width >= r.height * 1.1 && rad >= r.height / 2 - 1)) continue;
    const boxed = parseFloat(cs.borderTopWidth) > 0 || !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor);
    if (!(named || boxed) || seen.some((s) => s.contains(el))) continue;
    seen.push(el); n++;
  }
  return n;
};

const browser = await chromium.launch();
try {
  for (const file of process.argv.slice(2)) {
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 660 }, deviceScaleFactor: 1 });
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());  // offline-safe, same layout every run
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: "load" });
      await page.waitForTimeout(150);
      const cards = await page.evaluate(() => { const c = [...document.querySelectorAll(".week .card")]; return { cards: c.length, noThumb: c.filter((x) => !x.querySelector(".cthumb")).length }; });
      const views = { opening: await page.evaluate(chips) };
      const names = await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-view]")].map((x) => x.dataset.view))]);
      for (const v of names) {
        const b = page.locator(`[data-view="${v}"]:visible`).first();
        if (!(await b.count())) await page.locator(`[data-view="cal"]:visible`).first().click().catch(() => {});  // calendar switches live inside the calendar
        if (!(await b.count())) { views[v] = "not reachable"; continue; }
        await b.click(); await page.waitForTimeout(60);
        views[v] = await page.evaluate(chips);
      }
      console.log(JSON.stringify({ file, views, ...cards, errors }));
      await page.close();
    } catch (e) {
      console.log(JSON.stringify({ file, error: String(e).split("\n")[0] }));
    }
  }
} finally {
  await browser.close();
}
