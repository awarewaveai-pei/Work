// Rendered half of check-social-mocks.py: opens each page at 1280x660 and reports what only a browser can see.
//   node measure-mock.mjs <page.html>...   -> one JSON line per page: {file, views:{<view>:chips}, heights:{<view>:px}, widths:{<view>:px}, cards, noThumb} | {file, error}
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
      const pageH = () => document.scrollingElement.scrollHeight, pageW = () => document.scrollingElement.scrollWidth;  // one-screen: the page itself never scrolls
      const views = { opening: await page.evaluate(chips) }, heights = { opening: await page.evaluate(pageH) }, widths = { opening: await page.evaluate(pageW) };
      const names = await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-view]")].map((x) => x.dataset.view))]);
      for (const v of names) {
        const b = page.locator(`[data-view="${v}"]:visible`).first();
        if (!(await b.count())) await page.locator(`[data-view="plan"]:visible`).first().click().catch(() => {});  // planning tabs live under 貼文排程
        if (!(await b.count())) { views[v] = "not reachable"; continue; }
        await b.click(); await page.waitForTimeout(60);
        views[v] = await page.evaluate(chips); heights[v] = await page.evaluate(pageH); widths[v] = await page.evaluate(pageW);
      }
      // dead buttons (operator 2026-10-17 「你要確認每個功能有作用」): fresh page, go to the view, click one visible enabled
      // button, compare the whole page before/after; nothing changed = it does nothing. Buttons in closed popovers are not seen.
      const go = async (v) => { await page.evaluate((v) => { const vis = (e) => e.offsetParent !== null; const f = (q) => [...document.querySelectorAll(q)].find(vis);
        let el = f(`[data-view="${v}"]`); if (!el) { const pl = f('[data-view="plan"]'); if (pl) pl.click(); el = f(`[data-view="${v}"]`); } if (el) el.click(); }, v); await page.waitForTimeout(20); };
      const visibleButtons = () => [...document.querySelectorAll("button")].filter((b) => !b.disabled && b.offsetParent !== null && !b.closest("[data-view]") && !b.matches("[data-view]") && !b.classList.contains("on") && b.getAttribute("aria-pressed") !== "true");
      const snap = () => document.body.innerHTML + [...document.querySelectorAll("input,textarea")].map((e) => e.type === "checkbox" || e.type === "radio" ? e.checked : e.value).join("|");
      const dead = {};
      for (const v of names) {
        await page.reload({ waitUntil: "load" }); await go(v);
        const n = await page.evaluate(`(${visibleButtons.toString()})().length`);
        for (let i = 0; i < n; i++) {
          await page.reload({ waitUntil: "load" }); await go(v);
          const r = await page.evaluate(async ([i, vb, sn]) => { const list = eval(vb)(); const b = list[i]; if (!b) return null; const before = eval(sn)(); b.click(); await new Promise((r) => setTimeout(r, 40)); return { label: (b.getAttribute("aria-label") || b.textContent || b.title || b.id).trim().slice(0, 40), same: eval(sn)() === before }; }, [i, `(${visibleButtons.toString()})`, `(${snap.toString()})`]);
          if (r && r.same) (dead[v] ||= []).push(r.label);
        }
      }
      console.log(JSON.stringify({ file, views, heights, widths, dead, ...cards, errors }));
      await page.close();
    } catch (e) {
      console.log(JSON.stringify({ file, error: String(e).split("\n")[0] }));
    }
  }
} finally {
  await browser.close();
}
