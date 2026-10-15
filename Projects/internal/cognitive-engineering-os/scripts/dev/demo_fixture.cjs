// The free 示範分析 pages' data (apps/cognitive-web/fixtures/demo/<method>.<domain>.json): for each domain given, the run
// page opens that domain's demo (#demo / #demo=<domain>), presses 執行分析 → 確認執行 (real model, real cost) on the local
// dev web, waits for the result and saves what the API returns for it -- never hand-written (template §6). Then run
// `python docs/mockups/sync-design-system.py` so lib/demos.generated.ts and the lessons link the new page.
// Usage (from lobster-factory/infra/hetzner-phase1-core, NODE_PATH=tests/node_modules):
//   node <COS>/scripts/dev/demo_fixture.cjs <method_id> <domain> [<domain> ...]
// Credentials read from mcp/user-env.ps1, never printed.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const env = fs.readFileSync(path.resolve(__dirname, "../../../../../mcp/user-env.ps1"), "utf8");   // <repo>/mcp/user-env.ps1, from scripts/dev
const val = (n) => { const m = env.match(new RegExp(`(?:\\$env:)?\\b${n}\\s*=\\s*['"]([^'"]+)['"]`)); if (!m) throw new Error(`${n} missing`); return m[1]; };
const BASE = "http://localhost:3930";
const OUT = path.resolve(__dirname, "../../apps/cognitive-web/fixtures/demo");
const DOMAINS = fs.readFileSync(path.resolve(__dirname, "../../../../../agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/methods/examples/domains.yaml"), "utf8");
const DEFAULT = (DOMAINS.match(/^default:\s*(\S+)/m) ?? [])[1];
const [method, ...domains] = process.argv.slice(2);
if (!method || !domains.length || !DEFAULT) { console.error("usage: demo_fixture.cjs <method_id> <domain> [<domain> ...]"); process.exit(2); }
for (const domain of domains) if (!new RegExp(`\\{id: ${domain},[^}]*status: active`).test(DOMAINS)) { console.error(`${domain}: not an active domain in domains.yaml`); process.exit(2); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { tenant_id: val("COS_TEST_TENANT_ID"), email: val("COS_TEST_EMAIL"), password: val("COS_TEST_PASSWORD") } });
  if (!login.ok()) throw new Error(`login ${login.status()}`);
  const api = async (route) => { const response = await ctx.request.get(`${BASE}/api${route}`); if (!response.ok()) throw new Error(`${route} ${response.status()}`); return response.json(); };
  const form = await api(`/methods/${encodeURIComponent(method)}/form`);
  let failures = 0;
  // one domain at a time; a domain that fails (an error on the page, a timeout, a navigation error) is reported with a
  // screenshot and the next domain still runs
  const runDomain = async (domain, page) => {
    await page.goto(`${BASE}/methods/${encodeURIComponent(method)}/run${domain === DEFAULT ? "#demo" : `#demo=${domain}`}`, { waitUntil: "networkidle", timeout: 120000 });
    await page.locator("form.runform").waitFor();
    await page.getByRole("button", { name: "執行分析" }).click();
    await page.getByRole("button", { name: "確認執行" }).click();   // 花錢前先講: the run starts only here
    const done = page.locator('[data-section="approve"]').waitFor({ timeout: 400000 }).then(() => "ok");
    // a refusal shows as an error line or an alert with words in it (an empty live region is not one)
    const problem = page.locator("#input p.error, [role=alert]").filter({ hasText: /\S/ }).first();
    const failed = problem.waitFor({ timeout: 400000 }).then(async () => "FAILED: " + await problem.textContent());
    const outcome = await Promise.race([done, failed]);
    const id = (page.url().match(/\/analyses\/([^/?#]+)/) ?? [])[1];
    if (outcome !== "ok" || !id) throw new Error(outcome === "ok" ? "no analysis id in the address" : outcome);
    const run = await api(`/interpretations/${encodeURIComponent(id)}`);
    if (run.status !== "DONE") throw new Error(`${run.status} ${run.error ?? ""}`);
    const fixture = {
      _about: { what: "A real analysis of this tool's demo case in this domain: the free read-only 示範分析 (template §6). Regenerate with scripts/dev/demo_fixture.cjs; never hand-edit.",
        method, domain, model: run.result?.model ?? null, ran_at: run.created_at ?? new Date().toISOString(), schema_version: run.schema_version ?? null },
      display: form.display ?? null, fields: form.form.fields, record: run.record, result: run.result, gateResults: run.gate_results ?? [],
      recordGates: run.record_gate_results ?? [], manifest: run.manifest ?? [],   // recordGates: the tool's own gates (層序…) for the approve bar
    };
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${method}.${domain}.json`);
    fs.writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n");
    console.log(`${method} ${domain}: ok ${id} -> ${path.relative(process.cwd(), file)} (${run.result?.usage?.input_tokens ?? "?"}+${run.result?.usage?.output_tokens ?? "?"} tokens, NT$${run.cost_twd ?? "?"})`);
  };
  for (const domain of domains) {
    const page = await ctx.newPage();
    try { await runDomain(domain, page); }
    catch (error) {
      const shot = path.join(require("os").tmpdir(), `demo_fixture-${method}-${domain}.png`);
      await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
      console.log(`${method} ${domain}: FAILED ${String(error).slice(0, 300)} (screenshot ${shot})`); failures += 1;
    }
    finally { await page.close(); }
  }
  await browser.close();
  process.exit(failures ? 3 : 0);
})().catch((e) => { console.error(String(e)); process.exit(1); });
