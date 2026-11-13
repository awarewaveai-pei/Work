// ElevenLabs free-tier card (backend/elevenlabs.cjs): the 驗收閘. The ElevenLabs rows (配音, 字幕辨識, 音軌分離, 去配樂・重配音效)
// appear only with the key; on the free plan they are 免費 with the credits left as a note, on any other plan the list price
// (cost-model.ts ELEVENLABS_RATES); a quota / paid_plan_required refusal fails the job and charges nothing; an old draft of
// each touched tool still opens. Fake vendor only.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static");
const { isolatedServer } = require("./isolated-server.cjs");
const { resolveSource } = require("../backend/appearance.cjs");
const { elevenlabsListUsd } = require(path.join(resolveSource(path.join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));
const elevenlabs = require("../backend/elevenlabs.cjs");
const pass = (m) => console.log("PASS " + m);
const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vw-eleven-"));
const make = (name, args) => { const f = path.join(tmp, name); assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, f], { windowsHide: true }).status, 0); return f; };
const mp3 = fs.readFileSync(make("tone.mp3", ["-f", "lavfi", "-i", "sine=frequency=440:duration=5", "-c:a", "libmp3lame"]));
const video = make("clip.mp4", ["-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=6", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]);

// Fake ElevenLabs. plan = the subscription tier; refuse = { route: [status, detail] } for the refusal cases.
function fakeEleven({ plan = "free", refuse = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    url = String(url);
    assert(url.startsWith("https://api.elevenlabs.io/"), "未預期的網路請求：" + url);
    assert.equal(init.headers["xi-api-key"], "test-only-eleven");
    const route = new URL(url).pathname;
    calls.push({ route, url, body: init.body });
    const hit = Object.entries(refuse).find(([r]) => route.startsWith(r));
    if (hit) return Response.json({ detail: hit[1][1] }, { status: hit[1][0] });
    if (route === "/v1/user/subscription") return Response.json({ tier: plan, character_count: 2447, character_limit: 10000 });
    if (route === "/v1/speech-to-text") return Response.json({ language_code: "zho", words: [{ text: "大家", start: 0.1, end: 0.4, type: "word", logprob: -0.01 }, { text: "好", start: 0.4, end: 0.6, type: "word", logprob: -0.01 }, { text: "。", start: 0.6, end: 0.6, type: "word", logprob: 0 }] });
    if (/^\/v1\/(text-to-speech|sound-generation|audio-isolation)/.test(route)) return new Response(mp3, { headers: { "Content-Type": "audio/mpeg" } });
    throw Error("未預期的 ElevenLabs 路徑：" + route);
  };
  return { calls, fetchImpl };
}
const env = { ELEVENLABS_API_KEY: "test-only-eleven" };
const settle = async (base, id) => {
  for (let i = 0; i < 400; i++) {
    const job = await (await fetch(base + "/api/vw/generations/" + id)).json();
    if (!["queued", "running"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("job did not finish");
};
const post = async (base, route, body) => {
  const r = await fetch(base + "/api/vw" + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const caps = async (base) => (await fetch(base + "/api/vw/capabilities")).json();
const row = (c) => ({
  speech: c.speech.models.find((m) => m.vendor === "ElevenLabs"),
  transcribe: c.transcribe.engines.find((e) => e.provider === "ElevenLabs"),
  separate: c.audioTools.separate.engines.find((e) => e.vendor === "ElevenLabs"),
  sfx: c.audioTools.sfx.engines.find((e) => e.vendor === "ElevenLabs"),
});
// A source file the job can read (/generated/<uuid>.mp4 = a local file, backend/api.cjs localFile).
const source = (dataDir) => {
  const url = "/generated/" + require("node:crypto").randomUUID() + ".mp4";
  fs.mkdirSync(path.join(dataDir, "generated"), { recursive: true });
  fs.copyFileSync(video, path.join(dataDir, url.slice(1)));
  return { url, type: "video/mp4", name: "clip.mp4" };
};

(async () => {
  // 1. No key: the rows are listed unavailable, nothing asks ElevenLabs.
  {
    elevenlabs.forget();
    const fake = fakeEleven();
    const { base } = await isolatedServer("vw-eleven-nokey-", { fetchImpl: fake.fetchImpl });
    const r = row(await caps(base));
    assert.deepEqual(Object.values(r).map((x) => x.available), [false, false, false, false]);
    assert.equal(fake.calls.length, 0);
    assert.equal((await post(base, "/generations", { type: "spoken", prompt: "你好", speechModel: "eleven_multilingual_v2" })).status, 503);
    pass("沒有 ELEVENLABS_API_KEY：四個工具的 ElevenLabs 列都標未啟用、指名送出 503、不呼叫 ElevenLabs");
  }
  // 2. Free plan: every row 免費 (usd 0) with the credits left as its note, free rows first; the plan is read once per 10 min.
  {
    elevenlabs.forget();
    const fake = fakeEleven();
    const { base } = await isolatedServer("vw-eleven-free-", { env, fetchImpl: fake.fetchImpl });
    const c = await caps(base), r = row(c);
    for (const [tool, x] of Object.entries(r)) {
      assert.equal(x.available, true, tool);
      assert.equal(x.price.usd, 0, tool);
      assert.match(x.note, /ElevenLabs 免費額度，本月剩 7,553 點。$/, tool);
    }
    assert.deepEqual(c.speech.models.map((m) => m.id).slice(0, 2), ["edge-tts", "eleven_multilingual_v2"], "免費列排在付費列前面");
    assert.deepEqual(c.transcribe.engines.map((e) => e.id).slice(0, 2), ["host", "elevenlabs"]);
    assert.deepEqual([c.audioTools.separate.defaultEngine, c.audioTools.sfx.defaultEngine], ["local", "elevenlabs"]);
    await caps(base);
    assert.equal(fake.calls.filter((x) => x.route === "/v1/user/subscription").length, 1, "方案每次開頁都重查");
    pass("免費方案：四列都是免費（usd 0）＋本月剩餘點數；免費排前面；方案 10 分鐘內只查一次");
    // Eleven Music: 402 paid_plan_required on the free plan -> off with its reason, refused before any vendor call.
    const em = c.music.models.find((m) => m.id === "music_v2_5");
    assert.deepEqual([em.available, em.note], [false, "需要 ElevenLabs 付費方案"]);
    const refused = await post(base, "/generations", { type: "audio", operation: "music", prompt: "x", musicModel: "music_v2_5", settings: { seconds: 30 } });
    assert.equal(refused.status, 503);
    assert.equal(fake.calls.filter((x) => x.route === "/v1/music").length, 0);
    pass("免費方案：Eleven Music 標未啟用（需要 ElevenLabs 付費方案），指名送出 503、不呼叫 /v1/music");

    // A job on the free plan: charged 0; the voice of another vendor maps to its nearest ElevenLabs voice.
    const spoken = await settle(base, (await post(base, "/generations", { type: "spoken", prompt: "你好", voice: "Charon", speechModel: "eleven_multilingual_v2" })).body.id);
    assert.equal(spoken.status, "succeeded", spoken.error);
    assert.equal(spoken.costUsd, 0);
    assert.match(fake.calls.find((x) => x.route.startsWith("/v1/text-to-speech/")).route, /JBFqnCBsd6RMkjVDRZzb$/);
    pass("免費方案配音：成功、扣 0；別家男聲對到 ElevenLabs 男聲");
  }
  // 3. A paid plan: the list price (cost-model.ts), no free note; 音軌分離 / 去配樂 have no paid feature key, so they are off.
  {
    elevenlabs.forget();
    const { base } = await isolatedServer("vw-eleven-paid-", { env, fetchImpl: fakeEleven({ plan: "creator" }).fetchImpl });
    const r = row(await caps(base));
    assert.deepEqual(r.speech.price, { usd: elevenlabsListUsd("eleven_multilingual_v2", 1000), unit: "千字" });
    assert.deepEqual(r.transcribe.price, { usd: elevenlabsListUsd("scribe_v2", 60), unit: "分鐘" });
    assert(r.speech.price.usd > 0 && r.transcribe.price.usd > 0);
    assert.deepEqual([r.speech.available, r.transcribe.available, r.separate.available, r.sfx.available], [true, true, false, false]);
    assert.equal((await caps(base)).music.models.find((m) => m.id === "music_v2_5").available, true, "付費方案時 Eleven Music 可用");
    assert.doesNotMatch(JSON.stringify(r), /免費額度/);
    pass("付費方案：配音／辨識照 cost-model.ts 牌價；音軌分離與去配樂沒有付費鍵，標未啟用");
  }
  // 4. Refusals: quota used up and paid_plan_required fail the job with a plain message and charge nothing.
  {
    elevenlabs.forget();
    const fake = fakeEleven({ refuse: { "/v1/text-to-speech": [401, { status: "quota_exceeded", message: "This request exceeds your quota" }], "/v1/audio-isolation": [402, { status: "paid_plan_required", message: "x" }] } });
    const { base, dataDir } = await isolatedServer("vw-eleven-refuse-", { env, fetchImpl: fake.fetchImpl });
    const spoken = await settle(base, (await post(base, "/generations", { type: "spoken", prompt: "你好", speechModel: "eleven_multilingual_v2" })).body.id);
    assert.equal(spoken.status, "failed");
    assert.match(spoken.error, /ElevenLabs 本月免費額度已用完/);
    assert.equal(spoken.costUsd, undefined);
    const sep = await settle(base, (await post(base, "/generations", { type: "video", operation: "separate", references: { src: source(dataDir) }, settings: { separateEngine: "elevenlabs" } })).body.id);
    assert.equal(sep.status, "failed");
    assert.match(sep.error, /需要付費方案/);
    assert.equal(sep.result, undefined);
    pass("額度用完（401 quota_exceeded）與需付費方案（402）：任務失敗、中文說明、不扣款");
  }
  // 5. Real runs through our routes (fake vendor): 只留人聲, 去配樂＋音效, Scribe; old drafts without an engine keep the old way.
  {
    elevenlabs.forget();
    const fake = fakeEleven();
    const { base, dataDir } = await isolatedServer("vw-eleven-run-", { env, fetchImpl: fake.fetchImpl });
    const sep = await settle(base, (await post(base, "/generations", { type: "video", operation: "separate", references: { src: source(dataDir) }, settings: { separateEngine: "elevenlabs" } })).body.id);
    assert.equal(sep.status, "succeeded", sep.error);
    assert.deepEqual([sep.type, sep.result.origin.kind, sep.result.origin.provider, sep.result.origin.costUsd], ["audio", "ai_generated", "ElevenLabs", 0]);
    const sfx = await settle(base, (await post(base, "/generations", { type: "video", operation: "sfx", references: { src: source(dataDir) }, settings: { sfxPrompt: "雨打在窗上" } })).body.id);
    assert.equal(sfx.status, "succeeded", sfx.error);
    const info = await require("../backend/media-inspect.cjs").inspectMedia(path.join(dataDir, sfx.result.url.slice(1)));
    assert(info.audio && info.duration > 5.5, "成品要有聲音且是全片長度");
    assert.equal(JSON.parse(fake.calls.find((x) => x.route === "/v1/sound-generation").body).text, "雨打在窗上");
    const spending = () => fake.calls.filter((x) => x.route !== "/v1/user/subscription").length, before = spending();
    const old = await settle(base, (await post(base, "/generations", { type: "video", operation: "separate", references: { src: source(dataDir) }, settings: {} })).body.id);
    assert.equal(old.status, "succeeded", old.error);
    assert.equal(old.result.origin.kind, "render");
    assert.equal(spending(), before, "舊草稿（沒有 separateEngine）改走了 ElevenLabs");
    const words = await post(base, "/transcriptions", { source: source(dataDir), engine: "elevenlabs", language: "繁體中文", words: true });
    assert.equal(words.status, 200, JSON.stringify(words.body));
    assert.deepEqual(words.body.segments.map((s) => s.text), ["大家好。"]);
    assert.deepEqual(words.body.words.map((w) => w.text), ["大家", "好"]);
    pass("經我們的路由：只留人聲、去配樂＋音效（全片長、有聲）、Scribe 逐字；舊的音軌分離草稿仍走本機");
  }
  // 6. The page: each touched tool opens from an old draft and shows its vendor buttons (no dropdown), ElevenLabs 免費.
  {
    elevenlabs.forget();
    const { chromium } = require("playwright");
    const { base, dataDir } = await isolatedServer("vw-eleven-ui-", { env: { ...env, GEMINI_API_KEY: "test-only" }, fetchImpl: fakeEleven().fetchImpl });
    const shots = process.env.VW_SHOTS_DIR;
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
      await p.goto(base + "/pages/tools.html");
      await p.waitForFunction(() => VideoWorkbench.tools?.acceptAsset);
      const src = source(dataDir);
      for (const [tool, key, settings, asset] of [
        ["voice", "voiceModel", { voiceModel: "gpt-4o-mini-tts", voiceText: "舊草稿" }, null],
        ["subtitle", "subtitleEngine", { subtitleEngine: "gemini" }, src],
        ["separate", "separateEngine", {}, src],
        ["sfx", "sfxEngine", { sfxPrompt: "雨聲" }, src],
      ]) {
        await p.evaluate((x) => VideoWorkbench.tools.acceptAsset(x), { tool, settings, ...(asset ? { asset } : {}) });
        const button = p.locator(`[data-flow-choice="${key}"]`).filter({ hasText: "ElevenLabs" });
        await button.waitFor({ timeout: 15000 });
        assert.match(await button.innerText(), /ElevenLabs.* · 免費$/, tool);
        assert.equal(await button.isDisabled(), false, tool);
        assert.equal(await p.locator(`select[data-key="${key}"]`).count(), 0, tool + " 不可用下拉");
        if (tool === "separate") assert.equal(await p.locator('[data-flow-choice="separateEngine"][aria-pressed="true"]').getAttribute("data-flow-value"), "local", "舊草稿預設仍是本機原音軌");
        await button.click();
        await p.getByText("本月剩 7,553 點").first().waitFor();
        if (shots) await p.screenshot({ path: path.join(shots, "eleven-" + tool + ".png"), fullPage: false });
      }
      assert.deepEqual(errors, []);
      pass("頁面：配音、字幕、音軌分離、去配樂四個工具從舊草稿開啟，ElevenLabs 按鈕顯示免費＋剩餘點數，無下拉");
    } finally {
      await browser.close();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
