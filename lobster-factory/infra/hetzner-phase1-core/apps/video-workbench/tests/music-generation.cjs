// 音樂生成 (backend/music.cjs): the card's 驗收閘. One list, one price: /capabilities music.models = the three models with the
// price next-admin cost-model.ts musicUsd charges; a short balance is refused before any vendor call; a draft that saved
// the old label ("Lyria 3.5") still runs and shows that model; the lyrics field follows the chosen model. Fake vendors only.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static");
const { isolatedServer } = require("./isolated-server.cjs");
const { resolveSource } = require("../backend/appearance.cjs");
const { MUSIC_RATES, musicUsd } = require(path.join(resolveSource(path.join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));
const pass = (m) => console.log("PASS " + m);
const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vw-music-"));
const mp3File = path.join(tmp, "song.mp3");
assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libmp3lame", mp3File], { windowsHide: true }).status, 0);
const mp3 = fs.readFileSync(mp3File);
// Fake Google Interactions API: a song + its lyrics text, as the music-generation page documents.
function fakeGoogle() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body, headers: init.headers });
    if (String(url) === "https://generativelanguage.googleapis.com/v1beta/interactions")
      return Response.json({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "[Verse] 測試" }, { type: "audio", mime_type: "audio/mp3", data: mp3.toString("base64") }] }] });
    throw Error("未預期的網路請求：" + url);
  };
  return { calls, fetchImpl };
}
const env = { GEMINI_API_KEY: "test-only-gemini" };
const settle = async (base, id) => {
  for (let i = 0; i < 200; i++) {
    const job = await (await fetch(base + "/api/vw/generations/" + id)).json();
    if (!["queued", "running"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("job did not finish");
};
const post = async (base, route, body, headers = {}) => {
  const r = await fetch(base + "/api/vw" + route, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

(async () => {
  // 1. /capabilities: the three models, their price = cost-model.ts musicUsd; a model without its key is listed unavailable.
  {
    const { base } = await isolatedServer("vw-music-caps-", { env });
    const caps = await (await fetch(base + "/api/vw/capabilities")).json();
    assert.deepEqual(caps.music.models.map((m) => [m.id, m.available, m.lyrics]), [["lyria-3-clip-preview", true, false], ["lyria-3.5", true, true], ["music_v2_5", false, true]]);
    assert.deepEqual(Object.keys(MUSIC_RATES).sort(), caps.music.models.map((m) => m.id).sort());
    for (const m of caps.music.models) assert.equal(m.price.usd, MUSIC_RATES[m.id].usdPerSong ?? musicUsd(m.id, 60), m.id);
    assert.deepEqual(caps.music.models.map((m) => m.price.unit), ["首", "首", "分鐘"]);
    assert.equal(caps.music.defaultModel, "lyria-3.5");
    assert.deepEqual(caps.prices["video.music"], { usd: 0.08, unit: "首" });
    assert.equal(/Mureka/i.test(JSON.stringify(caps)), false);
    pass("/capabilities 列出三個音樂模型，價格＝cost-model.ts；沒金鑰的標未啟用");
  }
  // 1b. Order = the published price, cheapest first: raising the cheapest model's price in cost-model.ts moves it last.
  {
    const music = require("../backend/music.cjs"), usd = (list) => list.map((m) => m.price.usd);
    const listed = music.capability(env).models;
    assert.deepEqual(usd(listed), [...usd(listed)].sort((a, b) => a - b));
    const saved = MUSIC_RATES["lyria-3-clip-preview"].usdPerSong;
    MUSIC_RATES["lyria-3-clip-preview"].usdPerSong = 9;
    try {
      assert.equal(music.capability(env).models.at(-1).id, "lyria-3-clip-preview", "價格變動後沒有重新排序");
    } finally {
      MUSIC_RATES["lyria-3-clip-preview"].usdPerSong = saved;
    }
    pass("模型依伺服器公布價格由便宜到貴排列；改價自動重排");
  }
  // 2. An old draft's label runs its model; the song is kept and charged the listed price; the clip gets no lyrics.
  {
    const fake = fakeGoogle();
    const { base, dataDir } = await isolatedServer("vw-music-run-", { env, fetchImpl: fake.fetchImpl });
    const sent = await post(base, "/generations", { type: "audio", operation: "music", prompt: "溫暖民謠", musicModel: "Lyria 3.5", settings: { lyrics: "[Verse]\n早安" } });
    assert.equal(sent.status, 202, JSON.stringify(sent.body));
    const done = await settle(base, sent.body.id);
    assert.equal(done.status, "succeeded", done.error);
    const body = JSON.parse(fake.calls[0].body);
    assert.equal(body.model, "lyria-3.5");
    assert.match(body.input, /溫暖民謠[\s\S]*Lyrics:\n\[Verse\]\n早安/);
    assert.deepEqual(fs.readFileSync(path.join(dataDir, done.result.url.slice(1))), mp3);
    assert.deepEqual(done.result.origin, { kind: "ai_generated", model: "lyria-3.5", provider: "Google", costUsd: MUSIC_RATES["lyria-3.5"].usdPerSong });
    const clip = await settle(base, (await post(base, "/generations", { type: "audio", operation: "music", prompt: "片頭", musicModel: "Lyria Clip Preview", settings: { lyrics: "不該送出" } })).body.id);
    assert.equal(clip.result.origin.costUsd, MUSIC_RATES["lyria-3-clip-preview"].usdPerSong);
    const clipBody = JSON.parse(fake.calls[1].body);
    assert.equal(clipBody.model, "lyria-3-clip-preview");
    assert.doesNotMatch(clipBody.input, /不該送出/);
    const eleven = await post(base, "/generations", { type: "audio", operation: "music", prompt: "x", musicModel: "music_v2_5", settings: { seconds: 30 } });
    assert.equal(eleven.status, 503);
    // 純器樂 drops the lyrics, so lyrics alone are no prompt (the page sends none either).
    assert.equal((await post(base, "/generations", { type: "audio", operation: "music", prompt: "", musicModel: "lyria-3.5", settings: { instrumental: true, lyrics: "x" } })).status, 400);
    assert.equal(fake.calls.length, 2, "沒金鑰的模型不可呼叫供應商");
    pass("舊草稿的標籤（Lyria 3.5／Lyria Clip Preview）解析到正確模型；成品存檔、扣列出的價；Clip 不送歌詞；沒金鑰 503");
  }
  // 3. Balance short: the permit says no_credits -> 403 before the job exists and before any vendor call.
  {
    const SECRET = "internal-secret", calls = [];
    const fetchImpl = async (url, init = {}) => {
      url = String(url);
      calls.push(url);
      if (url.endsWith("/api/internal/entitlements/permit/video")) {
        assert.equal(JSON.parse(init.body).feature_key, "video.music");
        return Response.json({ allowed: false, reason: "no_credits" });
      }
      if (url.endsWith("/api/internal/theme/css")) return new Response(":root{}", { headers: { "Content-Type": "text/css" } });
      throw Error("未預期的網路請求：" + url);
    };
    const { base } = await isolatedServer("vw-music-credits-", { fetchImpl, env: { ...env, VW_TRUST_PROXY_IDENTITY: "1", VW_ALLOWED_HOSTS: "127.0.0.1:*", VW_INTERNAL_BASE: "http://next-admin.test", VW_INTERNAL_TOKEN: SECRET, ENTITLEMENT_ISSUER_TOKEN_VIDEO: "issuer", ENTITLEMENT_PUBLIC_KEYS: "k1:unused" } });
    const h = { "X-VW-User-Id": "44444444-4444-4444-8444-444444444444", "X-VW-Org-Id": "11111111-1111-4111-8111-111111111111", "X-VW-Billing-Org-Id": "33333333-3333-4333-8333-333333333333", "X-VW-User-Kind": "staff", "X-VW-Role": "owner", "X-VW-Expires": String(Math.floor(Date.now() / 1000) + 120) };
    h["X-VW-Signature"] = require("../backend/session-signature.cjs").sign(SECRET, { userId: h["X-VW-User-Id"], orgId: h["X-VW-Org-Id"], billingOrgId: h["X-VW-Billing-Org-Id"], userKind: h["X-VW-User-Kind"], role: h["X-VW-Role"], expires: h["X-VW-Expires"] });
    const r = await post(base, "/generations", { type: "audio", operation: "music", prompt: "測試", musicModel: "lyria-3.5" }, h);
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.match(r.body.error.message, /點數不足/);
    assert.equal(calls.some((u) => u.includes("generativelanguage")), false, "點數不足時呼叫了供應商");
    assert.equal(calls.filter((u) => u.endsWith("/workbench/jobs")).length, 0, "點數不足時建立了任務");
    pass("點數不足：403，沒有建立任務、沒有呼叫供應商");
  }
  // 4. The page: model cards (no dropdown) with prices, the old label shown as its model, lyrics only for models that take them.
  {
    const { chromium } = require("playwright");
    const { base } = await isolatedServer("vw-music-ui-", { env });
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const p = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
      await p.goto(base + "/pages/tools.html");
      await p.waitForFunction(() => VideoWorkbench.tools?.acceptAsset);
      await p.evaluate(() => VideoWorkbench.tools.acceptAsset({ tool: "music", settings: { musicModel: "Lyria Clip Preview" } }));
      const card = (id) => p.locator(`[data-flow-choice="musicModel"][data-flow-value="${id}"]`);
      await card("lyria-3-clip-preview").waitFor();
      assert.equal(await p.locator('select[data-key="musicModel"]').count(), 0, "模型不可用下拉選單");
      assert.equal(await card("lyria-3-clip-preview").getAttribute("aria-pressed"), "true", "舊草稿的 Lyria Clip Preview 沒有選到 Clip");
      // The NT$ on each card and on the button = the USD the charge reads (cost-model.ts musicUsd) through the page's one
      // money function (shared/models.js VideoWorkbenchMoney at capabilities.twdRate), never a second conversion.
      const nt = (usd) => p.evaluate((u) => VideoWorkbenchMoney(u), usd);
      assert.equal(await card("lyria-3.5").innerText(), "Lyria 3.5 · " + (await nt(musicUsd("lyria-3.5"))) + "／首");
      assert.equal(await card("lyria-3-clip-preview").innerText(), "Lyria 3 Clip · " + (await nt(musicUsd("lyria-3-clip-preview"))) + "／首");
      assert.equal(await card("music_v2_5").innerText(), "Eleven Music · " + (await nt(musicUsd("music_v2_5", 60))) + "／分鐘（未啟用）");
      assert.match(await nt(musicUsd("lyria-3.5")), /^NT\$/);
      assert.deepEqual(await p.locator('[data-flow-choice="musicModel"]').evaluateAll((b) => b.map((x) => x.dataset.flowValue)), ["lyria-3-clip-preview", "lyria-3.5", "music_v2_5"], "卡片沒有由便宜到貴排列");
      assert(await card("music_v2_5").isDisabled());
      assert.equal(await p.getByLabel("歌詞", { exact: true }).count(), 0, "Clip 不接受歌詞卻顯示歌詞欄");
      assert.equal(await p.locator('[data-flow-action="music-generate"]').innerText(), "生成音樂 · " + (await nt(musicUsd("lyria-3-clip-preview"))) + "／首");
      await card("lyria-3.5").click();
      await p.getByLabel("歌詞", { exact: true }).waitFor();
      assert.equal(await p.getByText("尚未設定音樂生成模型").count(), 0);
      assert.equal(await p.getByText("音樂分析與生成服務尚未配置").count(), 0);
      assert.deepEqual(errors, []);
      pass("頁面：模型卡片含價格、無下拉；舊草稿標籤選中對應模型；歌詞欄跟著模型；生成按鈕有價格");
    } finally {
      await browser.close();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
