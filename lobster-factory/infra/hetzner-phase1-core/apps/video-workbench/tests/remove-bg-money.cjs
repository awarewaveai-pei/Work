// Card S3a money paths (Codex 2026-11-02): one image is never paid for twice, a cancel stops Replicate billing, an
// oversized reply is cut off while streaming, and a finished job becomes an asset even if its panel was closed.
// Fake fetchImpl only; no real Replicate call.
const assert = require("node:assert/strict"), path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { isolatedServer } = require("./isolated-server.cjs");

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64");
const env = { REPLICATE_API_TOKEN: "test-only-replicate" };
const api = (base) => async (route, body) => {
  const r = await fetch(base + "/api/vw" + route, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const settle = async (call, id) => {
  for (let i = 0; i < 200; i++) {
    const { body } = await call("/generations/" + id);
    if (!["queued", "running"].includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("job did not finish");
};

(async () => {
  // 1. Cancel while Replicate works -> its cancel endpoint is called; a resend of the same image resumes the same
  //    prediction instead of creating a second one.
  {
    let state = "processing";
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push((init.method || "GET") + " " + url);
      if (url === "https://api.replicate.com/v1/predictions") return Response.json({ id: "pred-a", status: "processing" });
      if (url === "https://api.replicate.com/v1/predictions/pred-a/cancel") return Response.json({ id: "pred-a", status: "canceling" });
      if (url === "https://api.replicate.com/v1/predictions/pred-a") return Response.json({ id: "pred-a", status: state, output: "https://replicate.delivery/fake/a.png" });
      if (url === "https://replicate.delivery/fake/a.png") return new Response(png);
      throw Error("unexpected " + url);
    };
    const { base } = await isolatedServer("vw-rbg-money-a-", { fetchImpl, env });
    const call = api(base);
    const upload = await call("/uploads", { name: "a.png", data: "data:image/png;base64," + png.toString("base64") });
    const first = await call("/tools/remove-bg", { url: upload.body.url });
    for (let i = 0; i < 50 && !calls.includes("POST https://api.replicate.com/v1/predictions"); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 100));
    const cancelled = await call("/generations/" + first.body.id + "/cancel", {});
    assert.equal(cancelled.body.status, "cancelled");
    for (let i = 0; i < 40 && !calls.some((c) => c.endsWith("/pred-a/cancel")); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(calls.includes("POST https://api.replicate.com/v1/predictions/pred-a/cancel"), calls.join("\n"));
    state = "succeeded";
    const again = await call("/tools/remove-bg", { url: upload.body.url });
    const job = await settle(call, again.body.id);
    assert.equal(job.status, "succeeded", job.error);
    assert.equal(calls.filter((c) => c === "POST https://api.replicate.com/v1/predictions").length, 1, calls.join("\n"));
    console.log("PASS 取消時通知 Replicate 停止；同一張圖再送出時接回原 prediction，只建立 1 次（只付 1 次）");
  }

  // 2. Oversized reply without Content-Length is stopped while streaming.
  {
    const big = new ReadableStream({
      start(c) {
        c.enqueue(png);
        for (let i = 0; i < 22; i++) c.enqueue(new Uint8Array(1024 * 1024));
        c.close();
      },
    });
    const fetchImpl = async (url) => {
      if (url === "https://api.replicate.com/v1/predictions") return Response.json({ id: "pred-b", status: "succeeded", output: "https://replicate.delivery/fake/b.png" });
      if (url === "https://replicate.delivery/fake/b.png") return new Response(big);
      throw Error("unexpected " + url);
    };
    const { base } = await isolatedServer("vw-rbg-money-b-", { fetchImpl, env });
    const call = api(base);
    const upload = await call("/uploads", { name: "b.png", data: "data:image/png;base64," + png.toString("base64") });
    const job = await settle(call, (await call("/tools/remove-bg", { url: upload.body.url })).body.id);
    assert.equal(job.status, "failed");
    assert.match(job.error, /20MB/);
    console.log("PASS 沒有 Content-Length 的超大回覆在下載途中被截斷（失敗並說明 20MB）");
  }

  // 3. Panel closed before the job finished: the next page load turns the finished job into an asset.
  {
    let release;
    const gate = new Promise((r) => (release = r));
    const fetchImpl = async (url) => {
      if (url === "https://api.replicate.com/v1/predictions") {
        await gate;
        return Response.json({ id: "pred-c", status: "succeeded", output: "https://replicate.delivery/fake/c.png" });
      }
      if (url === "https://replicate.delivery/fake/c.png") return new Response(png);
      throw Error("unexpected " + url);
    };
    const { base } = await isolatedServer("vw-rbg-money-c-", { fetchImpl, env });
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(base + "/");
      await page.waitForFunction(() => window.VideoWorkbench?.assets);
      const jobId = await page.evaluate(async (data) => {
        const asset = await VideoWorkbench.request("/uploads", { name: "c.png", data });
        await VideoWorkbench.assets.save(asset);
        const job = await VideoWorkbench.generations.create({ type: "image", operation: "remove-bg", prompt: "去背", references: { src: { id: asset.id, url: asset.url } } });
        await VideoWorkbench.flush();
        return job.id;
      }, "data:image/png;base64," + png.toString("base64"));
      await page.close();
      release();
      await settle(api(base), jobId);
      const again = await browser.newPage();
      await again.goto(base + "/");
      await again.waitForFunction((id) => window.VideoWorkbench && VideoWorkbench.assets.list().then((a) => a.some((x) => x.id === "job-" + id)), jobId, { timeout: 20000 });
      const saved = await again.evaluate((id) => VideoWorkbench.assets.list().then((a) => a.find((x) => x.id === "job-" + id)), jobId);
      assert.equal(saved.origin.provider, "Replicate");
      console.log("PASS 任務視窗關掉後完成的去背，下次開頁自動成為素材（含來源）");
    } finally {
      await browser.close();
    }
  }

  // 4-5. replicate-run.cjs: one Replicate run is charged to at most one job; an abandoned run is cancelled.
  const fakeRuns = () => {
    const state = {}, calls = [];
    let n = 0, deliveryOk = true, pollError = false;
    const fetchImpl = async (url, init = {}) => {
      calls.push((init.method || "GET") + " " + url);
      if (url === "https://api.replicate.com/v1/predictions") {
        const id = "pred-" + ++n;
        state[id] = "processing";
        return Response.json({ id, status: "processing" });
      }
      const cancel = /\/predictions\/(pred-\d+)\/cancel$/.exec(url);
      if (cancel) return Response.json({ id: cancel[1], status: "canceling" });
      const poll = /\/predictions\/(pred-\d+)$/.exec(url);
      if (poll) {
        if (pollError) throw Error("connection reset");
        return Response.json({ id: poll[1], status: state[poll[1]], output: "https://replicate.delivery/fake/" + poll[1] + ".png", metrics: { predict_time: 1 } });
      }
      if (url.startsWith("https://replicate.delivery/fake/")) return deliveryOk ? new Response(png) : new Response("", { status: 500 });
      throw Error("unexpected " + url);
    };
    const set = (o) => {
      if ("deliveryOk" in o) deliveryOk = o.deliveryOk;
      if ("pollError" in o) pollError = o.pollError;
    };
    return { state, calls, fetchImpl, set };
  };
  const fastEnv = { ...env, VW_BG_REMOVE_POLL_MS: "20" };
  const until = async (test) => {
    for (let i = 0; i < 200 && !test(); i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(test(), "timed out waiting");
  };
  const creates = (calls) => calls.filter((c) => c === "POST https://api.replicate.com/v1/predictions").length;
  {
    const fake = fakeRuns();
    const { base } = await isolatedServer("vw-rbg-money-d-", { fetchImpl: fake.fetchImpl, env: fastEnv });
    const call = api(base);
    const upload = await call("/uploads", { name: "d.png", data: "data:image/png;base64," + png.toString("base64") });
    // A running job's run is never shared: a second send gets its own prediction.
    const a = (await call("/tools/remove-bg", { url: upload.body.url })).body.id;
    await until(() => creates(fake.calls) === 1);
    const b = (await call("/tools/remove-bg", { url: upload.body.url })).body.id;
    await until(() => creates(fake.calls) === 2);
    // Both runs finish, but the download breaks: two failed jobs, each holding a run Replicate already finished.
    fake.set({ deliveryOk: false });
    fake.state["pred-1"] = fake.state["pred-2"] = "succeeded";
    assert.equal((await settle(call, a)).status, "failed");
    assert.equal((await settle(call, b)).status, "failed");
    // Three jobs sent at once: two take over pred-1 and pred-2 (one each), the third pays for a new run.
    fake.set({ deliveryOk: true });
    const sent = await Promise.all([1, 2, 3].map(() => call("/tools/remove-bg", { url: upload.body.url })));
    await until(() => creates(fake.calls) === 3);
    fake.state["pred-3"] = "succeeded";
    const done = await Promise.all(sent.map((s) => settle(call, s.body.id)));
    for (const job of done) assert.equal(job.status, "succeeded", job.error);
    const used = done.map((j) => j.replicateId).sort();
    assert.deepEqual(used, ["pred-1", "pred-2", "pred-3"], "同一次供應商運算被兩個任務接手（重複扣點）：" + used.join(","));
    console.log("PASS 同時送出：執行中的運算不共用；失敗任務留下的運算只被一個任務接手，每次運算最多扣一次點");
  }
  {
    // Lost connection while polling -> the run is cancelled at Replicate.
    const fake = fakeRuns();
    const { base } = await isolatedServer("vw-rbg-money-e-", { fetchImpl: fake.fetchImpl, env: fastEnv });
    const call = api(base);
    const upload = await call("/uploads", { name: "e.png", data: "data:image/png;base64," + png.toString("base64") });
    const id = (await call("/tools/remove-bg", { url: upload.body.url })).body.id;
    await until(() => creates(fake.calls) === 1);
    fake.set({ pollError: true });
    assert.equal((await settle(call, id)).status, "failed");
    assert.ok(fake.calls.includes("POST https://api.replicate.com/v1/predictions/pred-1/cancel"), "輪詢中斷沒有停止供應商任務");
    // Restart while a run is in progress -> the restarted server cancels it (nothing polls it any more).
    fake.set({ pollError: false });
    const { base: base2, dataDir, server } = await isolatedServer("vw-rbg-money-f-", { fetchImpl: fake.fetchImpl, env: fastEnv });
    const call2 = api(base2);
    const upload2 = await call2("/uploads", { name: "f.png", data: "data:image/png;base64," + png.toString("base64") });
    await call2("/tools/remove-bg", { url: upload2.body.url });
    await until(() => creates(fake.calls) === 2);
    server.close();
    require("../server.cjs").createServer({ dataDir, env: { OPENAI_API_KEY: "test-only", ...fastEnv }, fetchImpl: fake.fetchImpl });
    await until(() => fake.calls.includes("POST https://api.replicate.com/v1/predictions/pred-2/cancel"));
    console.log("PASS 輪詢中斷、服務重啟：去背的供應商運算都會被取消");
  }
  process.exit(0);
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
