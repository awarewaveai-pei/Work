// Plan U10: the shell's usage line reads /api/video/billing + /outcomes and shows plan, credits, providers and outcomes.
// Pure node: scripts/usage-panel.js runs in a vm against fake DOM and a fake fetch that plays next-admin.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "usage-panel.js"), "utf8");
const ORG = "11111111-1111-4111-8111-111111111111";

function shell(org, routes) {
  const asked = [], popover = { dataset: { activePanel: "usage" }, classList: { contains: () => false }, html: "" }, button = { textContent: "API · 依實際用量⌄" };
  const ctx = {
    VideoWorkbench: { capabilities: null, loadCapabilities: async () => { await new Promise((r) => setTimeout(r, 5)); return (ctx.VideoWorkbench.capabilities = { mainSystem: org ? { organizationId: org } : null }); } }, // capabilities arrive AFTER boot starts
    $: (id) => (id === "usageBtn" ? button : popover),
    safe: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";"),
    pop: (html) => { popover.html = html; },
    URLSearchParams,
    fetch: async (url) => {
      asked.push(url);
      const r = routes[url.split("?")[0]];
      return { ok: r.status === 200, status: r.status, json: async () => r.body };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx, asked, popover, button };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

(async () => {
  // 1. A plan: the line and the panel show plan, status, credits, limits, providers and the outcome totals.
  let s = shell(ORG, {
    "/api/video/billing": { status: 200, body: { ok: true, account: { plan: "subscription", status: "active", monthly_credit_limit: 500, hard_credit_limit: 800, current_period_end: "2026-12-01T00:00:00Z" }, balance: 120, providers: [{ provider: "replicate", mode: "byo" }] } },
    "/api/video/outcomes": { status: 200, body: { ok: true, count: 3, totals: { views: 1200, likes: 40 } } },
  });
  await settle();
  assert.equal(s.button.textContent, "方案：subscription · 點數 120⌄", "boot: the line shows plan and credits");
  assert(s.asked.every((u) => u.includes("organizationId=" + ORG)), "both reads carry the shell's organization");
  await s.ctx.usagePanel();
  for (const text of ["方案：subscription", "狀態：active", "點數餘額：120", "每月點數上限：500", "點數硬上限：800", "本期結束：2026-12-01", "replicate（byo）", "成效事件數：3", "views：1200", "likes：40"])
    assert(s.popover.html.includes(text), "panel shows " + text);

  // 2. No plan: the account row is absent (route returns the free default) -> free / 0, providers say not set; empty outcomes.
  s = shell(ORG, {
    "/api/video/billing": { status: 200, body: { ok: true, account: { organization_id: ORG, plan: "free", status: "active", monthly_credit_limit: 0, hard_credit_limit: 0 }, balance: 0, providers: [] } },
    "/api/video/outcomes": { status: 200, body: { ok: true, count: 0, totals: {} } },
  });
  await settle();
  assert.equal(s.button.textContent, "方案：free · 點數 0⌄");
  await s.ctx.usagePanel();
  for (const text of ["方案：free", "點數餘額：0", "尚未設定", "成效事件數：0"]) assert(s.popover.html.includes(text), "free panel shows " + text);

  // 3. A read that fails shows its own message, the other section still shows; the line falls back to the old text.
  s = shell(ORG, { "/api/video/billing": { status: 403, body: {} }, "/api/video/outcomes": { status: 200, body: { ok: true, count: 1, totals: { views: 5 } } } });
  await settle();
  assert.equal(s.button.textContent, "API · 依實際用量⌄");
  await s.ctx.usagePanel();
  assert(s.popover.html.includes("沒有權限查看") && s.popover.html.includes("views：5"));

  // 4. Not connected to the main system: nothing is read; the panel says why.
  s = shell("", {});
  await settle();
  await s.ctx.usagePanel();
  assert.equal(s.asked.length, 0, "no request without an organization");
  assert(s.popover.html.includes("本機版不扣平台點數"));

  // 5. Values from the server are escaped.
  s = shell(ORG, { "/api/video/billing": { status: 200, body: { ok: true, account: { plan: "<img onerror=x>" }, balance: 1, providers: [] } }, "/api/video/outcomes": { status: 200, body: { ok: true } } });
  await s.ctx.usagePanel();
  assert(!s.popover.html.includes("<img"), "plan name is escaped");
  console.log("u10-usage-panel ok");
})().catch((e) => { console.error(e); process.exit(1); });
