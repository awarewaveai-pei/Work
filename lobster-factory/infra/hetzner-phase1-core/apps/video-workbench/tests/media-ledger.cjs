// Card M2 (docs/creative-suite-plan-20261102.md §3 invariants 2/6/7): state lives on the server (.data/state.json),
// localStorage is only a cache; pre-server data migrates once with the original kept; a stale tab gets 409; every
// asset has an origin; one idempotency key = one job; retry only after failed/cancelled.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=",
  "base64",
);
const stateOf = (dataDir) => JSON.parse(fs.readFileSync(path.join(dataDir, "state.json"), "utf8"));
const open = async (context, base) => {
  const p = await context.newPage();
  p.setDefaultTimeout(15000);
  await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
  await p.goto(base);
  await p.waitForFunction(() => window.VideoWorkbench?.router);
  await p.evaluate(() => VideoWorkbench.ready);
  return p;
};

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const errors = [];
  try {
    // 1. Invariant 6: after clearing localStorage the asset and project lists still come back (from the server).
    {
      const { base, dataDir } = await isolatedServer("vw-media-ledger-a-");
      const context = await browser.newContext(), p = await open(context, base);
      p.on("pageerror", (e) => errors.push(e.message));
      await p.locator("#assetsNav").click();
      await p.locator("#workspaceUpload").setInputFiles({ name: "帳冊測試.png", mimeType: "image/png", buffer: png });
      await p.locator(".workspace-card h2").filter({ hasText: "帳冊測試.png" }).waitFor();
      await p.evaluate(async () => {
        await VideoWorkbench.projects.save({ id: "ledger-project", title: "帳冊專案", type: "single" });
        await VideoWorkbench.flush();
        localStorage.clear();
      });
      await p.reload();
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      const after = await p.evaluate(async () => {
        await VideoWorkbench.ready;
        return { assets: await VideoWorkbench.assets.list(), projects: await VideoWorkbench.projects.list() };
      });
      const uploaded = after.assets.find((a) => a.name === "帳冊測試.png");
      assert(uploaded, "上傳的素材在清掉 localStorage 後消失");
      assert(after.projects.some((x) => x.id === "ledger-project"), "專案在清掉 localStorage 後消失");
      assert.deepEqual(uploaded.origin, { kind: "upload", rightsConfirmed: false });
      assert(stateOf(dataDir).assets.some((a) => a.name === "帳冊測試.png"));
      console.log("PASS 清掉 localStorage 重新載入，素材與專案清單仍在（伺服器 state.json）；上傳素材 origin=upload");
      await context.close();
    }

    // 2. Migration of pre-server localStorage data, then 3. two tabs on the same server.
    {
      const { base, dataDir } = await isolatedServer("vw-media-ledger-b-");
      const context = await browser.newContext();
      const seed = await context.newPage();
      await seed.goto(base + "/assets/test-image-1.png");
      const legacy = JSON.stringify({
        version: 1,
        characters: [],
        projects: [{ id: "old-project", title: "舊專案", type: "single", assets: [{ id: "old-embedded", kind: "image", url: "/assets/test-image-2.png" }], episodes: [] }],
        assets: [{ id: "old-asset", kind: "image", name: "舊圖", url: "/assets/test-image-1.png" }],
        jobs: [],
        preferences: {},
        selection: {},
      });
      await seed.evaluate((v) => localStorage.setItem("vw.app.v1", v), legacy);
      await seed.close();
      assert(!fs.existsSync(path.join(dataDir, "state.json")));
      const a = await open(context, base);
      a.on("pageerror", (e) => errors.push(e.message));
      const backups = await a.evaluate(async () => {
        await VideoWorkbench.flush();
        return Object.keys(localStorage)
          .filter((k) => k.startsWith("vw.app.v1.pre-server-"))
          .map((k) => localStorage.getItem(k));
      });
      assert.deepEqual(backups, [legacy], "原版 localStorage 沒有另存為 pre-server- 備份");
      const migrated = stateOf(dataDir);
      assert(migrated.projects.some((x) => x.id === "old-project"));
      assert.deepEqual(migrated.assets.find((x) => x.id === "old-asset").origin, { kind: "import", legacy: true });
      assert.deepEqual(migrated.projects.find((x) => x.id === "old-project").assets[0].origin, { kind: "import", legacy: true });
      console.log("PASS 舊 localStorage 資料遷移到伺服器，原版另存 pre-server- 備份，舊素材 origin=import/legacy");

      const b = await open(context, base);
      b.on("pageerror", (e) => errors.push(e.message));
      await a.evaluate(async () => {
        await VideoWorkbench.projects.save({ id: "from-a", title: "A 分頁", type: "single" });
        await VideoWorkbench.flush();
      });
      const result = await b.evaluate(async () => {
        try {
          await VideoWorkbench.projects.save({ id: "from-b", title: "B 分頁", type: "single" });
          return "saved";
        } catch (e) {
          return e.message;
        }
      });
      assert.match(result, /另一個分頁已更新/);
      await b.locator("#service-error").filter({ hasText: "另一個分頁已更新" }).waitFor();
      const server = stateOf(dataDir), bProjects = await b.evaluate(() => VideoWorkbench.projects.list());
      assert(server.projects.some((x) => x.id === "from-a") && !server.projects.some((x) => x.id === "from-b"));
      assert(bProjects.some((x) => x.id === "from-a") && !bProjects.some((x) => x.id === "from-b"));
      console.log("PASS 兩個分頁：B 用舊 revision 寫入得 409，載入 A 的最新資料，未覆蓋 A");
      await context.close();
    }

    // 4. Server-side origins, idempotency, retry and cancel, with a fake provider (never a real one).
    {
      let imageCalls = 0;
      const fakeProvider = async (url, options) => {
        const body = JSON.parse(options.body || "{}");
        if (url.endsWith("/images/generations")) {
          if (body.prompt.includes("HANG"))
            return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(Error("aborted"))));
          if (body.prompt.includes("FAIL")) throw Error("fake provider failure");
          imageCalls++;
          return Response.json({ data: [{ b64_json: png.toString("base64") }] });
        }
        throw Error("unexpected provider call " + url);
      };
      const { base, dataDir } = await isolatedServer("vw-media-ledger-c-", { fetchImpl: fakeProvider });
      const call = async (route, body, method = body === undefined ? "GET" : "POST") => {
        const r = await fetch(base + "/api/vw" + route, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: r.status, json: await r.json() };
      };
      const settle = async (id, statuses) => {
        for (let i = 0; i < 100; i++) {
          const { json } = await call("/generations/" + id);
          if (statuses.includes(json.status)) return json;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw Error("job " + id + " never reached " + statuses);
      };

      const upload = await call("/uploads", { name: "u.png", data: "data:image/png;base64," + png.toString("base64") });
      assert.equal(upload.status, 201);
      assert.deepEqual(upload.json.origin, { kind: "upload", rightsConfirmed: false });
      console.log("PASS /uploads 回傳 origin {kind:upload, rightsConfirmed:false}");

      const first = await call("/generations", { type: "image", prompt: "一顆球", idempotencyKey: "ledger-key-1" });
      const again = await call("/generations", { type: "image", prompt: "一顆球", idempotencyKey: "ledger-key-1" });
      assert.equal(first.status, 202);
      assert.equal(again.status, 200);
      assert.equal(again.json.id, first.json.id);
      const done = await settle(first.json.id, ["succeeded", "failed"]);
      assert.equal(done.status, "succeeded", done.error);
      // costUsd since 9465bbc8c (api.cjs imageUsd): the fake reply has no usage, so the price is the model's per-image estimate.
      const costUsd = require("../backend/provider-cost.cjs").imageUsd("gpt-image-2.5-flare");
      assert(costUsd > 0);
      assert.deepEqual(done.result.origin, { kind: "ai_generated", model: "gpt-image-2.5-flare", provider: "OpenAI", costUsd });
      const ledger = JSON.parse(fs.readFileSync(path.join(dataDir, "jobs.json"), "utf8"));
      assert.equal(ledger.filter((j) => j.idempotencyKey === "ledger-key-1").length, 1);
      assert.equal(imageCalls, 1);
      assert.equal("idempotencyKey" in done.input, false);
      console.log("PASS 同一 idempotencyKey 送兩次只有一筆任務、供應商只被呼叫一次；完成結果帶 ai_generated origin");

      assert.equal((await call("/generations/" + first.json.id + "/retry", {})).status, 409);
      const failed = await call("/generations", { type: "image", prompt: "FAIL 測試" });
      assert.equal((await settle(failed.json.id, ["failed"])).status, "failed");
      const retried = await call("/generations/" + failed.json.id + "/retry", {});
      assert.equal(retried.status, 202);
      assert.notEqual(retried.json.id, failed.json.id);
      assert.equal(retried.json.retryOf, failed.json.id);
      console.log("PASS retry：succeeded 回 409；failed 建新任務（新 id、retryOf 指向原任務）回 202");

      const hanging = await call("/generations", { type: "image", prompt: "HANG 測試" });
      await settle(hanging.json.id, ["running"]);
      assert.equal((await call("/generations/" + hanging.json.id + "/retry", {})).status, 409);
      const cancelled = await call("/generations/" + hanging.json.id + "/cancel", {});
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.json.status, "cancelled");
      await new Promise((r) => setTimeout(r, 300));
      assert.equal((await call("/generations/" + hanging.json.id)).json.status, "cancelled");
      const afterCancel = await call("/generations/" + hanging.json.id + "/retry", {});
      assert.equal(afterCancel.status, 202);
      assert.equal(afterCancel.json.retryOf, hanging.json.id);
      console.log("PASS 執行中任務：retry 回 409；取消後狀態維持 cancelled（不被改成 failed）；取消後可 retry");
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
