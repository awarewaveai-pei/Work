// P6 L3: the workbench connected to next-admin (VW_INTERNAL_BASE + VW_INTERNAL_TOKEN). The fake fetchImpl plays
// next-admin with the request/response shapes of app/api/internal/video/workbench/{assets,jobs}/route.ts and
// app/api/internal/entitlements/permit/[product]/route.ts; the last block reads those files so a renamed field fails here.
// Guards: no permit = no provider call (money); a permit signed by an unknown key is refused; browser-sent origin
// fields never reach the ledger; local mode (unset) calls nothing.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  { generateKeyPairSync } = require("node:crypto"),
  { pathToFileURL } = require("node:url");
const { createServer } = require("../server.cjs");
const appDir = require("../backend/appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
// The contract checks against next-admin's route sources need the full next-admin tree (laptop, CI). The container's
// .awarewave/ holds only the runtime files (awarewave-files.txt), so the deploy gate runs the behaviour checks only.
const fullSource = fs.existsSync(path.join(appDir, "app/api"));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64"),
  ORG = "11111111-1111-4111-8111-111111111111",
  BILLING = "33333333-3333-4333-8333-333333333333",
  USER = "44444444-4444-4444-8444-444444444444",
  BASE = "http://next-admin.test:3000";
const key = (k) => generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } })[k];
const pair = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } }),
  stranger = key("privateKey");

function request(port, method, pathname, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}
const wait = async (cond, ms = 5000) => {
  const end = Date.now() + ms;
  while (!cond()) { if (Date.now() > end) throw Error("timeout"); await new Promise((r) => setTimeout(r, 20)); }
};

const IMAGE_USAGE = { input_tokens: 50, output_tokens: 4160, input_tokens_details: { text_tokens: 50, image_tokens: 0 } },
  TEXT_USAGE = { input_tokens: 1200, output_tokens: 300, input_tokens_details: { cached_tokens: 200 } };

