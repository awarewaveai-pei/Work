// Plan U7 (invariant 11): a client who keeps its sound here -- or whose setting cannot be read -- gets every job that would
// send sound out refused before anything leaves (backend/audio-policy.cjs outbound list), and /capabilities shows only
// the rows that keep sound here. Also: 重燒字幕 is a job that hands the edited lines to the main system and polls it.
// The fake fetchImpl plays next-admin (audio-policy, permit, caption-reburn routes) and counts every vendor call.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const { generateKeyPairSync } = require("node:crypto"), { pathToFileURL } = require("node:url");
const appDir = require("../backend/appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
const { createApi } = require("../backend/api.cjs");

const ORG = "11111111-1111-4111-8111-111111111111", USER = "44444444-4444-4444-8444-444444444444", ASSET = "22222222-2222-4222-8222-222222222222",
  BASE = "http://next-admin.test:3000";
const pair = generateKeyPairSync("ed25519", { publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

(async () => {
  const { signPermit } = await import(pathToFileURL(path.join(appDir, "lib/entitlements/permit.ts")).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-u7-"));
  fs.mkdirSync(path.join(dir, "generated"), { recursive: true });
  fs.writeFileSync(path.join(dir, "generated", "11111111-2222-4333-8444-555555555555.mp3"), Buffer.alloc(2048));
  let policy = "keep"; // keep | allow | down (500) | unreachable (network error)
  const vendor = [], policyAsked = [], reburn = [];
  async function fetchImpl(url, options = {}) {
    url = String(url);
    if (!url.startsWith(BASE)) {
      vendor.push(url);
      if (/elevenlabs/.test(url) && /user\/subscription|\/v1\/user/.test(url)) return Response.json({ tier: "free", character_count: 0, character_limit: 10000 });
      return Response.json({ error: "vendor stub" }, { status: 500 });
    }
    if (url === BASE + "/api/internal/entitlements/permit/video") {
      const body = JSON.parse(options.body), now = Math.floor(Date.now() / 1000);
      return Response.json({ allowed: true, permit: signPermit({ format_version: 1, tenant: body.organization_id, product_key: "video", feature_key: body.feature_key, source: "comp", entitlement_id: "e", source_ref: null, limits: {}, max_spend: null, actor: body.actor, on_behalf_of: body.organization_id, issued_at: now, expires_at: now + 600, kid: "k1" }, pair.privateKey) });
    }
    assert.equal(options.headers.Authorization, "Bearer internal-secret");
    if (url.startsWith(BASE + "/api/internal/video/workbench/audio-policy?")) {
      policyAsked.push(new URL(url).searchParams.get("organizationId"));
      if (policy === "unreachable") throw TypeError("fetch failed");
      if (policy === "down") return Response.json({ ok: false, error: "organization_lookup_failed" }, { status: 502 });
      return Response.json({ ok: true, externalAudioAllowed: policy === "allow" });
    }
    if (url === BASE + "/api/internal/video/workbench/caption-reburn") {
      const body = JSON.parse(options.body);
      reburn.push(body);
      if (body.cues) return Response.json({ ok: true, jobs: [{ assetId: body.assetId, jobId: "r1" }] }, { status: 202 });
      return Response.json({ ok: true, status: "done", checksum: "a".repeat(64) });
    }
    if (url.startsWith(BASE + "/api/internal/video/workbench/jobs")) return Response.json({ ok: true, job: {} });
    throw Error("unexpected " + url);
  }
  const env = {
    VW_INTERNAL_BASE: BASE, VW_INTERNAL_TOKEN: "internal-secret", ENTITLEMENT_ISSUER_TOKEN_VIDEO: "issuer-secret", ENTITLEMENT_PUBLIC_KEYS: "k1:" + pair.publicKey.replace(/\n/g, "\\n"),
    OPENAI_API_KEY: "test-only", GEMINI_API_KEY: "test-only", ELEVENLABS_API_KEY: "test-only", REPLICATE_API_TOKEN: "test-only",
  };
  const api = createApi({ dataDir: dir, env, fetchImpl, appDir, orgId: ORG });
  const server = http.createServer(async (req, res) => {
    req.vwIdentity = { userId: USER, orgId: ORG, billingOrgId: ORG };
    if (!(await api(req, res))) { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const at = "http://127.0.0.1:" + server.address().port + "/api/vw";
  const post = async (route, body) => { const r = await fetch(at + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const segments = [{ url: "/generated/11111111-2222-4333-8444-555555555555.mp3", sourceStart: 0, duration: 2, start: 0 }];
  // Every job that sends sound out (backend/audio-policy.cjs header list), each with the row that sends it.
  const outbound = [
    ["/generations", { type: "subtitle", operation: "editor-transcribe", prompt: "整片字幕", settings: { engine: "openai", segments } }],
    ["/generations", { type: "subtitle", operation: "editor-transcribe", prompt: "整片字幕", settings: { engine: "gemini", segments } }],
    ["/generations", { type: "subtitle", operation: "editor-transcribe", prompt: "整片字幕", settings: { engine: "elevenlabs", segments } }],
    ["/transcriptions", { source: { url: segments[0].url, type: "audio/mpeg" }, engine: "openai" }],
    ["/generations", { type: "audio", operation: "separate", prompt: "音軌分離", references: { src: { url: segments[0].url } }, settings: { separateEngine: "elevenlabs" } }],
    ["/generations", { type: "video", operation: "sfx", prompt: "去配樂", references: { src: { url: segments[0].url } }, settings: {} }],
    ["/generations", { type: "video", operation: "enhance", prompt: "AI 增強", references: { src: { url: segments[0].url } }, settings: { enhanceType: "畫面", enhanceOption: "AI 大模型增強", enhanceResolution: "1080p" } }],
  ];
  try {
    // 1. The client keeps its sound here, the setting is unreadable (502), or next-admin is unreachable: every one refused,
    //    nothing sent to any vendor (an ElevenLabs account check carries no sound and is not counted).
    for (const mode of ["keep", "down", "unreachable"]) {
      policy = mode;
      for (const [route, body] of outbound) {
        vendor.length = 0;
        const r = await post(route, body);
        assert.equal(r.status, 403, `${mode} ${body.operation || route}: ${JSON.stringify(r.body)}`);
        assert.match(r.body.error?.message || "", /聲音不可送出主機/);
        assert.deepEqual(vendor.filter((u) => !/elevenlabs.*\/v1\/user/.test(u)), [], `${mode} ${body.operation || route} called a vendor`);
      }
    }
    assert.ok(policyAsked.length >= outbound.length * 3 && policyAsked.every((o) => o === ORG), "asked for this org, every time");

    // 2. Rows that send sound out are off on /capabilities; the host worker and the local row stay.
    policy = "keep";
    const caps = await (await fetch(at + "/capabilities")).json();
    assert.equal(caps.mainSystem.externalAudioAllowed, false);
    assert.deepEqual(caps.transcribe.engines.filter((e) => e.available).map((e) => e.id), caps.transcribe.engines.some((e) => e.id === "host" && e.available) ? ["host"] : []);
    assert.ok(caps.transcribe.engines.filter((e) => e.id !== "host").every((e) => /不可送出主機/.test(e.note)));
    assert.ok(caps.audioTools.separate.engines.find((e) => e.id === "elevenlabs").available === false);
    assert.equal(caps.audioTools.separate.defaultEngine, "local");

    // 3. Control: the client allows it -> the same job passes the guard (accepted; it then fails on its own, no vendor answer).
    policy = "allow";
    const allowed = await post("/generations", outbound[0][1]);
    assert.equal(allowed.status, 202, JSON.stringify(allowed.body));

    // 3b. A client's server without its main system (VW_INTERNAL_* unset) cannot read the setting: refused. Local mode (no
    //     client org) has no setting: not asked, not refused.
    const { VW_INTERNAL_BASE, VW_INTERNAL_TOKEN, ...bare } = env;
    for (const [orgId, refused] of [[ORG, true], [undefined, false]]) {
      const lone = createApi({ dataDir: fs.mkdtempSync(path.join(dir, "lone-")), env: bare, fetchImpl, appDir, orgId });
      const s2 = http.createServer(async (req, res) => { if (!(await lone(req, res))) { res.writeHead(404); res.end(); } });
      await new Promise((r) => s2.listen(0, "127.0.0.1", r));
      vendor.length = 0;
      const r = await fetch("http://127.0.0.1:" + s2.address().port + "/api/vw/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(outbound[0][1]) });
      s2.close();
      assert.equal(r.status === 403, refused, (orgId ? "client org" : "local") + ": " + r.status);
      if (refused) assert.deepEqual(vendor, []);
    }

    // 4. 重燒字幕: the edited line goes to the main system in whole ms; the job polls until done and makes no local file.
    const job = await post("/generations", { type: "video", operation: "caption-reburn", prompt: "重燒字幕", settings: { assetId: ASSET, cues: [{ start: 0, end: 1.5, text: "改過的第一句" }] } });
    assert.equal(job.status, 202, JSON.stringify(job.body));
    let done = job.body;
    for (let i = 0; i < 200 && !["succeeded", "failed"].includes(done.status); i++) {
      await new Promise((r) => setTimeout(r, 100));
      done = await (await fetch(at + "/generations/" + done.id)).json();
    }
    assert.equal(done.status, "succeeded", JSON.stringify(done.error || done));
    assert.deepEqual(reburn[0], { organizationId: ORG, assetId: ASSET, cues: [{ startMs: 0, endMs: 1500, text: "改過的第一句" }] });
    assert.deepEqual(reburn.at(-1), { organizationId: ORG, assetId: ASSET, jobId: "r1" });
    assert.equal(done.result.mainAssetId, ASSET);
    assert.equal(done.result.url, undefined);
    console.log("u7-audio-policy ok");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
