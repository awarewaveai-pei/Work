// Plan U5 快速輸出: an episode's shots go to the main system's render service as one workbench job. With a fake main
// system: the job succeeds, the finished video lands in the episode's 成片 (EpisodeSpine.settle), the job is in the
// history (GET /generations/<id>, mirrored to the job ledger), and the video has ONE main-system row (the row the main
// system made; the workbench never registers the downloaded file again).
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const crypto = require("node:crypto"), { spawnSync } = require("node:child_process"), ffmpeg = require("ffmpeg-static");
const appDir = require("../backend/appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
const { createApi } = require("../backend/api.cjs");
const spine = require("../shared/episode-spine.js");

const ORG = "11111111-1111-4111-8111-111111111111", USER = "44444444-4444-4444-8444-444444444444",
  IMAGE = "22222222-2222-4222-8222-222222222222", VIDEO = "33333333-3333-4333-8333-333333333333",
  REMOTE = "55555555-5555-4555-8555-555555555555", BASE = "http://next-admin.test:3000", R2 = "https://r2.test/video/abc/9x16.mp4";

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-u5-"));
  fs.mkdirSync(path.join(dir, "generated"), { recursive: true });
  const shotUrl = "/generated/66666666-7777-4888-8999-aaaaaaaaaaaa.png";
  fs.writeFileSync(path.join(dir, shotUrl), Buffer.alloc(64));
  // The shot's picture was registered earlier (its settle/upload): url -> main-system asset.
  fs.writeFileSync(path.join(dir, "main-system-assets.json"), JSON.stringify({ [shotUrl]: { assetId: IMAGE, checksumSha256: "b".repeat(64), objectUrl: "https://r2.test/video/workbench/x.png", rightsSources: [] } }));
  const mp4 = path.join(dir, "render.mp4");
  assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc=size=270x480:rate=10", "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", mp4], { windowsHide: true }).status, 0);
  const bytes = fs.readFileSync(mp4), sha = crypto.createHash("sha256").update(bytes).digest("hex");

  const submitted = [], registered = [], ledger = [];
  async function fetchImpl(url, options = {}) {
    url = String(url);
    if (url === R2) return new Response(bytes, { headers: { "content-length": String(bytes.length) } });
    assert.ok(url.startsWith(BASE), "unexpected " + url);
    assert.equal(options.headers.Authorization, "Bearer internal-secret");
    if (url === BASE + "/api/internal/video/workbench/quick-render") {
      submitted.push(JSON.parse(options.body));
      return Response.json({ ok: true, jobId: REMOTE, projectId: "77777777-7777-4777-8777-777777777777" }, { status: 202 });
    }
    if (url.startsWith(BASE + "/api/internal/video/workbench/quick-render?")) {
      const q = new URL(url).searchParams;
      assert.equal(q.get("organizationId"), ORG);
      assert.equal(q.get("jobId"), REMOTE);
      return Response.json({ ok: true, status: "done", ratio: "9x16", assetId: VIDEO, checksumSha256: sha, url: R2, rightsSources: [] });
    }
    if (url === BASE + "/api/internal/video/workbench/assets") { registered.push(options.headers["X-VW-Origin"]); return Response.json({ ok: false, error: "must not be called" }, { status: 500 }); }
    if (url === BASE + "/api/internal/video/workbench/jobs") { ledger.push(JSON.parse(options.body)); return Response.json({ ok: true, job: {} }); }
    if (url.startsWith(BASE + "/api/internal/video/workbench/audio-policy?")) return Response.json({ ok: true, externalAudioAllowed: true });
    throw Error("unexpected " + url);
  }
  const env = { VW_INTERNAL_BASE: BASE, VW_INTERNAL_TOKEN: "internal-secret" };
  const api = createApi({ dataDir: dir, env, fetchImpl, appDir, orgId: ORG });
  const server = http.createServer(async (req, res) => {
    req.vwIdentity = { userId: USER, orgId: ORG, billingOrgId: ORG };
    if (!(await api(req, res))) { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const at = "http://127.0.0.1:" + server.address().port + "/api/vw";
  try {
    const link = { projectId: "proj-1", episodeId: "ep-1", target: "output", step: "export", tool: "quick-render" };
    const r = await fetch(at + "/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      type: "video", operation: "quick-render", prompt: "快速輸出", link,
      settings: { ratio: "9:16", title: "第一集", scenes: [{ narration: "第一句旁白", url: shotUrl }], tts: { provider: "edge", voice: "zh-TW-HsiaoChenNeural" } },
    }) });
    let job = await r.json();
    assert.equal(r.status, 202, JSON.stringify(job));
    for (let i = 0; i < 200 && !["succeeded", "failed"].includes(job.status); i++) {
      await new Promise((res) => setTimeout(res, 100));
      job = await (await fetch(at + "/generations/" + job.id)).json();
    }
    assert.equal(job.status, "succeeded", JSON.stringify(job.error || job));
    // The route got asset ids only, from this workbench's own index, for the episode's project.
    assert.deepEqual(submitted, [{ organizationId: ORG, sourceRef: "proj-1", title: "第一集", ratio: "9x16", scenes: [{ narration: "第一句旁白", assetId: IMAGE }], tts: { provider: "edge", voice: "zh-TW-HsiaoChenNeural" }, autonomy: "guided", userId: USER }]);
    // One main-system row: the one the main system made; the downloaded copy maps to it and is never registered again.
    job = await (await fetch(at + "/generations/" + job.id)).json();
    assert.equal(job.result.assetId, VIDEO);
    assert.equal(job.result.checksumSha256, sha);
    assert.deepEqual(registered, []);
    // 成片: the job lands in the episode's outputs.
    const projects = [{ id: "proj-1", episodes: [{ id: "ep-1", shots: [], steps: [], outputs: [] }] }];
    assert.equal(spine.settle(projects, job), true);
    assert.equal(projects[0].episodes[0].outputs.length, 1);
    assert.equal(projects[0].episodes[0].outputs[0].url, job.result.url);
    // 歷史紀錄: the job is kept, and its succeeded state reached the job ledger.
    await new Promise((res) => setTimeout(res, 200));
    assert.ok(ledger.some((l) => l.status === "succeeded" && l.input.operation === "quick-render" && l.resultAssetId === VIDEO), JSON.stringify(ledger));
    console.log("u5-quick-render ok");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
