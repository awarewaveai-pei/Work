// Isolated real browser: cross-tab upload lock and actual customer buttons; never invokes a provider.
const assert = require("node:assert/strict"), http = require("node:http"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { chromium } = require("playwright");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
(async () => {
  let org = A, switches = 0;
  const app = require("../server.cjs").createServer({ env: { VW_CONFIG_MODE: "http" }, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "vw-org-ui-")), fetchImpl: () => { throw Error("Provider forbidden"); } });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const proxy = http.createServer(async (req, res) => {
    const json = (value) => { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
    const url = new URL(req.url, "http://x"), orgs = [{ id: A, name: "內部帳戶" }, { id: B, name: "Soulful" }];
    if (url.pathname === "/api/vw/identity") return json({ scope: org, organizationId: org });
    // the picker's modes since R10 (6101bb235): ?first=1&include=<current> and ?q= (next-admin bootstrap/route.ts)
    if (url.pathname === "/api/video/workbench/bootstrap")
      return json(url.searchParams.has("q") ? { ok: true, orgs: orgs.filter((o) => o.name.includes(url.searchParams.get("q"))) } : { ok: true, orgs, total: orgs.length, scoped: false });
    if (url.pathname === "/api/video/workbench/organization") {
      let body = ""; for await (const chunk of req) body += chunk;
      org = JSON.parse(body).organizationId; switches++; return json({ ok: true, organizationId: org });
    }
    const upstream = http.request({ host: "127.0.0.1", port: app.address().port, path: req.url, method: req.method, headers: req.headers }, (reply) => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
    req.pipe(upstream);
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext(), root = await context.newPage(), other = await context.newPage();
    const url = "http://127.0.0.1:" + proxy.address().port;
    for (const p of [root, other]) {
      await p.goto(url);
      await p.getByRole("button", { name: "切換客戶", exact: true }).waitFor();
      await p.waitForFunction(() => navigator.serviceWorker.controller);
    }
    await other.evaluate(() => { window.busy = VideoWorkbenchAdapters.context.run(() => new Promise((resolve) => { window.finishUpload = resolve; })); });
    await root.getByRole("button", { name: "切換客戶", exact: true }).click();
    await root.getByRole("button", { name: "Soulful", exact: true }).click();
    await root.getByRole("alert").filter({ hasText: "其他分頁仍在" }).waitFor();
    assert.equal(switches, 0, "busy tab prevents changing customer");
    await other.evaluate(async () => { finishUpload(); await busy; });
    await root.getByRole("button", { name: "Soulful", exact: true }).dblclick();
    await root.waitForFunction(() => document.getElementById("organizationPicker")?.textContent === "客戶：Soulful");
    assert.equal(switches, 1, "double click makes exactly one switch");
    await other.getByText("另一個分頁已切換客戶。請重新整理後繼續；原客戶的資料仍保留。", { exact: true }).waitFor();
    assert.equal(await other.evaluate(() => VideoWorkbenchAdapters.context.locked), true);
    console.log("organization-browser ok: actual selector, worker handshake, cross-tab busy, double-click, old-tab lock");
  } finally {
    await browser.close();
    for (const server of [proxy, app]) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
