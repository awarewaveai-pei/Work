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
  let permitMode = "allow", usageDown = false, assetsDown = false, releaseTextDown = false;
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
      return new Response(":root{--body-bg:#112233;}", { headers: { "Content-Type": "text/css" } });
    }
    if (url === BASE + "/api/internal/video/workbench/usage") {
      if (usageDown) return Response.json({ ok: false, reason: "infrastructure_error" }, { status: 503 });
      calls.usage.push(JSON.parse(options.body));
      return Response.json({ ok: true, charged: 0, shortfall: 0 });
    }
    throw Error("unexpected " + url);
  }
  const env = {
    OPENAI_API_KEY: "sk-test", VW_TRUST_PROXY_IDENTITY: "1", VW_ALLOWED_HOSTS: "127.0.0.1:*",
    VW_INTERNAL_BASE: BASE + "/", VW_INTERNAL_TOKEN: "internal-secret",
    ENTITLEMENT_ISSUER_TOKEN_VIDEO: "issuer-secret", ENTITLEMENT_PUBLIC_KEYS: "k1:" + pair.publicKey.replace(/\n/g, "\\n"),
  };
  const server = createServer({ dataDir: path.join(dir, "connected"), env, fetchImpl });
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
      near(costs.videoUsd("sora-2", 8), 8 * rates.OPENAI_VIDEO_RATES["sora-2"].usdPerSec, "影片");
      near(costs.speechUsd("gpt-4o-mini-tts", 1000), 1000 * rates.OPENAI_TTS_RATES["gpt-4o-mini-tts"].usdPerMChars / 1e6, "語音");
      near(costs.transcribeUsd("whisper-1", 90), 1.5 * rates.TRANSCRIBE_RATES["whisper-1"].usdPerMin, "語音辨識");
      near(costs.toolUsd("bg-remove"), rates.TOOL_RATES["bg-remove"].usd, "去背");
      assert.equal(costs.imageUsd("gpt-image-2", undefined), rates.IMAGE_RATES["openai-high"].usd, "沒有 usage = 該模型固定價，不是 0");
      assert(costs.textUsd("gpt-4.1-mini", undefined, { inputChars: 100, maxOutputTokens: 3000 }) > 0);
      // Image models are priced only when cost-model lists them (default model + its dated snapshot); a lookalike name is refused.
      costs.priceOf("image", require("../backend/generation-policy.cjs").models({}).image);
      costs.priceOf("image", "gpt-image-2.5-flare-2026-09-08");
      assert.throws(() => costs.priceOf("image", "gpt-image-2.6-flare"), /尚無價目/, "未登記的新版本不得用名稱猜價");
      for (const [kind, model] of [["video", "veo-x"], ["audio", "nope-tts"], ["image", "dall-e-3"], ["text", "mystery-1"], ["3d", undefined]])
        assert.throws(() => costs.priceOf(kind, model), /尚無價目/, kind);
      const speech = JSON.parse((await generate({ type: "spoken", prompt: "你好世界", idempotencyKey: "tts-1" })).body);
      await wait(() => calls.usage.some((u) => u.job_id === speech.id));
      near(calls.usage.find((u) => u.job_id === speech.id).cost_usd, 4 * rates.OPENAI_TTS_RATES["gpt-4o-mini-tts"].usdPerMChars / 1e6, "語音任務");
    }

    // 6d. Connected mode (HttpAdapter): the server's refusal message reaches the user, never a bare status code.
    {
      const vm = require("node:vm"), ctx = { window: {}, AbortController, setTimeout, clearTimeout,
        fetch: async () => new Response(JSON.stringify({ error: { message: "OpenAI 額度不足" } }), { status: 503 }) };
      vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../shared/adapters.js"), "utf8"), ctx);
      const http = new ctx.window.VideoWorkbenchAdapters.HttpAdapter({ apiBaseUrl: "/api/vw", timeoutMs: 1000 });
      await assert.rejects(http.request("/generations", "POST", {}), /OpenAI 額度不足/);
    }

    // 6c. 送審與投遞 links to next-admin's /release for the registered asset; an undeliverable ratio gets no link.
    {
      const vm = require("node:vm");
      const ratios = { "16:9": { deliverable: true }, "1:1": { deliverable: false, note: "此比例尚不能投遞" } };
      const ctx = { VideoWorkbench: { request: async (p) => (p === "/capabilities" ? { mainSystem: { organizationId: ORG } } : { ratios }) }, document: {}, URLSearchParams };
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
    local.close();

    // 8. D6: 1:1 / 4:3 delivery = 「此比例尚不能投遞」.
    const { deliveryRatios } = require("../backend/delivery-ratios.cjs");
    const ratios = (await deliveryRatios(["16:9", "1:1", "4:3"])).ratios;
    assert.equal(ratios["16:9"].deliverable, true);
    for (const r of ["1:1", "4:3"]) assert.deepEqual([ratios[r].deliverable, ratios[r].note], [false, "此比例尚不能投遞"]);
    assert.match(fs.readFileSync(path.join(__dirname, "../scripts/tools-editor.js"), "utf8"), /delivery\?\.note \|\| "此比例尚不能投遞"/);

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

    // 8c. Theme saved on app reaches video.aware-wave.com: appended after the bundled :root (wins), cached 30 s;
    // local mode never asks; a bad answer keeps the last good block.
    const themeCss = (await request(port, "GET", "/awarewave/theme.css")).body;
    assert.match(themeCss, /^:root\s*\{[\s\S]*\}\n:root\{--body-bg:#112233;\}$/);
    await request(port, "GET", "/awarewave/theme.css");
    assert.equal(calls.theme, 1, "30 秒內不重抓");
    const { savedTheme } = require("../backend/appearance.cjs");
    assert.equal(await savedTheme({ env: {}, fetchImpl: () => assert.fail("本機模式不得連主系統") })(), "");
    let clock = 0, answer = ":root{--a:#111;}";
    const linked = savedTheme({ env, now: () => clock, fetchImpl: async () => new Response(answer) });
    assert.equal(await linked(), ":root{--a:#111;}");
    clock = 31000; answer = "</style><script>x</script>";
    let gate; const slow = savedTheme({ env, fetchImpl: () => new Promise((r) => { gate = () => r(new Response(":root{--b:#222;}")); }) });
    const pair = [slow(), slow()]; gate();
    assert.deepEqual(await Promise.all(pair), [":root{--b:#222;}", ":root{--b:#222;}"], "併發請求共用同一次抓取");
    assert.equal(await linked(), ":root{--a:#111;}", "壞回應保留上一份");
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
      for (const f of new Set([...Object.values(require("../backend/main-system.cjs").PAID_ROUTES), "video.image", "video.motion", "video.tts", "video.bg-remove", "video.3d"]))
        assert(askTable.includes(`grantFor("${f}")`), "usage 路由能計費 " + f);
      for (const field of Object.keys(calls.usage[0])) assert(usageLib.includes(field), "service-usage 讀 " + field);
      const products = read("lib/portal/products.ts");
      for (const f of ["video.image", "video.motion", "video.tts", "video.script", "video.transcribe", "video.bg-remove", "video.3d"]) assert(products.includes(`"${f}"`), "products.ts 登記 " + f);
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

    console.log("PASS p6-main-system：許可→生成→資產帳冊→任務帳冊、拒絕不呼叫供應商、偽造許可拒絕、上傳入帳、本機模式不變、D6、欄位對照 L2");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
