// 我的專案 -> newest project -> its latest analysis, on the local dev web (no new analysis, no model call). Screenshots
// at desktop and phone width, the saved result's <main> for check-mocks.py --page result, page errors, horizontal
// overflow, and whether lesson HTML reaches any client JS on the new pages. Credentials from mcp/user-env.ps1, never printed.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const env = fs.readFileSync(path.resolve(__dirname, "../../../../../mcp/user-env.ps1"), "utf8");   // <repo>/mcp/user-env.ps1, from scripts/dev
const val = (n) => { const m = env.match(new RegExp(`(?:\\$env:)?\\b${n}\\s*=\\s*['"]([^'"]+)['"]`)); if (!m) throw new Error(`${n} missing`); return m[1]; };
const OUT = process.argv[2];
const BASE = "http://localhost:3930";
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  for (const [label, viewport] of [["desk", { width: 1400, height: 1000 }], ["phone", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport });
    const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { tenant_id: val("COS_TEST_TENANT_ID"), email: val("COS_TEST_EMAIL"), password: val("COS_TEST_PASSWORD") } });
    if (!login.ok()) throw new Error(`login ${login.status()}`);
    const page = await ctx.newPage();
    const errors = []; const js = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", (r) => { if (r.url().includes("/_next/static/") && r.url().endsWith(".js")) js.push(r); });
    await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
    await page.locator("tbody tr").first().waitFor();
    const list = await page.evaluate(() => ({ rows: [...document.querySelectorAll("tbody tr")].slice(0, 3).map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent)), overflow: document.documentElement.scrollWidth - window.innerWidth }));
    await page.screenshot({ path: path.join(OUT, `${label}_1_projects.png`), fullPage: true, caret: "initial" });
    await page.locator("tbody tr td a").first().click();
    await page.locator("h2", { hasText: "這個專案的分析" }).waitFor();
    await page.waitForLoadState("networkidle");
    const project = await page.evaluate(() => ({ url: location.pathname, status: document.querySelector(".status")?.textContent, rows: document.querySelectorAll("tbody tr").length, overflow: document.documentElement.scrollWidth - window.innerWidth }));
    await page.screenshot({ path: path.join(OUT, `${label}_2_project.png`), fullPage: true, caret: "initial" });
    await page.locator("tbody a.btn").first().click();
    await page.locator('[data-section="approve"]').waitFor({ timeout: 60000 });
    const saved = await page.evaluate(() => ({ url: location.pathname, crumbs: document.querySelector(".crumbs")?.textContent, sub: document.querySelector('[data-section="0"] .sub')?.textContent, sections: document.querySelectorAll("[data-section]").length, filled: [...document.querySelectorAll("form.runform textarea")].filter((t) => t.value.trim()).length, overflow: document.documentElement.scrollWidth - window.innerWidth }));
    await page.screenshot({ path: path.join(OUT, `${label}_3_saved.png`), fullPage: false, caret: "initial" });
    if (label === "desk") fs.writeFileSync(path.join(OUT, "saved_main.html"), await page.evaluate(() => document.querySelector("main").outerHTML));
    let lessonHits = 0;
    for (const r of js) { const t = await r.text().catch(() => ""); if (t.includes("手邊有這些會填得比較快")) lessonHits++; }
    console.log(label, JSON.stringify({ list, project, saved, errors, js: js.length, lessonHits }));
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(String(e)); process.exit(1); });
