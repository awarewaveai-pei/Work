// Card S3a (docs/creative-suite-plan-20261102.md §4): background removal through Replicate with the same pinned version
// and price as next-admin, run as a job, saved as a new asset whose origin names the model, provider, parent and cost.
// The provider is a fake fetchImpl; no real Replicate call.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const nextAdmin = path.join(__dirname, "../../next-admin/lib");
const version = /BG_REMOVER_VERSION_DEFAULT\s*=\s*"([0-9a-f]{64})"/.exec(fs.readFileSync(path.join(nextAdmin, "studio/bg-remover.ts"), "utf8"))[1];
const cost = Number(/"bg-remove":\s*\{\s*usd:\s*([\d.]+)/.exec(fs.readFileSync(path.join(nextAdmin, "ai/cost-model.ts"), "utf8"))[1]);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64");
const cutout = Buffer.concat([png, Buffer.from("cutout")]);
const origin = (parentAssetId) => ({ kind: "ai_generated", model: "851-labs/background-remover:" + version.slice(0, 12), provider: "Replicate", parentAssetId, costUsd: cost });

function fakeReplicate() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", headers: init.headers, body: init.body });
    if (url === "https://api.replicate.com/v1/predictions") return Response.json({ id: "pred-1", status: "processing" });
    if (url.startsWith("https://api.replicate.com/v1/predictions/")) return Response.json({ id: "pred-1", status: "succeeded", output: "https://replicate.delivery/fake/out.png" });
    if (url === "https://replicate.delivery/fake/out.png") return new Response(cutout);
    throw Error("unexpected provider url " + url);
  };
  return { calls, fetchImpl };
}
const api = (base) => async (route, body, method = body === undefined ? "GET" : "POST") => {
  const r = await fetch(base + "/api/vw" + route, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const settle = async (call, id) => {
  for (let i = 0; i < 100; i++) {
    const { body } = await call("/generations/" + id);
    if (!["queued", "running"].includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("job did not finish");
};

(async () => {
  // 1. Job path: version and input fields as bg-remover.ts, PNG saved under /generated, origin complete, key replays.
  {
    const fake = fakeReplicate();
    const { base, dataDir } = await isolatedServer("vw-remove-bg-a-", { fetchImpl: fake.fetchImpl, env: { REPLICATE_API_TOKEN: "test-only-replicate" } });
    const call = api(base);
    const upload = await call("/uploads", { name: "人物.png", data: "data:image/png;base64," + png.toString("base64") });
    assert.equal(upload.status, 201);
    const caps = (await call("/capabilities")).body;
    assert.equal(caps.toolCosts.removeBackground, cost, "capabilities 的去背價格與 next-admin cost-model.ts 不一致");
    assert.equal(caps.removeBackground, true);
    const sent = await call("/tools/remove-bg", { url: upload.body.url, parentAssetId: "asset-parent", idempotencyKey: "remove-bg-key-1" });
    assert.equal(sent.status, 202);
    const job = await settle(call, sent.body.id);
    assert.equal(job.status, "succeeded", job.error);
    assert.match(job.result.url, /^\/generated\/[a-f0-9-]+\.png$/);
    assert.deepEqual(fs.readFileSync(path.join(dataDir, job.result.url.slice(1))), cutout);
    assert.deepEqual(job.result.origin, origin("asset-parent"));
    const create = fake.calls.find((c) => c.url === "https://api.replicate.com/v1/predictions"), input = JSON.parse(create.body);
    assert.equal(input.version, version, "送出的版本與 bg-remover.ts:12 不同");
    assert.equal(input.input.format, "png");
    assert.equal(input.input.background_type, "rgba");
    assert.match(input.input.image, /^data:image\/png;base64,/);
    assert.equal(create.headers.Authorization, "Bearer test-only-replicate");
    const before = fake.calls.length, replay = await call("/tools/remove-bg", { url: upload.body.url, parentAssetId: "asset-parent", idempotencyKey: "remove-bg-key-1" });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.id, job.id);
    assert.equal(fake.calls.length, before, "同一個 idempotencyKey 又呼叫了供應商");
    assert((JSON.parse(fs.readFileSync(path.join(dataDir, "jobs.json"), "utf8"))).some((j) => j.id === job.id && j.input.operation === "remove-bg"), "去背任務沒有進任務紀錄");
    const outside = await call("/tools/remove-bg", { url: "https://example.com/a.png" });
    assert.equal(outside.status, 400);
    console.log("PASS 去背：版本 " + version.slice(0, 12) + "、PNG 存入 /generated、origin 含 model/provider/parentAssetId/costUsd、同 key 不重送");

    // 2. UI: the asset library button shows the price before the click; the result becomes a new library asset.
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const p = await browser.newPage(), errors = [];
      p.setDefaultTimeout(20000);
      p.on("pageerror", (e) => errors.push(e.message));
      await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
      await p.goto(base);
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      await p.locator("#assetsNav").click();
      await p.locator("#workspaceUpload").setInputFiles({ name: "去背來源.png", mimeType: "image/png", buffer: png });
      const card = p.locator(".workspace-card").filter({ hasText: "去背來源.png" });
      const button = card.locator("[data-asset-remove-bg]");
      const shown = await p.evaluate((usd) => VideoWorkbenchMoney(usd), cost); // the page's formatter, cost-model.ts price
      assert.match(shown, /^NT\$\d/);
      assert.equal((await button.textContent()).trim(), "去背 · 約 " + shown + "／張");
      await button.click();
      let saved;
      for (let i = 0; i < 100 && !saved; i++, await p.waitForTimeout(200))
        saved = await p.evaluate(async () => {
          const list = await VideoWorkbench.assets.list(), source = list.find((a) => a.name === "去背來源.png");
          const result = list.find((a) => a.origin?.kind === "ai_generated" && a.origin.parentAssetId === source?.id);
          return result ? { result, sourceId: source.id } : null;
        });
      assert(saved, "去背結果沒有存成素材");
      assert.deepEqual(saved.result.origin, origin(saved.sourceId));
      assert.equal(saved.result.kind, "image");
      assert.deepEqual(errors, []);
      console.log("PASS 素材庫按鈕顯示「去背 · 約 " + shown + "／張」，結果存成新素材（origin 指回原素材）");
    } finally {
      await browser.close();
    }
  }

  // 3. No token: 503 before any provider call; capabilities still carry the price.
  {
    let calls = 0;
    const { base } = await isolatedServer("vw-remove-bg-b-", { fetchImpl: async () => { calls++; throw Error("no provider"); } });
    const call = api(base);
    const upload = await call("/uploads", { name: "人物.png", data: "data:image/png;base64," + png.toString("base64") });
    const r = await call("/tools/remove-bg", { url: upload.body.url });
    assert.equal(r.status, 503);
    const viaGenerations = await call("/generations", { type: "image", operation: "remove-bg", references: { src: { url: upload.body.url } } });
    assert.equal(viaGenerations.status, 503);
    assert.equal(calls, 0, "沒有 token 仍呼叫了供應商");
    const caps = (await call("/capabilities")).body;
    assert.equal(caps.removeBackground, false);
    assert.equal(caps.toolCosts.removeBackground, cost);
    console.log("PASS 沒有 REPLICATE_API_TOKEN：503，供應商呼叫 0 次");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
