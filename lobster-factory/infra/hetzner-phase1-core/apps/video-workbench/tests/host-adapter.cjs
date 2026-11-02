const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { chromium } = require("playwright");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seedstar-host-adapter-"));
  const server = require("../server.cjs").createServer({ env: {}, dataDir: dir, fetchImpl: () => { throw Error("Provider forbidden"); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const p = await browser.newPage();
    const calls = [], errors = [];
    let db = { version: 1, assets: [], characters: [], projects: [], jobs: [], preferences: {}, selection: {} }, fail = false, failureMode = "";
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => r.request().url().startsWith(base + "/") ? r.continue() : r.abort());
    await p.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: "window.SEEDSTAR_CONFIG={mode:'http',apiBaseUrl:'/api/host-media',timeoutMs:2000}" }));
    await p.route("**/api/**", (r) => {
      const req = r.request(), route = new URL(req.url()).pathname, method = req.method();
      calls.push({ route, method });
      if (!route.startsWith("/api/host-media/")) return r.abort();
      if (route.endsWith("/state")) {
        if (method === "PUT") db = req.postDataJSON();
        return r.fulfill({ json: db });
      }
      if (route.endsWith("/capabilities")) return r.fulfill({ json: { image: true, video: true, audio: true, models: { image: "host-image", video: "host-video", audio: "host-audio" } } });
      if (fail) return r.fulfill({ status: 422, json: { error: { message: "host rejected input" } } });
      if (failureMode === "network") return r.abort("connectionreset");
      if (failureMode === "malformed") return r.fulfill({ json: {} });
      if (failureMode === "gateway") return r.fulfill({ status: 504, json: { error: { message: "gateway timeout" } } });
      if (route.includes("/generations/")) return r.fulfill({ status: 404, json: { error: { message: "unknown job" } } });
      return r.fulfill({ json: { id: "host-job", type: "image", status: "succeeded", progress: 100, result: { url: "/assets/test-image-1.png" } } });
    });
    await p.goto(base);
    await p.waitForFunction(() => window.SeedStar?.generator?.controlsReady && SeedStar.capabilities?.models?.image === "host-image");
    await p.locator("[data-mode=image]").click();
    assert.match(await p.locator("#modelBtn").innerText(), /host-image/);
    await p.locator("#prompt").fill("主系統測試");
    await p.locator("#send").click();
    await p.locator(".job-view img").waitFor();
    await p.locator(".job-view button").filter({ hasText: "關閉" }).click();
    await p.locator("[data-panel=presets]").click();
    await p.locator("#generatorPresetName").fill("主系統設定");
    await p.locator("[data-gen-preset-save]").click();
    await p.getByRole("button", { name: "設為預設", exact: true }).waitFor();
    assert.equal(db.preferences["generator.presets.v1"][0].name, "主系統設定");
    await p.locator("#closeModal").click();
    fail = true;
    await p.locator("#send").click();
    await p.locator("#service-error").waitFor();
    assert.match(await p.locator("#service-error").innerText(), /422/);
    assert.equal(await p.evaluate(() => localStorage.getItem("seedstar.app.v1")), null);
    const retryStart = calls.length;
    fail = false;
    await p.evaluate(async () => {
      const blocked = (await SeedStar.generations.list()).find((j) => j.status === "blocked");
      if (blocked.serverAccepted !== false) throw Error("未確認拒絕狀態");
      await SeedStar.generations.retry(blocked);
    });
    assert.deepEqual(calls.slice(retryStart).filter((c) => c.route.includes("/generations")).map((c) => [c.method, c.route]), [["POST", "/api/host-media/generations"]]);
    for (const mode of ["network", "malformed", "gateway"]) {
      failureMode = mode;
      const unknown = await p.evaluate(async () => {
        try { await SeedStar.generations.create({ type: "image", prompt: "未知送出狀態" }); } catch {}
        return (await SeedStar.generations.list()).at(-1);
      });
      assert.equal(unknown.status, "submitting"); assert.equal(unknown.submissionUnconfirmed, true);
      const beforeUnknown = calls.length;
      assert.equal(await p.evaluate(async (job) => { try { await SeedStar.generations.retry(job); return false; } catch (e) { return e.message.includes("未確認"); } }, unknown), true);
      assert.equal(calls.length, beforeUnknown);
    }
    assert(calls.some((c) => c.route === "/api/host-media/capabilities" && c.method === "GET"));
    assert(calls.every((c) => c.route.startsWith("/api/host-media/")));
    assert.deepEqual(errors, []);
    console.log("PASS 指定 HTTP adapter 接收能力、模型、生成及設定保存；錯誤不轉本機；未被伺服器接受的任務可明確重試，不查詢不存在的 ID");
  } finally { await browser.close(); server.closeAllConnections(); await new Promise((r) => server.close(r)); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
