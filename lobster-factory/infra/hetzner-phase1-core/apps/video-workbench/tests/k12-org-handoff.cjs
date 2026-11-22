// K12 (ADR 020 §2.4): /?open=X&org=Y from the main system's handoff, in an isolated real browser; never invokes a provider.
// Same org = parameter dropped, no dialog; another org = the switch dialog with it offered, cancel keeps the client, a
// click switches through the one existing path (flush before POST, broadcast to other tabs) and lands on /?open=X;
// a malformed or not-allowed org = no dialog, no switch, one sentence. No org = no dialog (the top button still works).
const assert = require("node:assert/strict"), http = require("node:http"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { chromium } = require("playwright");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", C = "33333333-3333-4333-8333-333333333333";
const ORGS = [{ id: A, name: "內部帳戶" }, { id: B, name: "Soulful" }]; // C = a client this account may not pick
(async () => {
  let org = A;
  const order = [];
  const app = require("../server.cjs").createServer({ env: { VW_CONFIG_MODE: "http" }, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "vw-k12-")), fetchImpl: () => { throw Error("Provider forbidden"); } });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const proxy = http.createServer(async (req, res) => {
    const json = (value) => { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); };
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/vw/identity") return json({ scope: org, organizationId: org });
    if (url.pathname === "/api/video/workbench/bootstrap") {
      // the next-admin route's modes: ?first=1 (&include= only adds an allowed client) and ?q=
      if (url.searchParams.has("q")) return json({ ok: true, orgs: ORGS.filter((o) => o.name.includes(url.searchParams.get("q"))) });
      return json({ ok: true, orgs: ORGS, total: ORGS.length, scoped: false });
    }
    if (url.pathname === "/api/video/workbench/organization") {
      let body = ""; for await (const chunk of req) body += chunk;
      order.push("post"); org = JSON.parse(body).organizationId; return json({ ok: true, organizationId: org });
    }
    const upstream = http.request({ host: "127.0.0.1", port: app.address().port, path: req.url, method: req.method, headers: req.headers }, (reply) => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); });
    req.pipe(upstream);
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + proxy.address().port;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext();
    await context.exposeFunction("k12mark", (step) => order.push(step));
    const ready = async (p, search) => {
      await p.goto(base + search);
      await p.waitForFunction(() => /^客戶：/.test(document.getElementById("organizationPicker")?.textContent || ""));
      await p.waitForFunction(() => navigator.serviceWorker.controller);
    };
    const dialogs = (p) => p.locator("dialog.vw-organization-dialog[open]").count();
    const posts = () => order.filter((s) => s === "post").length;

    // no org: nothing opens; the address is untouched
    const page = await context.newPage();
    await ready(page, "/?open=projects");
    assert.equal(await dialogs(page), 0, "no org: no dialog");
    assert.equal(new URL(page.url()).search, "?open=projects");

    // org = the current client: parameter dropped, no dialog, open kept
    await ready(page, "/?open=projects&org=" + A.toUpperCase());
    assert.equal(await dialogs(page), 0, "same org: no dialog");
    assert.equal(new URL(page.url()).search, "?open=projects", "same org: org removed, open kept");

    // malformed / not allowed: no dialog, no switch, one sentence
    for (const bad of ["not-a-uuid", C]) {
      await ready(page, "/?open=projects&org=" + bad);
      await page.getByRole("alert").filter({ hasText: "主系統帶來的客戶無法在這裡開啟" }).waitFor();
      assert.equal(await dialogs(page), 0, bad + ": no dialog");
      assert.equal(new URL(page.url()).search, "?open=projects", bad + ": org removed");
    }
    assert.equal(posts(), 0, "a refused org never switches");

    // another client: the dialog offers it; 返回 keeps the current client
    await ready(page, "/?open=projects&org=" + B);
    const dialog = page.locator("dialog.vw-organization-dialog[open]");
    await dialog.getByText("主系統要以「Soulful」開啟", { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "返回", "the switch is never the focused control");
    assert.equal(new URL(page.url()).search, "?open=projects", "org leaves the address while the dialog is up");
    await page.keyboard.press("Enter");
    await dialog.waitFor({ state: "detached" });
    assert.equal(posts(), 0, "cancel does not switch");
    assert.equal(org, A);
    await page.reload();
    await page.waitForFunction(() => /^客戶：/.test(document.getElementById("organizationPicker")?.textContent || ""));
    assert.equal(await dialogs(page), 0, "a reload after cancel does not ask again");

    // confirm: flush finishes before the POST, other tabs hear the broadcast, the page lands on /?open=X
    const other = await context.newPage();
    await ready(other, "/");
    await ready(page, "/?open=projects&org=" + B);
    await page.evaluate(() => {
      const flush = VideoWorkbench.flush;
      VideoWorkbench.flush = async () => { const r = await flush(); await window.k12mark("flush"); return r; };
    });
    order.length = 0;
    await page.locator("dialog.vw-organization-dialog[open]").getByRole("button", { name: "Soulful", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("organizationPicker")?.textContent === "客戶：Soulful");
    assert.deepEqual(order, ["flush", "post"], "flush completes before the switch is sent");
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, "/?open=projects", "lands on the original open");
    await other.getByText("另一個分頁已切換客戶。請重新整理後繼續；原客戶的資料仍保留。", { exact: true }).waitFor();
    assert.equal(await other.evaluate(() => VideoWorkbenchAdapters.context.locked), true, "the other tab is locked");

    // the top button still opens the plain dialog and a switch from it lands on "/"
    await page.getByRole("button", { name: "切換客戶", exact: true }).click();
    const plain = page.locator("dialog.vw-organization-dialog[open]");
    assert.equal(await plain.getByText("主系統要以", { exact: false }).count(), 0, "top button: no handoff note");
    await plain.getByRole("button", { name: "內部帳戶", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("organizationPicker")?.textContent === "客戶：內部帳戶");
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, "/", "top button switch lands on /");
    console.log("k12-org-handoff ok: no org, same org, malformed, not allowed, cancel, confirm (flush->post, broadcast, /?open=), top button");
  } finally {
    await browser.close();
    for (const server of [proxy, app]) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
