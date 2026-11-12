// Card ED.12.3 AI 畫質增強 (backend/video-enhance.cjs): the 驗收閘 the backend owns. One price: next-admin cost-model.ts
// VIDEO_ENHANCE_RATES is the number provider-cost.cjs charges and /capabilities shows. The job uploads the source to
// Replicate's Files API, runs topazlabs/video-upscale, keeps the result and prices it by output seconds; a refused
// input or missing key is answered before any provider call; a failed prediction leaves no result and no cost; cancel
// stops Replicate billing; the job asks the video.enhance permit. The charge is the run's reported units; none reported =
// the estimate, logged. The source goes as a data: URI, so it is capped at 20MB. Fake Replicate only: no paid API.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static");
const { isolatedServer } = require("./isolated-server.cjs");
const { resolveSource } = require("../backend/appearance.cjs");
const costs = require("../backend/provider-cost.cjs");
const mainSystem = require("../backend/main-system.cjs");
const { VIDEO_ENHANCE_RATES, videoEnhanceUsd } = require(path.join(resolveSource(path.join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));
const pass = (m) => console.log("PASS " + m);
const mp4 = (file, size, seconds) => {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", `testsrc=s=${size}:r=30:d=${seconds}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", file], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
};
const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vw-ed123-"));
mp4(path.join(tmp, "out.mp4"), "1920x1080", 3);
const out = fs.readFileSync(path.join(tmp, "out.mp4"));
// Fake Replicate: status = what every poll answers ("processing" keeps a job running for the cancel case).
function fakeReplicate({ status = "succeeded", units = 3, pollError = false } = {}) {
  const calls = [];
  let n = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body });
    if (url === "https://api.replicate.com/v1/models/topazlabs/video-upscale/predictions") return Response.json({ id: "up-" + ++n, status: "starting" });
    const cancel = /^https:\/\/api\.replicate\.com\/v1\/predictions\/(up-\d+)\/cancel$/.exec(url);
    if (cancel) return Response.json({ id: cancel[1], status: "canceled" });
    const poll = /^https:\/\/api\.replicate\.com\/v1\/predictions\/(up-\d+)$/.exec(url);
    if (poll && pollError) throw TypeError("fetch failed");
    if (poll)
      return Response.json(status === "succeeded" ? { id: poll[1], status, output: "https://replicate.delivery/x/up.mp4", metrics: units === null ? { predict_time: 9 } : { predict_time: 9, unspecified_billing_metric: units } } : status === "failed" ? { id: poll[1], status, error: "測試失敗" } : { id: poll[1], status });
    if (url === "https://replicate.delivery/x/up.mp4") return new Response(out);
    throw Error("未預期的網路請求：" + url);
  };
  return { calls, fetchImpl };
}
const env = { REPLICATE_API_TOKEN: "test-only-replicate", VW_ENHANCE_POLL_MS: "20" };
async function server(fake, extraEnv = env) {
  const s = await isolatedServer("vw-ed123-", { fetchImpl: fake.fetchImpl, env: extraEnv });
  const name = crypto.randomUUID() + ".mp4";
  mp4(path.join(s.dataDir, "generated", name), "640x360", 2);
  const call = async (route, body, method = body === undefined ? "GET" : "POST") => {
    const r = await fetch(s.base + "/api/vw" + route, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { ...s, call, src: "/generated/" + name };
}
const job = (src, resolution = "720P") => ({ type: "video", operation: "enhance", references: { src: { id: "asset-1", url: src } }, settings: { enhanceType: "畫面", enhanceOption: "AI 大模型增強", enhanceResolution: resolution } });
const settle = async (call, id) => {
  for (let i = 0; i < 200; i++) {
    const { body } = await call("/generations/" + id);
    if (!["queued", "running"].includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("job did not finish");
};

(async () => {
  // 1. One price: cost-model.ts videoEnhanceUsd is the charge (reported units x usdPerUnit) and the estimate
  //    (max(minUnits, ceil(seconds x unitsPerSec))); provider-cost.cjs and /capabilities only read it.
  {
    assert.deepEqual(Object.keys(VIDEO_ENHANCE_RATES.resolutions), ["720P", "1080P", "4K"]);
    for (const r of Object.keys(VIDEO_ENHANCE_RATES.resolutions))
      for (const [sec, units] of [[0, undefined], [1, undefined], [3, undefined], [10, undefined], [60, undefined], [3, 5]])
        assert.equal(costs.enhanceUsd(r, sec, units), videoEnhanceUsd(r, sec, units), r + " " + sec + "s 扣點與 cost-model.ts 不同");
    assert.equal(costs.enhanceUsd("720P", 3, 5), 5 * VIDEO_ENHANCE_RATES.usdPerUnit);
    // The measured runs (2026-11-13): 1 s / 3 s to 720p and 3 s to 1080p each billed 2 units; the estimate covers them.
    for (const [r, sec] of [["720P", 1], ["720P", 3], ["1080P", 3]]) assert.ok(costs.enhanceUsd(r, sec) >= 2 * VIDEO_ENHANCE_RATES.usdPerUnit, "估價低於實測：" + r + " " + sec + "s");
    assert.throws(() => costs.priceOf("enhance", "2K"), /尚無價目/);
    const own = fs.readFileSync(path.join(__dirname, "../backend/provider-cost.cjs"), "utf8").match(/function enhanceUsd[\s\S]*?\n}/)[0];
    assert.equal(/\d\.\d/.test(own), false, "provider-cost.cjs 自己寫了單價");
    const { base } = await isolatedServer("vw-ed123-caps-", { env });
    const caps = await (await fetch(base + "/api/vw/capabilities")).json();
    assert.deepEqual(caps.prices["video.enhance"], { usd: VIDEO_ENHANCE_RATES.minUnits * VIDEO_ENHANCE_RATES.usdPerUnit, unit: "次起", estimate: true });
    pass("單價只有一處：cost-model.ts＝扣點＝估價＝/capabilities；估價不低於實測");
  }
  // 2. The permit key and ledger kind; the free ffmpeg enhance stays free.
  {
    assert.equal(mainSystem.paidFeature(job("/x"), "video"), "video.enhance");
    assert.equal(mainSystem.ledgerKind({ type: "video", input: job("/x") }), "video");
    assert.equal(mainSystem.paidFeature({ operation: "enhance", settings: { enhanceType: "音訊", enhanceOption: "人聲降噪" } }, "video"), null);
    pass("權限鍵 video.enhance；音訊增強仍免費");
  }
  // 3. Success: quote = the estimate for the source's seconds; the source goes as a data: URI; the result is kept and
  //    charged the reported units. A run without units is charged the estimate (logged).
  {
    const fake = fakeReplicate();
    const { call, src, dataDir } = await server(fake);
    const quote = await call("/generations/quote", job(src, "1080P"));
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    assert.equal(quote.body.costUsd, costs.enhanceUsd("1080P", 2));
    const sent = await call("/generations", job(src, "1080P"));
    assert.equal(sent.status, 202, JSON.stringify(sent.body));
    const done = await settle(call, sent.body.id);
    assert.equal(done.status, "succeeded", done.error);
    const create = JSON.parse(fake.calls.find((c) => c.url.endsWith("/video-upscale/predictions")).body);
    assert.match(create.input.video, /^data:video\/mp4;base64,/);
    assert.deepEqual({ ...create.input, video: "-" }, { video: "-", target_resolution: "1080p", target_fps: 30 });
    assert.deepEqual(fs.readFileSync(path.join(dataDir, done.result.url.slice(1))), out);
    assert.equal(done.result.height, 1080);
    assert.ok(Math.abs(done.result.duration - 3) < 0.1);
    assert.deepEqual(done.result.origin, { kind: "ai_generated", model: "topazlabs/video-upscale", provider: "Replicate", parentAssetId: "asset-1", costUsd: 3 * VIDEO_ENHANCE_RATES.usdPerUnit });
    const unreported = await server(fakeReplicate({ units: null }));
    const logged = [], error = console.error;
    console.error = (...a) => logged.push(a.join(" "));
    const est = await settle(unreported.call, (await unreported.call("/generations", job(unreported.src, "1080P"))).body.id);
    console.error = error;
    assert.equal(est.result.origin.costUsd, costs.enhanceUsd("1080P", est.result.duration));
    assert.ok(logged.some((l) => l.includes("沒有回報 units")), "沒有記錄以估價扣點");
    pass("成功：報價＝估價；data URI 送出；成果存檔；扣點＝實際 units，沒回報就用估價並記 log");
  }
  // 4. Refused before any provider call: unpriced resolution, missing key (503 = never sent), non-video source.
  {
    const fake = fakeReplicate();
    const { call, src, dataDir: dataDir4 } = await server(fake);
    assert.equal((await call("/generations", job(src, "2K"))).status, 400);
    assert.equal((await call("/generations", { ...job(src), references: { src: { url: "/generated/" + crypto.randomUUID() + ".mp4" } } })).status, 400);
    // Over 20MB (a data: URI is a third larger again): refused by the quote and by the send, before any provider call.
    const big = "/generated/" + crypto.randomUUID() + ".mp4";
    fs.writeFileSync(path.join(dataDir4, big.slice(1)), Buffer.alloc(20 * 1024 ** 2 + 1));
    for (const route of ["/generations/quote", "/generations"]) {
      const r = await call(route, job(big));
      assert.equal(r.status, 400, route);
      assert.match(r.body.error.message, /最大 20MB/, route);
    }
    const keyless = fakeReplicate(),
      noKey = await server(keyless, { VW_ENHANCE_POLL_MS: "20" });
    assert.equal((await noKey.call("/generations", job(noKey.src))).status, 503);
    assert.deepEqual([...fake.calls, ...keyless.calls], []);
    pass("2K、找不到的來源、超過 20MB、沒有金鑰：送出前就拒絕，沒有呼叫供應商");
  }
  // 5. A failed prediction: job failed, no result, no cost.
  {
    const fake = fakeReplicate({ status: "failed" });
    const { call, src } = await server(fake);
    const done = await settle(call, (await call("/generations", job(src))).body.id);
    assert.equal(done.status, "failed");
    assert.match(done.error, /畫質增強失敗/);
    assert.equal(done.result?.origin?.costUsd, undefined);
    pass("供應商失敗：任務失敗、沒有成果、沒有費用");
  }
  // 6. Cancel while running: Replicate is told to stop billing.
  {
    const fake = fakeReplicate({ status: "processing" });
    const { call, src } = await server(fake);
    const id = (await call("/generations", job(src))).body.id;
    for (let i = 0; i < 100 && !fake.calls.some((c) => c.url.endsWith("/predictions/up-1")); i++) await new Promise((r) => setTimeout(r, 20));
    const cancelled = await call("/generations/" + id + "/cancel", {});
    assert.equal(cancelled.body.status, "cancelled");
    for (let i = 0; i < 50 && !fake.calls.some((c) => c.url.endsWith("/up-1/cancel")); i++) await new Promise((r) => setTimeout(r, 20));
    assert.ok(fake.calls.some((c) => c.url === "https://api.replicate.com/v1/predictions/up-1/cancel" && c.method === "POST"), "取消沒有通知 Replicate");
    assert.equal((await call("/generations/" + id)).body.result?.origin?.costUsd, undefined);
    pass("取消：通知 Replicate 停止計費，沒有費用");
  }
  // 7. One vendor run is charged to one job: a second job for the same source while the first still runs gets its own
  //    prediction; a poll that breaks stops the vendor run; a restart stops a run nothing polls any more.
  {
    const fake = fakeReplicate({ status: "processing" });
    const { call, src, dataDir, server: first } = await server(fake);
    const a = (await call("/generations", job(src))).body.id;
    for (let i = 0; i < 100 && !fake.calls.some((c) => c.url.endsWith("/predictions/up-1")); i++) await new Promise((r) => setTimeout(r, 20));
    await call("/generations", job(src));
    for (let i = 0; i < 100 && fake.calls.filter((c) => c.url.endsWith("/video-upscale/predictions")).length < 2; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(fake.calls.filter((c) => c.url.endsWith("/video-upscale/predictions")).length, 2, "第二個任務共用了執行中的 prediction");
    // Restart on the same data: both running jobs fail and Replicate is told to stop both runs.
    first.close();
    const again = require("../server.cjs").createServer({ dataDir, env: { OPENAI_API_KEY: "test-only", ...env }, fetchImpl: fake.fetchImpl });
    for (let i = 0; i < 50 && fake.calls.filter((c) => c.url.endsWith("/cancel")).length < 2; i++) await new Promise((r) => setTimeout(r, 20));
    for (const id of ["up-1", "up-2"]) assert.ok(fake.calls.some((c) => c.url === "https://api.replicate.com/v1/predictions/" + id + "/cancel" && c.method === "POST"), "重啟後沒有停止 " + id);
    await new Promise((r) => again.listen(0, "127.0.0.1", r));
    const after = await (await fetch("http://127.0.0.1:" + again.address().port + "/api/vw/generations/" + a)).json();
    assert.equal(after.status, "failed");
    again.close();
    const broken = fakeReplicate({ pollError: true });
    const b = await server(broken);
    const done = await settle(b.call, (await b.call("/generations", job(b.src))).body.id);
    assert.equal(done.status, "failed");
    assert.ok(broken.calls.some((c) => c.url === "https://api.replicate.com/v1/predictions/up-1/cancel"), "輪詢中斷沒有停止供應商任務");
    pass("一次供應商運算只算一個任務；輪詢中斷、服務重啟都會停止供應商計費");
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