(async () => {
  const rates = await import(pathToFileURL(path.join(appDir, "lib/ai/cost-model.ts")).href);
  // Expected costs computed from next-admin's rate tables here (the module under test reads the same tables).
  const imageCost = (50 * rates.OPENAI_IMAGE_TOKEN_RATES.textInPerM + 4160 * rates.OPENAI_IMAGE_TOKEN_RATES.imageOutPerM) / 1e6;
  const tr = rates.TEXT_RATES["gpt-4.1-mini"], textCost = ((1000 + 200 * tr.cacheReadMult) * tr.inputPerM + 300 * tr.outputPerM) / 1e6;
  const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);
  const { signPermit } = await import(pathToFileURL(path.join(appDir, "lib/entitlements/permit.ts")).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p6-main-"));
  const calls = { openai: 0, theme: 0, permits: [], assets: [], jobs: [], usage: [], releaseText: [] };
  let permitMode = "allow", themeAnswer = ":root{--body-bg:#112233;}", usageDown = false, assetsDown = false, releaseTextDown = false, assetsDelayMs = 0;
  // next-admin, as its route files answer.
  async function fetchImpl(url, options = {}) {
    url = String(url);
    if (url.startsWith("https://api.openai.com/")) {
      calls.openai++;
      if (url.endsWith("/images/generations")) return Response.json({ data: [{ b64_json: png.toString("base64") }], usage: IMAGE_USAGE });
      if (url.endsWith("/responses")) return Response.json({ output_text: "腳本", model: "gpt-4.1-mini", usage: TEXT_USAGE });
      if (url.endsWith("/audio/speech")) return new Response(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(64)]));
      throw Error("unexpected openai " + url);
    }
    assert(url.startsWith(BASE + "/api/internal/"), "只打 next-admin 內部路由：" + url);
    if (url === BASE + "/api/internal/entitlements/permit/video") {
      assert.equal(options.headers.Authorization, "Bearer issuer-secret");
      const body = JSON.parse(options.body);
      calls.permits.push(body);
      if (permitMode === "refuse") return Response.json({ allowed: false, reason: "no_entitlement" });
      const now = Math.floor(Date.now() / 1000);
      const permit = signPermit({ format_version: 1, tenant: body.organization_id, product_key: "video", feature_key: body.feature_key, source: "comp", entitlement_id: "ent-1", source_ref: null, limits: {}, max_spend: null, actor: body.actor, on_behalf_of: body.organization_id, issued_at: now, expires_at: now + 600, kid: "k1" }, permitMode === "forged" ? stranger : pair.privateKey);
      return Response.json({ allowed: true, permit });
    }
    assert.equal(options.headers.Authorization, "Bearer internal-secret");
    if (url === BASE + "/api/internal/video/workbench/assets") {
      if (assetsDown) return Response.json({ ok: false, error: "storage_put_failed" }, { status: 502 });
      if (assetsDelayMs) await new Promise((r) => setTimeout(r, assetsDelayMs));
      const bytes = Buffer.from(await new Response(options.body).arrayBuffer());
      const meta = JSON.parse(Buffer.from(options.headers["X-VW-Meta"], "base64url").toString("utf8"));
      calls.assets.push({ headers: options.headers, meta, bytes });
      const assetId = "aaaaaaaa-0000-4000-8000-" + String(calls.assets.length).padStart(12, "0");
      return Response.json({ ok: true, existing: false, assetId, checksumSha256: require("node:crypto").createHash("sha256").update(bytes).digest("hex"), objectUrl: "https://cdn.test/" + assetId, qa: {} }, { status: 201 });
    }
    if (url === BASE + "/api/internal/video/workbench/assets/release-text") {
      if (releaseTextDown) return Response.json({ ok: false, error: "asset_lookup_failed" }, { status: 502 });
      calls.releaseText.push(JSON.parse(options.body));
      return Response.json({ ok: true, qa: {} });
    }
    if (url === BASE + "/api/internal/video/workbench/jobs") {
      calls.jobs.push(JSON.parse(options.body));
      return Response.json({ ok: true, job: {} });
    }
    if (url === BASE + "/api/internal/theme/css") {
      assert.equal(options.headers.Authorization, "Bearer internal-secret");
      calls.theme++;
      return new Response(themeAnswer, { headers: { "Content-Type": "text/css" } });
    }
    if (url === BASE + "/api/internal/video/workbench/usage") {
      if (usageDown) return Response.json({ ok: false, reason: "infrastructure_error" }, { status: 503 });
      calls.usage.push(JSON.parse(options.body));
      return Response.json({ ok: true, charged: 0, shortfall: 0 });
    }
    throw Error("unexpected " + url);
  }
  // Gemini speech (backend/speech.cjs): 0.2 s of 24 kHz mono 16-bit silence + the usage the charge must read.
  const pcm = Buffer.alloc(9600), wav = Buffer.alloc(44);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(pcm.length, 40);
  const GEMINI_USAGE = { total_input_tokens: 12, total_output_tokens: 50 };
  const geminiCalls = [];
  const withGemini = async (url, options = {}) => {
    if (String(url) !== "https://generativelanguage.googleapis.com/v1beta/interactions") return fetchImpl(url, options);
    assert.equal(options.headers["x-goog-api-key"], "gm-test");
    geminiCalls.push(JSON.parse(options.body));
    return Response.json({ status: "completed", usage: GEMINI_USAGE, steps: [{ type: "model_output", content: [{ type: "audio", mime_type: "audio/wav", data: Buffer.concat([wav, pcm]).toString("base64") }] }] });
  };
  const env = {
    OPENAI_API_KEY: "sk-test", GEMINI_API_KEY: "gm-test", VW_TRUST_PROXY_IDENTITY: "1", VW_ALLOWED_HOSTS: "127.0.0.1:*",
    VW_INTERNAL_BASE: BASE + "/", VW_INTERNAL_TOKEN: "internal-secret",
    ENTITLEMENT_ISSUER_TOKEN_VIDEO: "issuer-secret", ENTITLEMENT_PUBLIC_KEYS: "k1:" + pair.publicKey.replace(/\n/g, "\\n"),
  };
  const server = createServer({ dataDir: path.join(dir, "connected"), env, fetchImpl: withGemini });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const who = (extra = {}) => {
    const h = { "X-VW-User-Id": USER, "X-VW-Org-Id": ORG, "X-VW-Billing-Org-Id": BILLING, "X-VW-User-Kind": "staff", "X-VW-Role": "owner", "X-VW-Expires": String(Math.floor(Date.now() / 1000) + 120), "Content-Type": "application/json", ...extra };
    return { ...h, "X-VW-Signature": require("../backend/session-signature.cjs").sign("internal-secret", { userId: h["X-VW-User-Id"], orgId: h["X-VW-Org-Id"], billingOrgId: h["X-VW-Billing-Org-Id"], userKind: h["X-VW-User-Kind"], role: h["X-VW-Role"], expires: h["X-VW-Expires"] }) };
  };
  const generate = (body, headers = who()) => request(port, "POST", "/api/vw/generations", headers, JSON.stringify(body));
  const imageInput = { type: "image", prompt: "一隻貓", settings: { ratio: "1:1", quality: "1K", imageLayout: "center-crop" } };
  try {
    // 1. Image generation: permit -> provider -> asset ledger -> job ledger (same idempotency key).
    const sent = await generate({ ...imageInput, idempotencyKey: "browser-key-1", origin: { kind: "upload", rightsConfirmed: true }, rightsSources: [{ kind: "pexels", url: "x" }], costUsd: 0 });
    assert.equal(sent.status, 202, sent.body);
    assert.deepEqual(calls.permits, [{ organization_id: BILLING, feature_key: "video.image", actor: "video:" + USER }]);
    const jobId = JSON.parse(sent.body).id;
    let job;
    await wait(() => calls.jobs.some((j) => j.status === "succeeded"));
    job = JSON.parse((await request(port, "GET", "/api/vw/generations/" + jobId, who())).body);
    assert.equal(job.status, "succeeded", JSON.stringify(job));
    assert.equal(calls.assets.length, 1);
    const asset = calls.assets[0];
    assert.equal(asset.headers["X-VW-Org-Id"], ORG);
    assert.equal(asset.headers["X-VW-Origin"], "ai_generated");
    assert.equal(asset.headers["Content-Type"], "image/png");
    assert.equal(asset.bytes.subarray(1, 4).toString(), "PNG");
    assert.deepEqual(Object.keys(asset.meta).sort(), ["costUsd", "rightsSources", "vwJobId"], "瀏覽器送的 origin／rightsSources／costUsd 不得轉送");
    near(asset.meta.costUsd, imageCost, "資產成本 = 供應商 usage × cost-model（不是瀏覽器送的 0）");
    assert.deepEqual(asset.meta.rightsSources, [{ kind: "ai_generated", model: job.result.origin.model, provider: "OpenAI", url: job.result.url }]);
    assert.equal(asset.meta.vwJobId, jobId);
    assert.equal(job.result.assetId, "aaaaaaaa-0000-4000-8000-000000000001");
    assert.match(job.result.checksumSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(calls.jobs.map((j) => j.status), ["queued", "succeeded"]);
    for (const j of calls.jobs) {
      assert.equal(j.action, "upsert");
      assert.equal(j.organizationId, ORG);
      assert.equal(j.idempotencyKey, "browser-key-1");
      assert.equal(j.kind, "image");
      assert.equal(j.createdBy, USER);
    }
    assert.equal(calls.jobs[1].resultAssetId, job.result.assetId);
    // Usage: the delivered image is charged to the permit's billing account, once, keyed by the job id.
    await wait(() => calls.usage.length === 1);
    near(calls.usage[0].cost_usd, imageCost, "付費圖片回報真實成本");
    assert.deepEqual(calls.usage, [{ organization_id: BILLING, feature_key: "video.image", actor: "video:" + USER, job_id: jobId, cost_usd: calls.usage[0].cost_usd }]);
    assert.equal(job.usageReported, true);

    // 2. A replay of the same idempotency key: no new permit, no provider call.
    const before = { openai: calls.openai, permits: calls.permits.length };
    assert.equal((await generate({ ...imageInput, idempotencyKey: "browser-key-1" })).status, 200);
    assert.deepEqual({ openai: calls.openai, permits: calls.permits.length }, before);

    // 2b. Outbox: next-admin down -> nothing lost; after a restart the pending job AND sync-route usage go out once each.
    {
      usageDown = true;
      const outageDir = path.join(dir, "outage"), first = createServer({ dataDir: outageDir, env, fetchImpl });
      await new Promise((r) => first.listen(0, "127.0.0.1", r));
      const op = first.address().port;
      const job2 = JSON.parse((await request(op, "POST", "/api/vw/generations", who(), JSON.stringify({ ...imageInput, idempotencyKey: "outage-1" }))).body);
      await wait(() => calls.jobs.some((j) => j.idempotencyKey === "outage-1" && j.status === "succeeded"));
      assert.equal((await request(op, "POST", "/api/vw/director/script", who(), JSON.stringify({ topic: "貓" }))).status, 200);
      const pendingFile = path.join(outageDir, "orgs", ORG, "usage-outbox.json");
      await wait(() => fs.existsSync(pendingFile) && JSON.parse(fs.readFileSync(pendingFile, "utf8")).length === 2);
      assert.equal(calls.usage.filter((u) => u.job_id === job2.id).length, 0);
      first.close();
      usageDown = false;
      createServer({ dataDir: outageDir, env, fetchImpl });   // restart: startup flush, no request needed
      await wait(() => JSON.parse(fs.readFileSync(pendingFile, "utf8")).length === 0);
      assert.equal(calls.usage.filter((u) => u.job_id === job2.id).length, 1, "任務用量重啟後送達一次");
      const req = calls.usage.filter((u) => /^req:/.test(u.job_id) && u.feature_key === "video.script");
      assert.equal(req.length, 1, "即時文字用量重啟後送達一次");
      near(req[0].cost_usd, textCost, "文字成本 = usage × TEXT_RATES");
    }

    // 2b'. An asset registration retried by GET (ledgerError) never re-sends the usage already reported.
    assetsDown = true;
    const third = JSON.parse((await generate({ ...imageInput, idempotencyKey: "browser-key-4" })).body);
    await wait(() => calls.jobs.some((j) => j.idempotencyKey === "browser-key-4" && j.status === "succeeded"));
    assert.match(JSON.parse((await request(port, "GET", "/api/vw/generations/" + third.id, who())).body).ledgerError, /資產登記失敗/);
    assetsDown = false;
    assert.match(JSON.parse((await request(port, "GET", "/api/vw/generations/" + third.id, who())).body).result.assetId, /^aaaaaaaa-/);
    assert.equal(calls.usage.filter((u) => u.job_id === third.id).length, 1, "同一任務只回報一次用量");

    // 2c. A paid text route that answered is reported once per request.
    const usageBefore = calls.usage.length;
    const script = await request(port, "POST", "/api/vw/director/script", who(), JSON.stringify({ topic: "貓" }));
    if (script.status < 300) {
      await wait(() => calls.usage.length > usageBefore);
      assert.deepEqual([calls.usage.at(-1).feature_key, calls.usage.at(-1).organization_id], ["video.script", BILLING]);
      assert.match(calls.usage.at(-1).job_id, /^req:/);
    } else assert.equal(calls.usage.length, usageBefore, "失敗的文字呼叫不計費");

    // 3. Guard: refused permit = 403, no provider call, no job.
    permitMode = "refuse";
    const openaiBefore = calls.openai, jobsBefore = calls.jobs.length;
    const refused = await generate({ ...imageInput, idempotencyKey: "browser-key-2" }, who({ "X-VW-User-Id": "55555555-5555-4555-8555-555555555555" }));
    assert.equal(refused.status, 403, refused.body);
    assert.match(JSON.parse(refused.body).error.message, /尚未開通/);
    const chat = await request(port, "POST", "/api/vw/director/script", who({ "X-VW-User-Id": "55555555-5555-4555-8555-555555555555" }), JSON.stringify({ topic: "x" }));
    assert.equal(chat.status, 403, "文字服務同樣要許可");
    assert.equal(calls.openai, openaiBefore, "沒有許可不得呼叫供應商");
    assert.equal(calls.jobs.length, jobsBefore, "被拒的生成不建任務");

    // 4. Guard: permit signed by a key not in ENTITLEMENT_PUBLIC_KEYS = refused (503), no provider call.
    permitMode = "forged";
    const forged = await generate({ ...imageInput }, who({ "X-VW-User-Id": "66666666-6666-4666-8666-666666666666" }));
    assert.equal(forged.status, 503, forged.body);
    assert.equal(calls.openai, openaiBefore);

    // 5. No billing account header = 403 before anything is asked.
    permitMode = "allow";
    const permitsBefore = calls.permits.length;
    const noBilling = await generate({ ...imageInput }, who({ "X-VW-Billing-Org-Id": "" }));
    assert.equal(noBilling.status, 403);
    assert.equal(calls.permits.length, permitsBefore);
    assert.equal(calls.openai, openaiBefore);

    // 6a. Every video ingested carries technical QA in the shape the assets route hands persistAutomaticTechnicalQa.
    {
      const mp4 = path.join(dir, "clip.mp4");
      require("node:child_process").execFileSync(require("ffmpeg-static"), ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=10", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", mp4]);
      const vr = await request(port, "POST", "/api/vw/uploads", who(), JSON.stringify({ data: "data:video/mp4;base64," + fs.readFileSync(mp4).toString("base64"), name: "clip.mp4" }));
      assert.equal(vr.status, 201, vr.body);
      const render = calls.assets.at(-1).meta.render;
      assert.deepEqual(Object.keys(render.outputs), ["master"]);
      const m = render.outputMeta.master;
      assert.deepEqual([m.technical_qa.status, m.signal_qa.status, m.width, m.height], ["passed", "passed", 64, 64], JSON.stringify(m));
      if (fullSource) {
        const qaLib = fs.readFileSync(path.join(appDir, "lib/content/video/qa-persistence.ts"), "utf8");
        assert.match(qaLib, /meta\?\.technical_qa\?\.status/);
        assert.match(qaLib, /meta\?\.signal_qa\?\.status/);
        assert.match(fs.readFileSync(path.join(appDir, "app/api/internal/video/workbench/assets/route.ts"), "utf8"), /outputs: meta\.render\.outputs, outputMeta: meta\.render\.outputMeta/);
      }
    }

    // 6a2. A render records its delivery ratio from the job settings ("16:9" -> "16x9"); an undeliverable ratio (1:1) is not sent.
    {
      const sent = [];
      const main = require("../backend/main-system.cjs").createMainSystem({
        env, appDir, orgId: ORG, dataDir: fs.mkdtempSync(path.join(dir, "ratio-")),
        inspect: { verifyOutput: async () => ({ ok: true, info: {} }), loudnessStats: async () => ({}) },
        fetchImpl: async (_url, o) => { sent.push(JSON.parse(Buffer.from(o.headers["X-VW-Meta"], "base64url").toString("utf8"))); return Response.json({ ok: true, assetId: "bbbbbbbb-0000-4000-8000-00000000000" + sent.length, checksumSha256: "x" }, { status: 201 }); },
      });
      const mp4 = path.join(dir, "clip.mp4");
      for (const [url, ratio] of [["/generated/r1.mp4", "16:9"], ["/generated/r2.mp4", "1:1"]]) await main.ingest({ url, file: mp4, origin: { kind: "render" }, ratio });
      await main.ingest({ url: "/generated/r3.mp4", file: mp4, origin: { kind: "upload", rightsConfirmed: true }, ratio: "16:9" });
      assert.deepEqual(sent.map((m) => m.ratio), ["16x9", undefined, undefined]);
    }

    // 6b. Per provider kind: real cost from next-admin's tables; a model with no price is refused before the call.
    {
      const costs = require("../backend/provider-cost.cjs");
      near(costs.videoUsd("veo-3-1-fast", 8), 8 * rates.VIDEO_MOTION_RATES["veo-3-1-fast"].usdPerSec, "影片");
      assert.throws(() => costs.videoUsd("sora-2", 8), /尚無價目/, "Sora 2 已下線：不再計價");
      const tts = rates.OPENAI_TTS_RATES["gpt-4o-mini-tts"];
      near(costs.speechUsd("gpt-4o-mini-tts", 1000, 90), (1000 * tts.textInPerM + 90 * tts.audioTokensPerSec * tts.audioOutPerM) / 1e6, "語音（字數＋音檔秒數）");
      near(costs.speechUsd("tts-1", 1000), 1000 * rates.OPENAI_TTS_RATES["tts-1"].usdPerMChars / 1e6, "tts-1 每字");
      // Run-time-billed Replicate models: one function, predict_time x usdPerSec; no run time = the estimate.
      near(costs.runUsd("bg-remove", 2.5), 2.5 * rates.TOOL_RATES["bg-remove"].usdPerSec, "去背按秒");
      near(costs.runUsd("3d-trellis", 30), 30 * rates.TOOL_RATES["3d-trellis"].usdPerSec, "TRELLIS 按秒");
      near(costs.runUsd("bg-remove", undefined), rates.TOOL_RATES["bg-remove"].usd, "沒有 predict_time = 估價");
      assert.throws(() => costs.runUsd("upscale", 3), /not a run-time-billed/, "按張計價的工具不得走按秒");
      near(costs.transcribeUsd("whisper-1", 90), 1.5 * rates.TRANSCRIBE_RATES["whisper-1"].usdPerMin, "語音辨識");
      near(costs.toolUsd("bg-remove"), rates.TOOL_RATES["bg-remove"].usd, "去背");
      assert.equal(costs.imageUsd("gpt-image-2", undefined), rates.IMAGE_RATES["openai-high"].usd, "沒有 usage = 該模型固定價，不是 0");
      assert(costs.textUsd("gpt-4.1-mini", undefined, { inputChars: 100, maxOutputTokens: 3000 }) > 0);
      // Image models are priced only when cost-model lists them (default model + its dated snapshot); a lookalike name is refused.
      costs.priceOf("image", require("../backend/generation-policy.cjs").models({}).image);
      costs.priceOf("image", "gpt-image-2.5-flare-2026-09-08");
      assert.throws(() => costs.priceOf("image", "gpt-image-9-flare"), /尚無價目/, "未登記的新版本不得用名稱猜價"); // 2.6 got registered 2026-11-09
      for (const [kind, model] of [["video", "veo-x"], ["audio", "nope-tts"], ["image", "dall-e-3"], ["text", "mystery-1"], ["3d", undefined]])
        assert.throws(() => costs.priceOf(kind, model), /尚無價目/, kind);
      // Default speech = Gemini: the job's charge and usage report = the reply's token counts at today's price row.
      const speech = JSON.parse((await generate({ type: "spoken", prompt: "你好世界", voice: "coral", idempotencyKey: "tts-1" })).body);
      await wait(() => calls.usage.some((u) => u.job_id === speech.id));
      const today = new Date().toISOString().slice(0, 10), gp = rates.GEMINI_TTS_RATES["gemini-3.8-flash-lite-tts"].prices.filter((p) => p.from <= today).at(-1);
      near(calls.usage.find((u) => u.job_id === speech.id).cost_usd, (12 * gp.textInPerM + 50 * gp.audioOutPerM) / 1e6, "Gemini 語音任務＝回覆的 token");
      assert.deepEqual([geminiCalls.at(-1).model, geminiCalls.at(-1).generation_config.speech_config[0].voice], ["gemini-3.8-flash-lite-tts", "Sulafat"], "舊 OpenAI 聲線 coral 對到 Gemini");
      const refused = await generate({ type: "spoken", prompt: "你好世界", speechModel: "no-such-tts", idempotencyKey: "tts-bad" });
      assert.equal(refused.status, 400, "不在清單的配音服務不建立任務");
      // 2027 row: Google's doubled price applies from 2027-01-01; no usage = 1 token per character + 25 tokens per second.
      near(costs.speechUsd("gemini-3.8-flash-lite-tts", 10, 4, null, "2027-01-02T00:00:00Z"), (10 * 1 + 4 * 25 * 12) / 1e6, "2027 價目與無 usage 估算");
    }

    // 6d. Connected mode (HttpAdapter): the server's refusal message reaches the user, never a bare status code.
    {
      // Minimal XMLHttpRequest stand-in: answers 503 with the server's own message.
      class XMLHttpRequest {
        upload = {};
        open() {}
        setRequestHeader() {}
        send() {
          setTimeout(() => Object.assign(this, { status: 503, responseText: JSON.stringify({ error: { message: "OpenAI 額度不足" } }) }).onload());
        }
        abort() { this.onabort?.(); }
      }
      const vm = require("node:vm"), ctx = { window: {}, setTimeout, clearTimeout, XMLHttpRequest };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../shared/adapters.js"), "utf8"), ctx);
      const http = new ctx.window.VideoWorkbenchAdapters.HttpAdapter({ apiBaseUrl: "/api/vw", timeoutMs: 1000 });
      await assert.rejects(http.request("/generations", "POST", {}), /OpenAI 額度不足/);
      // An upload that keeps moving outlives the write deadline: 5 progress events 400 ms apart, then 201, against a
      // 1 s gatewayTimeoutMs. Only a deadline restarted by each event lets it finish (prod 499s, 2026-11-06).
      ctx.XMLHttpRequest = class extends XMLHttpRequest {
        send() {
          let n = 0;
          const tick = setInterval(() => {
            if (++n <= 5) return this.upload.onprogress?.();
            clearInterval(tick);
            Object.assign(this, { status: 201, responseText: '{"id":"slow"}' }).onload();
          }, 400);
          this.abort = () => (clearInterval(tick), this.onabort?.());
        }
      };
      const slow = new ctx.window.VideoWorkbenchAdapters.HttpAdapter({ apiBaseUrl: "/api/vw", timeoutMs: 100, gatewayTimeoutMs: 1000 });
      assert.equal((await slow.request("/uploads", "POST", { data: "x" })).id, "slow");
    }

    // 6c. 送審與投遞 links to next-admin's /release for the registered asset; an undeliverable ratio gets no link.
    {
      const vm = require("node:vm");
      const ratios = { "16:9": { deliverable: true }, "1:1": { deliverable: false, note: "此比例尚不能投遞" } };
      const ctx = { VideoWorkbench: { request: async () => ({ ratios }), loadCapabilities: async () => ({ mainSystem: { organizationId: ORG } }) }, document: {}, URLSearchParams };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../shared/jobs-view.js"), "utf8"), ctx);
      const job = (ratio) => ({ result: { assetId: "a" }, input: { settings: { ratio } } });
      await assert.rejects(ctx.VideoWorkbench.deliveryUrl(job("1:1")), /尚不能投遞/);
      assert.equal(await ctx.VideoWorkbench.deliveryUrl(job("16:9")), "/release?organizationId=" + ORG + "&candidateAssetId=a");
      assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "../shared/jobs-view.js"), "utf8"), /window\.open\(/, "彈窗在 await 後會被瀏覽器擋掉，用連結");
    }

    // 6. Upload: registered as real_footage before the answer; the response carries the asset id.
    const up = await request(port, "POST", "/api/vw/uploads", who(), JSON.stringify({ data: "data:image/png;base64," + png.toString("base64"), name: "a.png", origin: { kind: "ai_generated" } }));
    assert.equal(up.status, 201, up.body);
    const upAsset = calls.assets.at(-1);
    assert.equal(upAsset.headers["X-VW-Origin"], "real_footage");
    assert.deepEqual(upAsset.meta.rightsSources, [{ kind: "upload", rightsConfirmed: false, url: JSON.parse(up.body).url }]);
    assert.equal(JSON.parse(up.body).assetId, "aaaaaaaa-0000-4000-8000-" + String(calls.assets.length).padStart(12, "0"));

    // 6e. Release text: what a render shows goes to next-admin once, from the job record only; no words = nothing sent.
    {
      const { releaseText } = require("../backend/release-text.cjs");
      const text = (id, track, t, from, frames, extra = {}) => ({ id, kind: "text", track, text: t, startFrame: from, durationFrames: frames, ...extra });
      const project = { title: "  春季新品  ", ratio: "16:9", timebase: { num: 30, den: 1 }, clips: [
        text("t1", "T", "A", 0, 60), text("t2", "T", "B", 30, 60), text("t3", "T", "H", 0, 30, { hidden: true }), text("t4", "T", "B", 90, 30), text("t5", "T", "O", 0, 120, { opacity: 0 }),
      ] };
      const editor = releaseText({ input: { operation: "editor-export", settings: { project, quality: "720p" } } });
      assert.equal(editor.title, "春季新品");
      assert.equal(editor.script, "A\nB", "script = visible text, first appearance order, no duplicates, hidden and fully transparent clips left out");
      assert.deepEqual(editor.captions, [{ startMs: 0, endMs: 1000, text: "A" }, { startMs: 1000, endMs: 2000, text: "A\nB" }, { startMs: 2000, endMs: 4000, text: "B" }]);
      let end = 0;
      for (const c of editor.captions) { assert(c.startMs >= end && c.endMs > c.startMs && c.text.trim(), "caption QA order rule"); end = c.endMs; }
      const burn = releaseText({ input: { operation: "subtitle-burn", settings: { cues: [{ start: 0, end: 1.5, text: "嗨" }, { start: 1.5, end: 3, text: "再見" }] }, references: { src: { name: "旅行.mp4" } } } });
      assert.deepEqual([burn.title, burn.script, burn.captions], ["旅行.mp4", "嗨\n再見", [{ startMs: 0, endMs: 1500, text: "嗨" }, { startMs: 1500, endMs: 3000, text: "再見" }]]);
      assert.equal(releaseText({ input: { operation: "subtitle-burn", settings: { cues: [{ start: 0, end: 1, text: "x" }] } } }).title, "", "no source name = empty title, not invented");
      assert.equal(releaseText({ type: "video", input: { type: "video", prompt: "一隻貓在跑" } }), null, "AI video has no words: nothing sent, prompt is not a script");
      assert.equal(releaseText({ input: { operation: "remotion-template", settings: {} } }), null);

      const seedDir = path.join(dir, "relsettle"), orgDir = path.join(seedDir, "orgs", ORG);
      fs.mkdirSync(path.join(orgDir, "generated"), { recursive: true });
      const seeded = ["a", "b", "c"].map((n) => {
        fs.copyFileSync(path.join(dir, "clip.mp4"), path.join(orgDir, "generated", n + ".mp4"));
        return { id: "seed-" + n, type: "video", status: "succeeded", createdAt: new Date().toISOString(), ledgerError: "x", result: { url: "/generated/" + n + ".mp4", origin: { kind: "render" } },
          input: n === "b" ? { type: "video", prompt: "貓" } : { type: "video", operation: "editor-export", settings: { project, quality: "720p" } } };
      });
      fs.writeFileSync(path.join(orgDir, "jobs.json"), JSON.stringify(seeded));
      const rt = createServer({ dataDir: seedDir, env, fetchImpl });
      await new Promise((r) => rt.listen(0, "127.0.0.1", r));
      const get = async (id) => JSON.parse((await request(rt.address().port, "GET", "/api/vw/generations/" + id, who())).body);
      const a = await get("seed-a");
      assert.equal(calls.releaseText.length, 1);
      assert.deepEqual(calls.releaseText[0], { organizationId: ORG, assetId: a.result.assetId, checksumSha256: a.result.checksumSha256, title: "春季新品", script: "A\nB", captions: editor.captions });
      assert.equal(a.result.releaseTextSent, true);
      await get("seed-a");
      assert.equal(calls.releaseText.length, 1, "送過就不再送");
      await get("seed-b");
      assert.equal(calls.releaseText.length, 1, "沒有文字的影片不送");
      releaseTextDown = true;
      const c1 = await get("seed-c");
      assert.match(c1.releaseTextError, /送審文字登記失敗/);
      assert.notEqual(c1.result.releaseTextSent, true);
      assert.equal(calls.releaseText.length, 1);
      releaseTextDown = false;
      const c2 = await get("seed-c");
      assert.equal(calls.releaseText.length, 2, "失敗後下次 GET 重送");
      assert.deepEqual([c2.releaseTextError, c2.result.releaseTextSent], [undefined, true]);
      rt.close();
    }

    // 6g. Invariant (P6.10 2026-11-13): a succeeded job is never answered unsettled -- it carries result.assetId,
    // result.ledger (explicit skip) or ledgerError. A browser copy taken mid-registration was never asked again, so the
    // editor export showed 「此成果尚未登記到主系統」 although the server had registered it.
    {
      const settledShape = (j) => !!(j.result?.assetId || j.result?.ledger || j.ledgerError);
      // (a) registration still running (slow upload) while the page polls: no succeeded answer without the outcome.
      assetsDelayMs = 600;
      const raced = JSON.parse((await generate({ ...imageInput, idempotencyKey: "race-1" })).body);
      let seen;
      for (let i = 0; i < 400 && seen?.status !== "succeeded"; i++) {
        seen = JSON.parse((await request(port, "GET", "/api/vw/generations/" + raced.id, who())).body);
        if (seen.status !== "succeeded") await new Promise((r) => setTimeout(r, 10));
      }
      assetsDelayMs = 0;
      assert.equal(seen.status, "succeeded", JSON.stringify(seen));
      assert(settledShape(seen), "登記進行中的 succeeded 任務不得先回給瀏覽器：" + JSON.stringify(seen.result));
      assert.match(seen.result.assetId, /^aaaaaaaa-/);
      // (b) a succeeded job saved without any outcome (process stopped between finish and settle) is settled by its next GET.
      const orphanDir = path.join(dir, "orphan"), orphanOrg = path.join(orphanDir, "orgs", ORG);
      fs.mkdirSync(path.join(orphanOrg, "generated"), { recursive: true });
      fs.copyFileSync(path.join(dir, "clip.mp4"), path.join(orphanOrg, "generated", "f.mp4"));
      fs.writeFileSync(path.join(orphanOrg, "jobs.json"), JSON.stringify([{ id: "orphan-1", type: "video", status: "succeeded", createdAt: new Date().toISOString(),
        result: { url: "/generated/f.mp4", origin: { kind: "render", engine: "workbench-editor" } }, input: { type: "video", operation: "editor-export", settings: {} } }]));
      const os2 = createServer({ dataDir: orphanDir, env, fetchImpl });
      await new Promise((r) => os2.listen(0, "127.0.0.1", r));
      const orphan = JSON.parse((await request(os2.address().port, "GET", "/api/vw/generations/orphan-1", who())).body);
      assert(settledShape(orphan), "沒有登記結果的 succeeded 任務，下一次 GET 補登記：" + JSON.stringify(orphan));
      assert.match(orphan.result.assetId, /^aaaaaaaa-/, JSON.stringify(orphan));
      os2.close();
      // (c) registration longer than the GET's wait: answered ledgerPending (re-ask), never the bare fourth state; the
      // record on disk never carries ledgerPending, and a later GET has the asset.
      const slowDir = path.join(dir, "slow"), slowOrg = path.join(slowDir, "orgs", ORG);
      fs.mkdirSync(path.join(slowOrg, "generated"), { recursive: true });
      fs.copyFileSync(path.join(dir, "clip.mp4"), path.join(slowOrg, "generated", "e.mp4"));
      fs.writeFileSync(path.join(slowOrg, "jobs.json"), JSON.stringify([{ id: "slow-1", type: "video", status: "succeeded", createdAt: new Date().toISOString(),
        result: { url: "/generated/e.mp4", origin: { kind: "render", engine: "workbench-editor" } }, input: { type: "video", operation: "editor-export", settings: {} } }]));
      const slow = createServer({ dataDir: slowDir, env: { ...env, VW_SETTLE_WAIT_MS: "100" }, fetchImpl });
      await new Promise((r) => slow.listen(0, "127.0.0.1", r));
      assetsDelayMs = 800;
      const s1 = JSON.parse((await request(slow.address().port, "GET", "/api/vw/generations/slow-1", who())).body);
      assert.equal(s1.ledgerPending, true, "登記超過等待上限：明確回 ledgerPending：" + JSON.stringify(s1));
      assert.equal(JSON.parse(fs.readFileSync(path.join(slowOrg, "jobs.json"), "utf8"))[0].ledgerPending, undefined, "ledgerPending 不寫進紀錄");
      await new Promise((r) => setTimeout(r, 1200));
      assetsDelayMs = 0;
      const s2 = JSON.parse((await request(slow.address().port, "GET", "/api/vw/generations/slow-1", who())).body);
      assert.match(s2.result.assetId, /^aaaaaaaa-/, JSON.stringify(s2));
      assert.equal(s2.ledgerPending, undefined);
      slow.close();
      // (d) history pruning keeps a connected job still owing its registration (its retry lives only in this record).
      const pruneDir = path.join(dir, "prune"), pruneOrg = path.join(pruneDir, "orgs", ORG);
      fs.mkdirSync(pruneOrg, { recursive: true });
      const old = (id) => ({ id, type: "image", status: "succeeded", createdAt: new Date().toISOString(), result: { url: "/generated/b.png", ledger: "unsupported_type" } });
      fs.writeFileSync(path.join(pruneOrg, "jobs.json"), JSON.stringify([{ ...old("owed-1"), result: { url: "/generated/a.png" } }, ...Array.from({ length: 101 }, (_, i) => old("old-" + i))]));
      const pruner = createServer({ dataDir: pruneDir, env: { ...env, VW_JOB_HISTORY_LIMIT: "100" }, fetchImpl });
      await new Promise((r) => pruner.listen(0, "127.0.0.1", r));
      await request(pruner.address().port, "POST", "/api/vw/generations", who(), JSON.stringify({ ...imageInput, idempotencyKey: "prune-1" }));
      await wait(() => calls.jobs.some((j) => j.idempotencyKey === "prune-1" && j.status === "succeeded"));
      const kept = JSON.parse(fs.readFileSync(path.join(pruneOrg, "jobs.json"), "utf8")).map((j) => j.id);
      assert(kept.includes("owed-1"), "尚未登記的完成任務不得被歷史上限裁掉");
      assert(!kept.includes("old-0"), "已有結果的舊任務照常裁剪");
      pruner.close();
    }

    // 6f. Upload rights: only a literal true from the upload dialog is recorded as confirmed; a retry of an unconfirmed
    // upload with the box ticked is sent again so next-admin can upgrade the row (never the reverse).
    {
      const send = async (extra) => {
        const r = await request(port, "POST", "/api/vw/uploads", who(), JSON.stringify({ data: "data:image/png;base64," + png.toString("base64"), name: "r.png", ...extra }));
        assert.equal(r.status, 201, r.body);
        return calls.assets.at(-1).meta.rightsSources[0].rightsConfirmed;
      };
      assert.deepEqual([await send({ rightsConfirmed: true }), await send({ rightsConfirmed: false }), await send({}), await send({ rightsConfirmed: "true" })], [true, false, false, false]);
      const sent = [];
      const main = require("../backend/main-system.cjs").createMainSystem({
        env, appDir, orgId: ORG, dataDir: fs.mkdtempSync(path.join(dir, "rights-")),
        inspect: { verifyOutput: async () => ({ ok: true, info: {} }), loudnessStats: async () => ({}) },
        fetchImpl: async (_url, o) => { sent.push(JSON.parse(Buffer.from(o.headers["X-VW-Meta"], "base64url").toString("utf8")).rightsSources[0].rightsConfirmed); return Response.json({ ok: true, assetId: "bbbbbbbb-0000-4000-8000-00000000000" + sent.length, checksumSha256: "x" }, { status: 201 }); },
      });
      const mp4 = path.join(dir, "clip.mp4"), url = "/media/" + "a".repeat(64) + "/original.mp4";
      for (const rightsConfirmed of [false, false, true, true, false]) await main.ingest({ url, file: mp4, origin: { kind: "upload", rightsConfirmed } });
      assert.deepEqual(sent, [false, true], "未確認→已確認再送一次；其餘命中本機索引不送");
    }

    // 7. Local mode: same requests, no main-system call at all.
    const localCalls = [];
    const local = createServer({ dataDir: path.join(dir, "local"), env: { OPENAI_API_KEY: "sk-test" }, fetchImpl: async (url, o) => {
      localCalls.push(String(url));
      return fetchImpl(url, o);
    } });
    await new Promise((r) => local.listen(0, "127.0.0.1", r));
    const lp = local.address().port;
    const lr = await request(lp, "POST", "/api/vw/generations", { "Content-Type": "application/json" }, JSON.stringify(imageInput));
    assert.equal(lr.status, 202, lr.body);
    let lj;
    for (let i = 0; i < 250 && lj?.status !== "succeeded"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      lj = JSON.parse((await request(lp, "GET", "/api/vw/generations/" + JSON.parse(lr.body).id)).body);
    }
    assert.equal(lj.status, "succeeded", JSON.stringify(lj));
    assert.equal(localCalls.filter((u) => u.startsWith(BASE)).length, 0, "本機模式不得連主系統");
    assert.equal(lj.result?.assetId, undefined);
    assert.equal(lj.result?.ledger, "local_mode", "本機模式的完成任務明確標示不登記（6g 不變量）");
    local.close();

    // 8. D6: 1:1 / 4:3 delivery = 「此比例尚不能投遞」.
    const { deliveryRatios } = require("../backend/delivery-ratios.cjs");
    const ratios = (await deliveryRatios(["16:9", "1:1", "4:3"])).ratios;
    assert.equal(ratios["16:9"].deliverable, true);
    for (const r of ["1:1", "4:3"]) assert.deepEqual([ratios[r].deliverable, ratios[r].note], [false, "此比例尚不能投遞"]);
    assert.match(fs.readFileSync(path.join(__dirname, "../scripts/editor-export-dialog.js"), "utf8"), /delivery\?\.note \|\| "此比例尚不能投遞"/);

    // 8b. Container mode: config.js says http; the file on disk stays local. Costs come from next-admin cost-model.ts.
    const httpServer = createServer({ dataDir: path.join(dir, "http"), env: { VW_CONFIG_MODE: "http" }, fetchImpl });
    await new Promise((r) => httpServer.listen(0, "127.0.0.1", r));
    assert.match((await request(httpServer.address().port, "GET", "/config.js")).body, /mode: "http"/);
    httpServer.close();
    assert.match((await request(port, "GET", "/config.js")).body, /mode: "local"/);
    const { TOOL_RATES } = await import(pathToFileURL(path.join(appDir, "lib/ai/cost-model.ts")).href);
    assert.equal(require("../backend/generation-policy.cjs").toolCosts.removeBackground, TOOL_RATES["bg-remove"].usd);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "../backend/generation-policy.cjs"), "utf8"), /removeBackground:\s*0\./, "成本不得手抄");
    const caps = JSON.parse((await request(port, "GET", "/api/vw/capabilities", who())).body);
    assert.deepEqual(caps.mainSystem, { organizationId: ORG });
    assert.match(fs.readFileSync(path.join(__dirname, "../shared/jobs-view.js"), "utf8"), /"\/release\?"/);
    if (fullSource) assert(fs.existsSync(path.join(appDir, "app/video/release/page.tsx")), "/release 頁必須存在");

    // 8c. Theme saved on app reaches video.aware-wave.com: appended after the bundled :root (wins). Card P6.16: kept until
    // app says a save happened (POST /api/internal/theme/invalidate) or a tab comes back (?fresh); no timer.
    const themeCss = (await request(port, "GET", "/awarewave/theme.css")).body;
    assert.match(themeCss, /^:root\s*\{[\s\S]*\}\n:root\{--body-bg:#112233;\}$/);
    themeAnswer = ":root{--body-bg:#445566;}";
    await request(port, "GET", "/awarewave/theme.css");
    assert.equal(calls.theme, 1, "沒有通知就不重抓");
    // Guard: the invalidate route refuses without the internal token (and with a wrong one, or GET).
    for (const [method, headers] of [["POST", {}], ["POST", { Authorization: "Bearer wrong" }], ["GET", { Authorization: "Bearer internal-secret" }]])
      assert.equal((await request(port, method, "/api/internal/theme/invalidate", headers)).status, 401, "無 token 不得清快取");
    assert.equal(calls.theme, 1);
    assert.match((await request(port, "GET", "/awarewave/theme.css")).body, /#112233;\}$/, "被拒的通知不影響快取");
    // Saved on app -> notice -> the very next theme.css is the new one.
    assert.equal((await request(port, "POST", "/api/internal/theme/invalidate", { Authorization: "Bearer internal-secret" })).status, 204);
    assert.match((await request(port, "GET", "/awarewave/theme.css")).body, /\n:root\{--body-bg:#445566;\}$/, "存檔後立刻讀到新 CSS");
    assert.equal(calls.theme, 2);
    // Notice lost: a tab coming back (?fresh) still reads the new one from app.
    themeAnswer = ":root{--body-bg:#778899;}";
    await new Promise((r) => setTimeout(r, 1100));   // freshFloorMs: at most one forced app read per second
    assert.match((await request(port, "GET", "/awarewave/theme.css?fresh=1")).body, /\n:root\{--body-bg:#778899;\}$/, "切回分頁重讀");
    assert.equal(calls.theme, 3);
    await request(port, "GET", "/awarewave/theme.css?fresh=1");
    assert.equal(calls.theme, 3, "一秒內的 ?fresh 共用上一次");
    themeAnswer = ":root{--body-bg:#112233;}";
    const { savedTheme } = require("../backend/appearance.cjs");
    assert.equal(await savedTheme({ env: {}, fetchImpl: () => assert.fail("本機模式不得連主系統") })(), "");
    let clock = 0, answer = ":root{--a:#111;}";
    const linked = savedTheme({ env, now: () => clock, fetchImpl: async () => new Response(answer) });
    assert.equal(await linked(), ":root{--a:#111;}");
    clock = 600000; answer = "</style><script>x</script>";
    let gate; const slow = savedTheme({ env, fetchImpl: () => new Promise((r) => { gate = () => r(new Response(":root{--b:#222;}")); }) });
    const pair = [slow(), slow()]; gate();
    assert.deepEqual(await Promise.all(pair), [":root{--b:#222;}", ":root{--b:#222;}"], "併發請求共用同一次抓取");
    assert.equal(await linked(), ":root{--a:#111;}", "壞回應保留上一份");
    clock += 1000; answer = ":root{--a:#333;}";
    assert.equal(await linked(), ":root{--a:#333;}", "失敗後一秒就重試，不鎖十分鐘");
    if (fullSource) assert.match(fs.readFileSync(path.join(appDir, "app/api/internal/theme/css/route.ts"), "utf8"), /export async function GET/);

    // 9. Every name sent exists in the L2 route files.
    if (fullSource) {
      const read = (p) => fs.readFileSync(path.join(appDir, p), "utf8");
      const assets = read("app/api/internal/video/workbench/assets/route.ts"),
        jobs = read("app/api/internal/video/workbench/jobs/route.ts"),
        issuer = read("lib/entitlements/issuer.ts");
      for (const h of Object.keys(asset.headers).filter((h) => h.startsWith("X-VW-"))) assert(assets.includes(`"${h.toLowerCase()}"`), "assets route 讀 " + h);
      assert.match(assets, /"content-type"/);
      for (const m of ["rightsSources", "parentAssetIds", "costUsd", "vwJobId"]) assert(assets.includes("m." + m), "assets route 讀 meta." + m);
      for (const origin of ["ai_generated", "real_footage", "workbench_render"]) assert(assets.includes(`"${origin}"`));
      for (const ext of Object.values(require("../backend/main-system.cjs").MIME)) assert(assets.includes(`"${ext}"`), "assets route 收 " + ext);
      for (const field of new Set(calls.jobs.flatMap(Object.keys).concat("resultAssetId", "costUsd", "error"))) assert(jobs.includes("body." + field), "jobs route 讀 body." + field);
      const kinds = /KINDS = new Set\(\[([^\]]+)\]\)/.exec(jobs)[1];
      for (const k of ["image", "video", "audio", "remove-bg", "3d", "render"]) assert(kinds.includes(`"${k}"`));
      for (const field of Object.keys(calls.permits[0])) assert(issuer.includes(field), "issuer 讀 " + field);
      assert.match(issuer, /video: "ENTITLEMENT_ISSUER_TOKEN_VIDEO"/);
      const releaseText = read("app/api/internal/video/workbench/assets/release-text/route.ts");
      for (const field of Object.keys(calls.releaseText[0])) assert(releaseText.includes("b." + field), "release-text route 讀 " + field);
      const usageLib = read("lib/entitlements/service-usage.ts");
      assert.match(read("app/api/internal/video/workbench/usage/route.ts"), /reportWorkbenchUsage\(body\)/);
      const askTable = read("lib/content/video/workbench-usage.ts");
      assert.match(askTable, /reportForService\("video"/);
      for (const f of new Set([...Object.values(require("../backend/main-system.cjs").PAID_ROUTES), "video.image", "video.motion", "video.tts", "video.bg-remove", "video.3d", "video.enhance", "video.music"]))
        assert(askTable.includes(`grantFor("${f}")`), "usage 路由能計費 " + f);
      for (const field of Object.keys(calls.usage[0])) assert(usageLib.includes(field), "service-usage 讀 " + field);
      const products = read("lib/portal/products.ts");
      for (const f of ["video.image", "video.motion", "video.tts", "video.script", "video.transcribe", "video.bg-remove", "video.3d", "video.enhance", "video.music"]) assert(products.includes(`"${f}"`), "products.ts 登記 " + f);
    }

    // 8. Reference material (seedstar captures): signed staff only behind the proxy, local mode as before; the page code
    //    never names the files directly (a hard-coded path = 404 broken thumbnails on the public site).
    {
      const ref = path.join(dir, "reference");
      fs.mkdirSync(ref);
      fs.writeFileSync(path.join(ref, "image-1.png"), png);
      fs.writeFileSync(path.join(ref, "storyboards-data.json"), '{"cards":[]}');
      fs.writeFileSync(path.join(dir, "secret.txt"), "secret");
      env.VW_REFERENCE_DIR = ref;
      const get = (p, h) => request(port, "GET", p, h);
      const staff = await get("/reference/image-1.png", who());
      assert.equal(staff.status, 200);
      assert.equal(staff.headers["cache-control"], "private");
      assert.equal(staff.headers["content-type"], "image/png");
      assert.equal((await get("/reference/storyboards-data.json", who())).status, 200);
      assert.equal((await get("/reference/image-1.png", who({ "X-VW-User-Kind": "client" }))).status, 404, "客戶讀不到參考資料");
      assert.equal((await get("/reference/image-1.png", {})).status, 404, "未簽章");
      assert.equal((await get("/reference/image-1.png", { "X-VW-User-Id": USER, "X-VW-Org-Id": ORG, "X-VW-User-Kind": "staff" })).status, 404, "偽造 staff 標頭沒有簽章");
      for (const bad of ["/reference/..%2fsecret.txt", "/reference/%2e%2e/secret.txt", "/reference/secret.txt", "/reference/image-1.gif", "/reference/image-2.png", "/reference/sub/image-1.png"])
        assert.equal((await get(bad, who())).status, 404, bad);
      assert.equal(JSON.parse((await get("/api/vw/capabilities", who())).body).reference, true);
      assert.equal(JSON.parse((await get("/api/vw/capabilities", who({ "X-VW-User-Kind": "client" }))).body).reference, false);
      const local = createServer({ dataDir: path.join(dir, "local-ref"), env: { VW_REFERENCE_DIR: ref } });
      await new Promise((r) => local.listen(0, "127.0.0.1", r));
      assert.equal((await request(local.address().port, "GET", "/reference/image-1.png")).status, 200, "本機模式照舊可讀");
      assert.equal(JSON.parse((await request(local.address().port, "GET", "/api/vw/capabilities")).body).reference, true);
      local.close();
      const bare = createServer({ dataDir: path.join(dir, "local-none"), env: { VW_REFERENCE_DIR: path.join(dir, "missing") } });
      await new Promise((r) => bare.listen(0, "127.0.0.1", r));
      assert.equal(JSON.parse((await request(bare.address().port, "GET", "/api/vw/capabilities")).body).reference, false, "目錄沒有參考檔 = false");
      bare.close();
      const named = [];
      for (const sub of ["scripts", "shared", "pages"])
        for (const f of fs.readdirSync(path.join(__dirname, "..", sub))) {
          if (!/\.(js|mjs|html)$/.test(f)) continue;
          if (/assets\/(image-|storyboards-data)/.test(fs.readFileSync(path.join(__dirname, "..", sub, f), "utf8"))) named.push(sub + "/" + f);
        }
      assert(!/assets\/(image-|storyboards-data)/.test(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")), "index.html 不得直接引用參考檔");
      assert.deepEqual(named, [], "頁面程式只能走 /reference/（staff 限定）");
    }

    // 9. Our own examples (examples/): complete, pictures present and <= 60 KB, nothing third-party, public static for every
    //    identity, and the pages load them outside the staff-only reference gate.
    {
      const ex = path.join(__dirname, "..", "examples"), j = (f) => JSON.parse(fs.readFileSync(path.join(ex, f), "utf8"));
      const boards = j("storyboards.json").cards, templates = j("templates.json").templates, styles = j("styles.json");
      const picture = (p, id) => {
        assert.equal(p, "/examples/" + id + ".webp", "圖片路徑 " + id);
        assert(fs.existsSync(path.join(ex, id + ".webp")), "圖存在 " + id);
        assert(fs.statSync(path.join(ex, id + ".webp")).size <= 60 * 1024, "圖 <= 60KB " + id);
      };
      const filled = (o, keys, id) => { for (const k of keys) assert(Array.isArray(o[k]) ? o[k].length : String(o[k] ?? "").trim(), id + " 缺 " + k); };
      assert.equal(boards.length, 12);
      assert.equal(boards.filter((c) => c.category === "商業廣告").length, 6);
      assert.equal(boards.filter((c) => c.category === "人文生活").length, 6);
      for (const c of boards) {
        filled(c, ["id", "title", "category", "type", "tags", "duration", "style", "image", "grid_layout", "fps", "imagePrompt", "videoPrompt", "shots"], c.id);
        assert.equal(c.origin, "AwareWave 自製範例");
        assert(!c.sourceUrl && !c.sourceLinks && !c.imageSourceUrl, c.id + " 不得有來源連結");
        assert.equal(c.shots.length, parseInt(c.type, 10), c.id + " 鏡頭數 = 格數");
        for (const sh of c.shots) filled(sh, ["cut", "shot", "camera", "action", "time"], c.id);
        filled(c.translations.zh, ["imagePrompt", "videoPrompt", "shots"], c.id + ".zh");
        assert.equal(c.translations.zh.shots.length, c.shots.length);
        picture(c.image, c.id);
      }
      assert(new Set(boards.map((c) => c.type)).size === 3, "4/6/9-Grid 都有");
      assert.equal(templates.length, 8);
      for (const t of templates) {
        filled(t, ["id", "name", "category", "ratio", "seconds", "replace", "author", "date", "tag", "prompt", "description", "img"], t.id);
        assert.equal(t.author, "AwareWave");
        assert(t.prompt.includes("@image1"), t.id + " 提示詞用 @image1");
        picture(t.img, t.id);
      }
      assert.equal(styles.home.length, 6);
      assert.equal(styles.project.length, 8);
      for (const st of [...styles.home, ...styles.project]) { filled(st, ["id", "name", "image"], st.id); picture(st.image, st.id); }
      for (const f of fs.readdirSync(ex)) if (f.endsWith(".json")) assert(!/seedstar\.ai|sweetprompt/i.test(fs.readFileSync(path.join(ex, f), "utf8")), f + " 不得出現第三方來源");
      const pub = (p, h) => request(port, "GET", p, h);
      for (const h of [who({ "X-VW-User-Kind": "client" }), {}]) {
        assert.equal((await pub("/examples/storyboards.json", h)).status, 200, "自製分鏡公開");
        assert.equal((await pub("/examples/templates.json", h)).status, 200, "自製模板公開");
        const img = await pub("/examples/aw-001.webp", h);
        assert.equal(img.status, 200);
        assert.equal(img.headers["content-type"], "image/webp");
      }
      const caps = JSON.parse((await pub("/api/vw/capabilities", who({ "X-VW-User-Kind": "client" }))).body);
      assert.equal(caps.reference, false, "客戶沒有 seedstar 參考，自製內容仍由頁面載入：");
      const boot = fs.readFileSync(path.join(__dirname, "..", "scripts/storyboards-boot.js"), "utf8");
      assert(boot.indexOf("/examples/storyboards.json") > 0 && boot.indexOf("/examples/storyboards.json") < boot.indexOf("caps.reference"), "分鏡自製內容在 reference 判斷之前載入");
      assert(fs.readFileSync(path.join(__dirname, "..", "scripts/templates-boot.js"), "utf8").includes("/examples/templates.json"), "模板頁載入自製模板");
      assert(/exampleTemplates/.test(fs.readFileSync(path.join(__dirname, "..", "scripts/templates-0.js"), "utf8")), "模板牆併入自製模板");
    }

    console.log("PASS p6-main-system：許可→生成→資產帳冊→任務帳冊、拒絕不呼叫供應商、偽造許可拒絕、上傳入帳、本機模式不變、D6、欄位對照 L2");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
