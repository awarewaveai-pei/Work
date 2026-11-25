// Card S1 (agency-os/handoffs/2026-11-25-video-tools-unlock/briefs/S1-sfx.md) 驗收: the paid feature video.audio-tools.
// B1 a paid row runs only with a permit; success charges the run's real cost, a failure charges nothing.
// B2 an ElevenLabs row of 音軌分離／去配樂 is off on the free plan (not for commercial use).
// B6 a missing vendor key = the row is off (503 before the job), never another vendor.
// Gemini's cue list is checked strictly (out of range, overlap, too many). Fake vendors and a fake next-admin only.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { generateKeyPairSync, randomUUID } = require("node:crypto"), { pathToFileURL } = require("node:url"), { spawnSync } = require("node:child_process");
const ffmpeg = require("ffmpeg-static");
const appDir = require("../backend/appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
const { createApi } = require("../backend/api.cjs");
const elevenlabs = require("../backend/elevenlabs.cjs"), videoDescribe = require("../backend/video-describe.cjs"), audioTools = require("../backend/audio-tools.cjs");
const costs = require("../backend/provider-cost.cjs");
const pass = (m) => console.log("PASS " + m);

const ORG = "11111111-1111-4111-8111-111111111111", USER = "44444444-4444-4444-8444-444444444444", BASE = "http://next-admin.test:3000";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/interactions";
const pair = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vw-sfx-billing-"));
const make = (name, args) => { const f = path.join(tmp, name); assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, f], { windowsHide: true }).status, 0); return f; };
const video = make("clip.mp4", ["-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=6", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]);
const tone = fs.readFileSync(make("tone.mp3", ["-f", "lavfi", "-i", "sine=frequency=880:duration=30", "-c:a", "libmp3lame"]));
const silence = fs.readFileSync(make("silence.mp3", ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "6", "-c:a", "libmp3lame"]));
const CUES = [{ start: 1, end: 2, prompt: "a door slams shut" }, { start: 4, end: 5, prompt: "glass shatters on a tile floor" }];
const USAGE = { total_input_tokens: 1800, total_output_tokens: 120, total_thought_tokens: 0 };

