// Console errors/warnings on the new pages (local dev web). Credentials from mcp/user-env.ps1, never printed.
const fs = require("fs");
const { chromium } = require("playwright");
const env = fs.readFileSync("D:/Work/mcp/user-env.ps1", "utf8");
const val = (n) => { const m = env.match(new RegExp(`(?:\\$env:)?\\b${n}\\s*=\\s*['"]([^'"]+)['"]`)); if (!m) throw new Error(`${n} missing`); return m[1]; };
const BASE = "http://localhost:3930";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.request.post(`${BASE}/api/auth/login`, { data: { tenant_id: val("COS_TEST_TENANT_ID"), email: val("COS_TEST_EMAIL"), password: val("COS_TEST_PASSWORD") } });
  const page = await ctx.newPage();
  const messages = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) messages.push(`${m.type()}: ${m.text().slice(0, 400)}`); });
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  const first = await page.locator("tbody tr td a").first().getAttribute("href");
  messages.push(`--- ${first}`);
  await page.goto(`${BASE}${first}`, { waitUntil: "networkidle" });
  const saved = await page.locator("tbody a.btn").first().getAttribute("href");
  messages.push(`--- ${saved}`);
  await page.goto(`${BASE}${saved}`, { waitUntil: "networkidle" });
  await page.locator('[data-section="approve"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  console.log(messages.join("\n"));
  await browser.close();
})().catch((e) => { console.error(String(e)); process.exit(1); });
