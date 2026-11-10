// Card RV (docs/replicate-video-models-plan-20261105.md): a video job runs the model it names. Replicate models come
// from next-admin lib/ai/video-motion-models.ts (fields compared with its buildInput, not a copy); sora-2 (shut down
// 2026-09-24) and unknown ids run the default model. Gemini Omni (backend/gemini-video.cjs) is the default when the Gemini
// key is set, Veo 3.1 Fast otherwise (section 8). Fake fetchImpl only, no real provider call.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { isolatedServer } = require("./isolated-server.cjs");
const { resolveSource } = require("../backend/appearance.cjs");

const appDir = resolveSource(path.join(__dirname, ".."), process.env);
const { MOTION_MODELS } = require(path.join(appDir, "lib/ai/video-motion-models.ts"));
const { VIDEO_MOTION_RATES, GEMINI_VIDEO_RATES } = require(path.join(appDir, "lib/ai/cost-model.ts"));
const OMNI = "gemini-omni-1.2-flash";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64");
const mp4 = Buffer.from("fake-mp4-bytes");

function fakeProviders({ replicateStatus = "succeeded", cancelOk = true, statusGate = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", headers: init.headers, body: init.body });
    if (/^https:\/\/api\.replicate\.com\/v1\/models\/.+\/predictions$/.test(url)) return Response.json({ id: "pred-v1", status: "starting" });
    if (url.endsWith("/cancel")) return cancelOk ? Response.json({ id: "pred-v1", status: "canceled" }) : Response.json({ detail: "busy" }, { status: 429 });
    if (url === "https://api.replicate.com/v1/predictions/pred-v1") {
      if (statusGate) await statusGate;
      return Response.json(replicateStatus === "succeeded" ? { id: "pred-v1", status: "succeeded", output: "https://replicate.delivery/x/out.mp4" } : { id: "pred-v1", status: replicateStatus });
    }
    if (url === "https://replicate.delivery/x/out.mp4") return new Response(mp4);
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
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("job did not finish");
};
const video = (model, extra = {}) => ({ type: "video", mode: "reference", prompt: "海邊日出，鏡頭慢慢推近", settings: { model, ratio: "16:9", quality: "720p", duration: extra.duration ?? 5 }, ...extra.input });

(async () => {
  const env = { REPLICATE_API_TOKEN: "test-only-replicate" };
  // 1. capabilities without a Gemini key: Veo 3.1 Fast is the default and first; Omni listed, unavailable.
  {
    const { base } = await isolatedServer("vw-rv-caps-", { fetchImpl: fakeProviders().fetchImpl, env });
    const caps = (await api(base)("/capabilities")).body;
    assert.deepEqual(caps.videoModels.map((m) => m.id), ["veo-3-1-fast", OMNI, ...Object.keys(MOTION_MODELS).filter((id) => id !== "veo-3-1-fast")]);
    assert.equal(caps.models.video, "veo-3-1-fast");
    assert.equal(caps.videoModels[0].requiresImage, false);
    assert.deepEqual(caps.retiredVideoModels, { "sora-2": "Sora 2", "sora-2-pro": "Sora 2 Pro" });
    for (const m of caps.videoModels.filter((m) => m.id !== OMNI)) {
      assert.equal(m.usdPerSec, VIDEO_MOTION_RATES[m.id].usdPerSec, m.id + " 價格與 cost-model.ts 不同");
      assert.equal(m.model, MOTION_MODELS[m.id].slug);
      assert.equal(m.available, true);
    }
    assert.equal(caps.videoModels.find((m) => m.id === OMNI).available, false);
    console.log("PASS capabilities（無 Gemini 金鑰）：預設 Veo 3.1 Fast，Omni 列出但不可用，價格出自 cost-model.ts");
  }
  // 2. Each Replicate model: request body = next-admin buildInput; result saved; origin and cost = rate x seconds.
  for (const [id, m] of Object.entries(MOTION_MODELS)) {
    const fake = fakeProviders();
    const { base, dataDir } = await isolatedServer("vw-rv-" + id + "-", { fetchImpl: fake.fetchImpl, env });
    const call = api(base);
    const seconds = m.defaultDurationSec, ref = "data:image/png;base64," + png.toString("base64");
    const sent = await call("/generations", video(id, { duration: seconds, input: { references: { images: [{ url: ref, type: "image/png" }] } } }));
    assert.equal(sent.status, 202, JSON.stringify(sent.body));
    const job = await settle(call, sent.body.id);
    assert.equal(job.status, "succeeded", job.error);
    const create = fake.calls.find((c) => c.url.includes("/v1/models/"));
    assert.equal(create.url, "https://api.replicate.com/v1/models/" + m.slug + "/predictions");
    const body = JSON.parse(create.body).input;
    const expected = m.buildInput({ imageUrl: body.image || body.start_image, prompt: body.prompt, aspectRatio: "16:9", durationSec: seconds, resolution: "720p" });
    assert.deepEqual(body, expected, id + " 送出的欄位與 video-motion-models.ts buildInput 不同");
    assert.match(body.image || body.start_image, /^data:image\/png;base64,/);
    assert.equal(create.headers.Authorization, "Bearer test-only-replicate");
    assert.deepEqual(fs.readFileSync(path.join(dataDir, job.result.url.slice(1))), mp4);
    assert.deepEqual(job.result.origin, { kind: "ai_generated", model: m.slug, provider: "Replicate", costUsd: Math.round(VIDEO_MOTION_RATES[id].usdPerSec * seconds * 1e6) / 1e6 });
    assert.equal(fake.calls.some((c) => c.url.startsWith("https://api.openai.com")), false, "Replicate 任務呼叫了 OpenAI");
  }
  console.log("PASS 四個 Replicate 模型：送出欄位＝NA buildInput、成品存檔、origin 與成本正確");
  // 3. Old and unknown model values (an old Sora task resent, an old project's value, none) run the default model.
  for (const model of ["sora-2", "VideoWorkbench V3", undefined]) {
    const fake = fakeProviders();
    const { base } = await isolatedServer("vw-rv-sora-", { fetchImpl: fake.fetchImpl, env });
    const call = api(base);
    const sent = await call("/generations", video(model, { duration: 8 }));
    assert.equal(sent.status, 202, JSON.stringify(sent.body));
    const job = await settle(call, sent.body.id);
    assert.equal(job.status, "succeeded", job.error);
    assert.equal(fake.calls.find((c) => c.url.includes("/v1/models/")).url, "https://api.replicate.com/v1/models/" + MOTION_MODELS["veo-3-1-fast"].slug + "/predictions");
    assert.deepEqual(job.result.origin, { kind: "ai_generated", model: MOTION_MODELS["veo-3-1-fast"].slug, provider: "Replicate", costUsd: Math.round(8 * VIDEO_MOTION_RATES["veo-3-1-fast"].usdPerSec * 1e6) / 1e6 });
    assert.equal(fake.calls.some((c) => c.url.startsWith("https://api.openai.com")), false);
  }
  console.log("PASS 舊值 sora-2／VideoWorkbench V3／無值：改用預設 Veo 3.1 Fast，價格照它");
  // 4. Refused before any call: Runway without an image, a length the model lacks, no Replicate token.
  {
    const fake = fakeProviders();
    const { base } = await isolatedServer("vw-rv-refuse-", { fetchImpl: fake.fetchImpl, env });
    const call = api(base);
    const noImage = await call("/generations", video("runway-gen4-turbo"));
    assert.equal(noImage.status, 400);
    assert.match(noImage.body.error.message, /需要一張參考圖/);
    const badLength = await call("/generations", video("luma-ray-3-2", { duration: 8 }));
    assert.equal(badLength.status, 400);
    assert.match(badLength.body.error.message, /支援 5 秒/);
    const { base: noKey } = await isolatedServer("vw-rv-nokey-", { fetchImpl: fake.fetchImpl });
    const missing = await api(noKey)("/generations", video("veo-3-1-fast", { duration: 4 }));
    assert.equal(missing.status, 503);
    assert.equal(fake.calls.length, 0, "被拒的任務呼叫了供應商");
  }
  console.log("PASS 送出前就拒：Runway 沒圖、Luma 8 秒、沒有 Replicate 金鑰，皆未呼叫供應商");
  // 5. Restart keeps polling the same prediction; cancel stops Replicate billing.
  {
    const fake = fakeProviders({ replicateStatus: "processing" });
    const { base, dataDir, server } = await isolatedServer("vw-rv-restart-", { fetchImpl: fake.fetchImpl, env });
    const sent = await api(base)("/generations", video("veo-3-1-fast", { duration: 4 }));
    assert.equal(sent.status, 202);
    for (let i = 0; i < 50 && !JSON.parse(fs.readFileSync(path.join(dataDir, "jobs.json"), "utf8")).find((j) => j.id === sent.body.id)?.providerId; i++) await new Promise((r) => setTimeout(r, 50));
    server.close();
    const again = require("../server.cjs").createServer({ dataDir, env: { OPENAI_API_KEY: "test-only", ...env }, fetchImpl: fake.fetchImpl });
    await new Promise((r) => again.listen(0, "127.0.0.1", r));
    again.unref();
    const call = api("http://127.0.0.1:" + again.address().port);
    const after = (await call("/generations/" + sent.body.id)).body;
    assert.equal(after.status, "running", "重開後任務不是續輪詢：" + after.status + " " + (after.error || ""));
    assert.equal(after.providerId, "pred-v1");
    const cancelled = await call("/generations/" + sent.body.id + "/cancel", {});
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.status, "cancelled");
    for (let i = 0; i < 20 && !fake.calls.some((c) => c.url.endsWith("/predictions/pred-v1/cancel")); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(fake.calls.some((c) => c.url === "https://api.replicate.com/v1/predictions/pred-v1/cancel" && c.method === "POST"), "取消沒有呼叫 Replicate cancel");
  }
  console.log("PASS 重開後續輪詢同一個 Replicate 任務；取消會叫 Replicate 停止計費");
  // 6. Replicate refuses the cancel -> 502 and the job stays running (it is still billing).
  {
    const fake = fakeProviders({ replicateStatus: "processing", cancelOk: false });
    const { base } = await isolatedServer("vw-rv-cancel-refused-", { fetchImpl: fake.fetchImpl, env });
    const call = api(base);
    const sent = await call("/generations", video("veo-3-1-fast", { duration: 4 }));
    let job;
    for (let i = 0; i < 50 && !(job = (await call("/generations/" + sent.body.id)).body).providerId; i++) await new Promise((r) => setTimeout(r, 50));
    const refused = await call("/generations/" + sent.body.id + "/cancel", {});
    assert.equal(refused.status, 502, JSON.stringify(refused.body));
    assert.equal((await call("/generations/" + sent.body.id)).body.status, "running", "Replicate 拒絕取消，任務卻顯示已取消");
  }
  // 7. A cancel during an in-flight poll that answers "succeeded" stays cancelled (no download, no charge).
  {
    let open;
    const gate = new Promise((r) => (open = r));
    const fake = fakeProviders({ statusGate: gate });
    const { base, dataDir } = await isolatedServer("vw-rv-cancel-race-", { fetchImpl: fake.fetchImpl, env });
    const call = api(base);
    const sent = await call("/generations", video("veo-3-1-fast", { duration: 4 }));
    for (let i = 0; i < 50 && !JSON.parse(fs.readFileSync(path.join(dataDir, "jobs.json"), "utf8")).find((j) => j.id === sent.body.id)?.providerId; i++) await new Promise((r) => setTimeout(r, 50));
    const poll = call("/generations/" + sent.body.id);
    await new Promise((r) => setTimeout(r, 100));
    const cancelled = await call("/generations/" + sent.body.id + "/cancel", {});
    assert.equal(cancelled.status, 200);
    open();
    assert.equal((await poll).body.status, "cancelled", "進行中的輪詢蓋掉了取消");
    assert.equal(fake.calls.some((c) => c.url.startsWith("https://replicate.delivery")), false, "已取消仍下載成品");
  }
  console.log("PASS Replicate 拒絕取消時回 502、任務仍在進行；輪詢途中取消不會被蓋成成功");
  // 8. Gemini Omni: default with the key; background interaction body; inline video saved; cost = the reply's usage.
  {
    // usage shaped as Google answered on 2026-11-10 (real 4 s call): video tokens by modality, thinking outside total_output_tokens.
    const usage = { total_input_tokens: 40, total_output_tokens: 46336, total_thought_tokens: 500, output_tokens_by_modality: [{ modality: "video", tokens: 46336 }] };
    let state = "in_progress";
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, method: init.method || "GET", headers: init.headers, body: init.body });
      const g = "https://generativelanguage.googleapis.com/v1beta/interactions";
      if (url === g) return Response.json({ id: "v1_omni", status: "in_progress" });
      if (url === g + "/v1_omni") return Response.json(state === "completed"
        ? { id: "v1_omni", status: "completed", usage, steps: [{ type: "model_output", content: [{ type: "video", mime_type: "video/mp4", data: mp4.toString("base64") }] }] }
        : { id: "v1_omni", status: state });
      if (url === g + "/v1_omni/cancel") return Response.json({ id: "v1_omni", status: "cancelled" });
      throw Error("unexpected provider url " + url);
    };
    const genv = { ...env, GEMINI_API_KEY: "test-only-gemini" };
    const { base, dataDir } = await isolatedServer("vw-rv-omni-", { fetchImpl, env: genv });
    const call = api(base);
    const caps = (await call("/capabilities")).body;
    assert.equal(caps.models.video, OMNI);
    const omni = caps.videoModels[0];
    assert.equal(omni.id, OMNI);
    assert.equal(omni.usdPerSec, Math.round(GEMINI_VIDEO_RATES[OMNI].videoTokensPerSec * GEMINI_VIDEO_RATES[OMNI].outputPerM) / 1e6);
    const ref = "data:image/png;base64," + png.toString("base64");
    const sent = await call("/generations", video(OMNI, { duration: 8, input: { references: { images: [{ url: ref, type: "image/png" }] } } }));
    assert.equal(sent.status, 202, JSON.stringify(sent.body));
    for (let i = 0; i < 50 && !calls.some((c) => c.method === "POST"); i++) await new Promise((r) => setTimeout(r, 50));
    const create = calls.find((c) => c.method === "POST");
    assert.equal(create.headers["x-goog-api-key"], "test-only-gemini");
    assert.deepEqual(JSON.parse(create.body), {
      model: OMNI, background: true,
      input: [{ type: "image", data: png.toString("base64"), mime_type: "image/png" }, { type: "text", text: "海邊日出，鏡頭慢慢推近" }],
      response_format: { type: "video", aspect_ratio: "16:9", duration: "8s", resolution: "720p" },
    });
    assert.equal((await call("/generations/" + sent.body.id)).body.status, "running");
    state = "completed";
    const job = await settle(call, sent.body.id);
    assert.equal(job.status, "succeeded", job.error);
    assert.deepEqual(fs.readFileSync(path.join(dataDir, job.result.url.slice(1))), mp4);
    assert.deepEqual(job.result.origin, { kind: "ai_generated", model: OMNI, provider: "Google", costUsd: Math.round(40 * 1.5 + 46336 * 12 + 500 * 9) / 1e6 });
    // Cancel reaches Google's cancel endpoint.
    state = "in_progress";
    const second = await call("/generations", video(OMNI, { duration: 4 }));
    for (let i = 0; i < 50 && !JSON.parse(fs.readFileSync(path.join(dataDir, "jobs.json"), "utf8")).find((j) => j.id === second.body.id)?.providerId; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal((await call("/generations/" + second.body.id + "/cancel", {})).status, 200);
    assert.ok(calls.some((c) => c.url.endsWith("/v1_omni/cancel") && c.method === "POST"), "取消沒有呼叫 Google cancel");
    assert.equal(calls.some((c) => /replicate|openai/.test(c.url)), false, "Omni 任務呼叫了別家");
    // A length Omni is not offered at is refused before any call.
    const before = calls.length;
    assert.equal((await call("/generations", video(OMNI, { duration: 5 }))).status, 400);
    assert.equal(calls.length, before);
  }
  console.log("PASS Gemini Omni：有金鑰即預設；背景任務欄位正確；成品存檔；成本＝回覆 usage；取消叫 Google；5 秒送出前就拒");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