// One server: a fake next-admin (permit, usage, jobs, assets, audio policy) + fake ElevenLabs + fake Gemini.
const MIRELO_SPEECH = fs.readFileSync(make("speech.wav", ["-f", "lavfi", "-i", "sine=frequency=220:duration=6", "-ar", "48000", "-ac", "1"]));
const MIRELO_SFX = fs.readFileSync(make("sfx.wav", ["-f", "lavfi", "-i", "sine=frequency=1200:duration=6", "-ar", "48000", "-ac", "1"]));
async function harness({ plan = "creator", env: extra = {}, permit = true, mireloStatus = "succeeded", mireloCredits = 60, gemini = () => Response.json({ steps: [{ content: [{ type: "text", text: JSON.stringify(CUES) }] }], usage: USAGE }), refuse = {} } = {}) {
  elevenlabs.forget();
  const { signPermit } = await import(pathToFileURL(path.join(appDir, "lib/entitlements/permit.ts")).href);
  const dir = fs.mkdtempSync(path.join(tmp, "data-"));
  const calls = { permits: [], usage: [], vendor: [] };
  async function fetchImpl(url, options = {}) {
    url = String(url);
    if (url.startsWith("https://api.mirelo.ai/") || url.startsWith("https://upload.mirelo.test/") || url.startsWith("https://cdn.mirelo.test/")) {
      const u = new URL(url);
      calls.vendor.push({ route: "mirelo " + (options.method || "GET") + " " + u.pathname, body: typeof options.body === "string" ? options.body : null, auth: options.headers?.Authorization, form: options.body instanceof FormData ? [...options.body.keys()] : null });
      if (u.pathname === "/v3/assets") return Response.json({ id: "asset_1", upload_url: "https://upload.mirelo.test/put", max_bytes: 1073741824, fields: { key: "k", Policy: "p" } }, { status: 201 });
      if (u.host === "upload.mirelo.test") return new Response(null, { status: 204 });
      if (u.pathname === "/v3/video-to-sfx/generations") return Response.json({ id: "gen_1", status: "queued", urls: { self: "https://api.mirelo.ai/v3/video-to-sfx/generations/gen_1" } }, { status: 202 });
      if (u.pathname === "/v3/video-to-sfx/generations/gen_1") return Response.json({ id: "gen_1", status: mireloStatus, credits: mireloCredits, result: mireloStatus !== "succeeded" ? null : { outputs: [
        { type: "mix", status: "succeeded", variants: [{ files: { audio: { url: "https://cdn.mirelo.test/sfx.wav", bytes: MIRELO_SFX.length } } }] },
        { type: "sfx", status: "succeeded", variants: [{ files: { audio: { url: "https://cdn.mirelo.test/sfx.wav", bytes: MIRELO_SFX.length } } }] },
        { type: "speech", status: "succeeded", variants: [{ files: { audio: { url: "https://cdn.mirelo.test/speech.wav", bytes: MIRELO_SPEECH.length } } }] },
      ] } });
      if (u.pathname === "/sfx.wav") return new Response(MIRELO_SFX);
      if (u.pathname === "/speech.wav") return new Response(MIRELO_SPEECH);
      throw Error("unexpected Mirelo route " + url);
    }
    if (url === GEMINI) { calls.vendor.push({ route: "gemini", body: options.body }); return gemini(JSON.parse(options.body)); }
    if (url.startsWith("https://api.elevenlabs.io/")) {
      const route = new URL(url).pathname;
      if (route !== "/v1/user/subscription") calls.vendor.push({ route, body: options.body });
      if (refuse[route]) return Response.json({ detail: { status: "x", message: "refused" } }, { status: refuse[route] });
      if (route === "/v1/user/subscription") return Response.json({ tier: plan, character_count: 0, character_limit: 10000 });
      if (route === "/v1/audio-isolation") return new Response(silence);
      if (route === "/v1/sound-generation") return new Response(tone);
      throw Error("unexpected ElevenLabs route " + route);
    }
    if (!url.startsWith(BASE)) throw Error("unexpected vendor " + url);
    if (url === BASE + "/api/internal/entitlements/permit/video") {
      const body = JSON.parse(options.body), now = Math.floor(Date.now() / 1000);
      calls.permits.push(body);
      if (!permit) return Response.json({ allowed: false, reason: "no_credits" });
      return Response.json({ allowed: true, permit: signPermit({ format_version: 1, tenant: body.organization_id, product_key: "video", feature_key: body.feature_key, source: "comp", entitlement_id: "e", source_ref: null, limits: {}, max_spend: null, actor: body.actor, on_behalf_of: body.organization_id, issued_at: now, expires_at: now + 600, kid: "k1" }, pair.privateKey) });
    }
    if (url.startsWith(BASE + "/api/internal/video/workbench/audio-policy?")) return Response.json({ ok: true, externalAudioAllowed: true });
    if (url === BASE + "/api/internal/video/workbench/usage") { calls.usage.push(JSON.parse(options.body)); return Response.json({ ok: true }); }
    if (url === BASE + "/api/internal/video/workbench/assets") return Response.json({ ok: true, assetId: randomUUID(), checksumSha256: "a".repeat(64), objectUrl: "https://r2.test/x" });
    if (url.startsWith(BASE + "/api/internal/video/workbench/jobs")) return Response.json({ ok: true, job: {} });
    if (url.startsWith(BASE + "/api/internal/theme/css")) return new Response(":root{}");
    throw Error("unexpected " + url);
  }
  const env = {
    VW_INTERNAL_BASE: BASE, VW_INTERNAL_TOKEN: "internal-secret", ENTITLEMENT_ISSUER_TOKEN_VIDEO: "issuer-secret", ENTITLEMENT_PUBLIC_KEYS: "k1:" + pair.publicKey.replace(/\n/g, "\\n"),
    OPENAI_API_KEY: "test-only", GEMINI_API_KEY: "test-only", ELEVENLABS_API_KEY: "test-only", MIRELO_API_KEY: "test-only", VW_MIRELO_POLL_MS: "20", VW_USAGE_RETRY_MS: "50", ...extra,
  };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  const api = createApi({ dataDir: dir, env, fetchImpl, appDir, orgId: ORG });
  const server = http.createServer(async (req, res) => {
    req.vwIdentity = { userId: USER, orgId: ORG, billingOrgId: ORG };
    if (!(await api(req, res))) { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  server.unref();
  const at = "http://127.0.0.1:" + server.address().port + "/api/vw";
  const src = "/generated/" + randomUUID() + ".mp4";
  fs.mkdirSync(path.join(dir, "generated"), { recursive: true });
  fs.copyFileSync(video, path.join(dir, src.slice(1)));
  const post = async (route, body) => { const r = await fetch(at + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const job = (tool, engine, extraSettings = {}) => ({ type: tool === "separate" ? "audio" : "video", operation: tool, prompt: tool, references: { src: { url: src } }, settings: { [audioTools.KEY[tool]]: engine, ...extraSettings } });
  const settle = async (id) => {
    for (let i = 0; i < 600; i++) {
      const j = await (await fetch(at + "/generations/" + id)).json();
      if (!["queued", "running"].includes(j.status)) return j;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("job did not finish");
  };
  const usageSettled = async () => { for (let i = 0; i < 60 && !calls.usage.length; i++) await new Promise((r) => setTimeout(r, 50)); return calls.usage; };
  const caps = async () => (await fetch(at + "/capabilities")).json();
  return { calls, dir, post, job, settle, usageSettled, caps };
}
// Peak level (dB) of the result's sound between two times.
const peak = (file, from, to) => {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-ss", String(from), "-t", String(to - from), "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"], { windowsHide: true, encoding: "utf8" });
  return Number(/max_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr)?.[1] ?? -Infinity);
};

(async () => {
  // 1. B1 success (way B on a paid ElevenLabs plan): the permit is asked for video.audio-tools; charged = Gemini's usage +
  //    isolation + each sound, at the list prices; the sounds land at the cue times; the picture is copied.
  {
    const h = await harness();
    const sent = await h.post("/generations", h.job("sfx", "elevenlabs", { sfxPrompt: "加一點雨聲" }));
    assert.equal(sent.status, 202, JSON.stringify(sent.body));
    const done = await h.settle(sent.body.id);
    assert.equal(done.status, "succeeded", done.error);
    assert.deepEqual(h.calls.permits.map((p) => p.feature_key), ["video.audio-tools"]);
    const out = path.join(h.dir, done.result.url.slice(1)), info = await require("../backend/media-inspect.cjs").inspectMedia(out);
    const seconds = (await require("../backend/media-inspect.cjs").inspectMedia(video)).duration;
    const expected = Math.round((costs.interactionsTextUsd(videoDescribe.MODEL, USAGE) + costs.elevenListUsd("audio-isolation", seconds) + costs.elevenListUsd("sound-generation", 1) * 2) * 1e6) / 1e6;
    assert.equal(done.result.origin.costUsd, expected);
    const usage = await h.usageSettled();
    assert.deepEqual(usage.map((u) => [u.feature_key, u.cost_usd]), [["video.audio-tools", expected]]);
    const sounds = h.calls.vendor.filter((c) => c.route === "/v1/sound-generation").map((c) => JSON.parse(c.body));
    assert.deepEqual(sounds.map((s) => [s.text, s.duration_seconds, s.model_id]), CUES.map((c) => [c.prompt, 1, "eleven_text_to_sound_v3"]));
    const look = JSON.parse(h.calls.vendor.find((c) => c.route === "gemini").body);
    assert.equal(look.model, videoDescribe.MODEL);
    assert.match(look.input[0].text, /加一點雨聲/, "使用者的額外指示要一起送");
    assert.equal(h.calls.vendor[0].route, "gemini", "先看片（最便宜）再分離人聲");
    assert(peak(out, 1.2, 1.8) > -30 && peak(out, 4.2, 4.8) > -30, "音效要在 cue 時間點: " + [peak(out, 1.2, 1.8), peak(out, 4.2, 4.8)]);
    assert(peak(out, 2.4, 3.6) < -50, "cue 之間應該安靜（人聲分離回的是靜音）: " + peak(out, 2.4, 3.6));
    assert(info.video && Math.abs(info.duration - seconds) < 0.2);
    assert.match(done.result.note || "", /Gemini 配了 2 段音效/);
    pass("B1 成功：功能鍵 video.audio-tools 取許可；扣款＝Gemini 用量＋人聲分離＋每段音效的牌價；音效落在 cue 時間點");
  }
  // 2. B1 failures charge nothing: Gemini refuses (nothing else called), or a sound fails after the isolation ran.
  {
    const h = await harness({ gemini: () => Response.json({ error: { message: "busy" } }, { status: 500 }) });
    const done = await h.settle((await h.post("/generations", h.job("sfx", "elevenlabs"))).body.id);
    assert.equal(done.status, "failed");
    assert.deepEqual(h.calls.vendor.map((c) => c.route), ["gemini"]);
    const h2 = await harness({ refuse: { "/v1/sound-generation": 500 } });
    const done2 = await h2.settle((await h2.post("/generations", h2.job("sfx", "elevenlabs"))).body.id);
    assert.equal(done2.status, "failed");
    assert(h2.calls.vendor.some((c) => c.route === "/v1/audio-isolation"));
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual([h.calls.usage, h2.calls.usage], [[], []]);
    pass("B1 失敗不扣：Gemini 失敗、或人聲分離後音效失敗，都沒有用量紀錄");
  }
  // 3. B1 without a permit (balance short): 403 before the job, no vendor call.
  {
    const h = await harness({ permit: false });
    for (const [tool, engine] of [["sfx", "elevenlabs"], ["separate", "elevenlabs"]]) {
      const r = await h.post("/generations", h.job(tool, engine));
      assert.equal(r.status, 403, tool + " " + JSON.stringify(r.body));
    }
    assert.deepEqual(h.calls.permits.map((p) => p.feature_key), ["video.audio-tools", "video.audio-tools"]);
    assert.deepEqual(h.calls.vendor, []);
    const free = await h.post("/generations", h.job("separate", "local"));
    assert.equal(free.status, 202, "本機原音軌免費，不問許可");
    assert.equal(h.calls.permits.length, 2);
    pass("B1 沒有許可：去配樂、只留人聲都 403，不呼叫任何廠商；本機原音軌照常免費");
  }
  // 4. B2 the free ElevenLabs plan: both ElevenLabs rows are off with the reason; a named job is 503 before any vendor call.
  {
    const h = await harness({ plan: "free" });
    const c = await h.caps();
    for (const tool of ["separate", "sfx"]) {
      const row = c.audioTools[tool].engines.find((e) => e.id === "elevenlabs");
      assert.equal(row.available, false, tool);
      assert.match(row.note, /^ElevenLabs 免費方案不可商用，升級後可用。/, tool);
      const r = await h.post("/generations", h.job(tool, "elevenlabs"));
      assert.equal(r.status, 503, tool);
    }
    assert.equal(c.audioTools.separate.engines.find((e) => e.id === "local").available, true);
    assert.deepEqual(h.calls.vendor, []);
    pass("B2 ElevenLabs 免費方案：音軌分離、去配樂的 ElevenLabs 列都不可用（說明不可商用），指名送出 503");
  }
  // 5. B6 a missing key: the row is off and named jobs are 503 -- nothing else runs in its place.
  {
    for (const missing of ["GEMINI_API_KEY", "ELEVENLABS_API_KEY"]) {
      const h = await harness({ env: { [missing]: undefined } });
      const row = (await h.caps()).audioTools.sfx.engines.find((e) => e.id === "elevenlabs");
      assert.equal(row.available, false, missing);
      assert.match(row.note, new RegExp(missing));
      assert.equal((await h.post("/generations", h.job("sfx", "elevenlabs"))).status, 503, missing);
      assert.deepEqual(h.calls.vendor, [], missing);
    }
    pass("B6 沒有 GEMINI_API_KEY 或 ELEVENLABS_API_KEY：該列不可用、送出 503、不改用別家");
  }
  // 6. B5 the quote: the row's price for this source's length.
  {
    const h = await harness();
    const q = await h.post("/generations/quote", h.job("sfx", "elevenlabs"));
    assert.equal(q.status, 200, JSON.stringify(q.body));
    const seconds = (await require("../backend/media-inspect.cjs").inspectMedia(video)).duration;
    assert.deepEqual([q.body.costUsd, q.body.estimate], [audioTools.usdOf("sfx:elevenlabs", seconds), true]);
    pass("B5 估價：/generations/quote 依來源秒數回該列價格");
  }
  // 7. Gemini's cues: out of range, overlapping and too many are each refused.
  {
    const ok = videoDescribe.parseCues("```json\n" + JSON.stringify(CUES) + "\n```", 6);
    assert.deepEqual(ok, CUES);
    assert.throws(() => videoDescribe.parseCues(JSON.stringify([{ start: 1, end: 9, prompt: "rain" }]), 6), /超出影片長度/);
    assert.throws(() => videoDescribe.parseCues(JSON.stringify([{ start: 1, end: 3, prompt: "rain" }, { start: 2, end: 4, prompt: "wind" }]), 6), /重疊/);
    assert.throws(() => videoDescribe.parseCues(JSON.stringify(Array.from({ length: 13 }, (_, i) => ({ start: i * 0.4, end: i * 0.4 + 0.3, prompt: "tick" }))), 6), /超過 12 段/);
    assert.throws(() => videoDescribe.parseCues(JSON.stringify([{ start: 3, end: 3.04, prompt: "click" }]), 6), /短於 0.5 秒/, "critic m2: 太短的段落會被付費卻無聲");
    pass("Gemini 回傳驗證：越界、重疊、超過 12 段、短於 0.5 秒都拒絕");
  }
  // 8. Way A (Mirelo, card S1b): the default row; preserve_speech off + separate_speech on; the upload carries no key;
  //    charged = the job's reported credits at cost-model.ts usdPerCredit; the result = Mirelo's effects + its speech.
  {
    const h = await harness({ mireloCredits: 61 });
    assert.equal((await h.caps()).audioTools.sfx.defaultEngine, "mirelo");
    const sent = await h.post("/generations", { ...h.job("sfx", "mirelo"), settings: {} });
    assert.equal(sent.status, 202, JSON.stringify(sent.body));
    const done = await h.settle(sent.body.id);
    assert.equal(done.status, "succeeded", done.error);
    const { MIRELO_RATES } = require(path.join(appDir, "lib/ai/cost-model.ts"));
    const expected = Math.round(61 * MIRELO_RATES["sfx-2.0"].usdPerCredit * 1e6) / 1e6;
    assert.deepEqual([done.result.origin.provider, done.result.origin.model, done.result.origin.costUsd], ["Mirelo", "sfx-2.0", expected]);
    assert.deepEqual((await h.usageSettled()).map((u) => [u.feature_key, u.cost_usd]), [["video.audio-tools", expected]]);
    const create = JSON.parse(h.calls.vendor.find((c) => c.route === "mirelo POST /v3/video-to-sfx/generations").body);
    assert.deepEqual([create.model, create.num_variants, create.controls, create.input.video], ["sfx-2.0", 1, { preserve_speech: false, separate_speech: true }, { type: "asset", id: "asset_1" }]);
    const upload = h.calls.vendor.find((c) => c.route.startsWith("mirelo POST /put"));
    assert.equal(upload.auth, undefined, "上傳網址不可帶金鑰");
    assert.equal(upload.form.at(-1), "file", "檔案要放在最後一個欄位");
    const out = path.join(h.dir, done.result.url.slice(1));
    assert(peak(out, 1, 5) > -30, "成品要有 Mirelo 的音效與人聲");
    assert.equal(h.calls.vendor.some((c) => /elevenlabs|gemini/.test(c.route)), false, "A 路不該呼叫 ElevenLabs 或 Gemini");
    const h2 = await harness({ mireloStatus: "failed" });
    assert.equal((await h2.settle((await h2.post("/generations", h2.job("sfx", "mirelo"))).body.id)).status, "failed");
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(h2.calls.usage, []);
    const h3 = await harness({ env: { MIRELO_API_KEY: undefined } });
    const row = (await h3.caps()).audioTools.sfx.engines.find((e) => e.id === "mirelo");
    assert.deepEqual([row.available, /^尚未設定 Mirelo 金鑰。/.test(row.note)], [false, true]);
    assert.equal((await h3.post("/generations", h3.job("sfx", "mirelo"))).status, 503);
    assert.deepEqual(h3.calls.vendor, [], "沒有 Mirelo 金鑰不可改用 B 路");
    pass("A 路 Mirelo：預設列；只要音效＋分離人聲、上傳不帶金鑰；扣回報的 credits；失敗不扣；沒金鑰 503 不改用別家");
  }
})().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
