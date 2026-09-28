// Run page -> demo -> 執行分析 (real model) on the local dev web; screenshots of the result and the rendered <main> saved
// for check-mocks.py --page result. Credentials read from mcp/user-env.ps1, never printed.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const env = fs.readFileSync(path.resolve(__dirname, "../../../../../mcp/user-env.ps1"), "utf8");   // <repo>/mcp/user-env.ps1, from scripts/dev
const val = (n) => { const m = env.match(new RegExp(`(?:\\$env:)?\\b${n}\\s*=\\s*['"]([^'"]+)['"]`)); if (!m) throw new Error(`${n} missing`); return m[1]; };
const OUT = process.argv[2];
const BASE = "http://localhost:3930";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { tenant_id: val("COS_TEST_TENANT_ID"), email: val("COS_TEST_EMAIL"), password: val("COS_TEST_PASSWORD") } });
  if (!login.ok()) throw new Error(`login ${login.status()}`);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/methods/systems.iceberg_model/run#demo`, { waitUntil: "networkidle", timeout: 120000 });
  await page.locator("form.runform textarea").first().waitFor();
  await page.getByRole("button", { name: "執行分析" }).click();
  await page.getByRole("button", { name: "確認執行" }).click();   // 花錢前先講: the cost is shown first, the run starts on 確認執行
  const done = page.locator('[data-section="approve"]').waitFor({ timeout: 300000 }).then(() => "ok");
  const failed = page.locator('#input p.error').waitFor({ timeout: 300000 }).then(async () => "FAILED: " + await page.locator('#input p.error').textContent());
  const outcome = await Promise.race([done, failed]);
  if (outcome !== "ok") { console.log(outcome); await browser.close(); process.exit(3); }
  await page.screenshot({ path: path.join(OUT, "result_full.png"), fullPage: true, caret: "initial" });
  for (const id of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "approve"]) await page.locator(`[data-section="${id}"]`).screenshot({ path: path.join(OUT, `result_card_${id}.png`) });
  fs.writeFileSync(path.join(OUT, "result_main.html"), await page.evaluate(() => document.querySelector("main").outerHTML));
  fs.writeFileSync(path.join(OUT, "result_expert.json"), await page.evaluate(() => document.querySelector("#expert pre").textContent));
  const info = await page.evaluate(() => ({
    sections: [...document.querySelectorAll("[data-section]")].map((n) => n.getAttribute("data-section")),
    findings: document.querySelectorAll('[data-section="1"] .finding:not(.warn)').length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    input: !!document.querySelector("#input"),
  }));
  console.log(JSON.stringify(info), "errors", errors.length);
  await browser.close();
})().catch((e) => { console.error(String(e)); process.exit(1); });
