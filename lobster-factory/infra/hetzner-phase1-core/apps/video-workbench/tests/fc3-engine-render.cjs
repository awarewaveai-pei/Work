// Card FC.3 acceptance (docs/engine-route-plan-20261106.md §9 FC.3): POST /api/vw/engine/renders turns a professional-editor
// render into one finished job, registered through the existing settle() path. Connected mode against a fake next-admin with
// the same request shapes as tests/p6-main-system.cjs. Checks: a render with two sources and two SRT lines -> one succeeded
// job, the ledger gets exactly those two sources, release text has the title and both lines; no source list -> 400 (rights
// guard); a silent or broken file -> refused, no job.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  crypto = require("node:crypto"),
  { execFileSync } = require("node:child_process");
const { createServer } = require("../server.cjs");
const { releaseText } = require("../backend/release-text.cjs");
const ffmpeg = require("ffmpeg-static");

const ORG = "11111111-1111-4111-8111-111111111111", USER = "44444444-4444-4444-8444-444444444444", BASE = "http://next-admin.test:3000";
function request(port, pathname, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: pathname, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-fc3-"));
  const clip = (name, args) => (execFileSync(ffmpeg, ["-v", "error", "-y", ...args, "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(dir, name)]), fs.readFileSync(path.join(dir, name)));
  const srcA = clip("a.mp4", ["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"]);
  const srcB = clip("b.mp4", ["-f", "lavfi", "-i", "color=c=blue:size=320x180:rate=30", "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=48000"]);
  // The engine's output is −16 LUFS; the route checks it (±1).
  const render = clip("out.mp4", ["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30", "-f", "lavfi", "-i", "sine=frequency=550:sample_rate=48000", "-af", "loudnorm=I=-16:TP=-2:LRA=7"]);
  const silent = clip("silent.mp4", ["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]);

  const calls = { assets: [], releaseText: [], jobs: [] };
  async function fetchImpl(url, options = {}) {
    url = String(url);
    assert(url.startsWith(BASE + "/api/internal/"), "只打 next-admin 內部路由：" + url);
    if (url === BASE + "/api/internal/video/workbench/assets") {
      const bytes = Buffer.from(await new Response(options.body).arrayBuffer());
      const meta = JSON.parse(Buffer.from(options.headers["X-VW-Meta"], "base64url").toString("utf8"));
      calls.assets.push({ meta, bytes });
      const assetId = "aaaaaaaa-0000-4000-8000-" + String(calls.assets.length).padStart(12, "0");
      return Response.json({ ok: true, existing: false, assetId, checksumSha256: crypto.createHash("sha256").update(bytes).digest("hex"), objectUrl: "https://cdn.test/" + assetId, qa: {} }, { status: 201 });
    }
    if (url === BASE + "/api/internal/video/workbench/assets/release-text") {
      calls.releaseText.push(JSON.parse(options.body));
      return Response.json({ ok: true, qa: {} });
    }
    if (url === BASE + "/api/internal/video/workbench/jobs") {
      calls.jobs.push(JSON.parse(options.body));
      return Response.json({ ok: true, job: {} });
    }
    throw Error("unexpected " + url);
  }
  const env = { VW_TRUST_PROXY_IDENTITY: "1", VW_ALLOWED_HOSTS: "127.0.0.1:*", VW_INTERNAL_BASE: BASE + "/", VW_INTERNAL_TOKEN: "internal-secret" };
  const dataDir = path.join(dir, "data");
  const server = createServer({ dataDir, env, fetchImpl });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const who = (extra) => {
    const h = { "X-VW-User-Id": USER, "X-VW-Org-Id": ORG, "X-VW-Billing-Org-Id": ORG, "X-VW-User-Kind": "staff", "X-VW-Role": "owner", "X-VW-Expires": String(Math.floor(Date.now() / 1000) + 120), ...extra };
    return { ...h, "X-VW-Signature": require("../backend/session-signature.cjs").sign("internal-secret", { userId: h["X-VW-User-Id"], orgId: h["X-VW-Org-Id"], billingOrgId: h["X-VW-Billing-Org-Id"], userKind: h["X-VW-User-Kind"], role: h["X-VW-Role"], expires: h["X-VW-Expires"] }) };
  };
  const upload = async (name, bytes) => {
    const r = await request(port, "/api/vw/uploads", who({ "Content-Type": "application/json" }), JSON.stringify({ name, data: "data:video/mp4;base64," + bytes.toString("base64"), rightsConfirmed: true }));
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const send = (meta, video) => {
    const head = Buffer.from(JSON.stringify(meta), "utf8");
    return request(port, "/api/vw/engine/renders", who({ "Content-Type": "application/octet-stream", "X-VW-Meta-Length": String(head.length) }), Buffer.concat([head, video]));
  };
  const ledgerFile = path.join(dataDir, "orgs", ORG, "jobs.json"); // connected mode: one data folder per organization
  const jobsOnDisk = () => (fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, "utf8")) : []);
  try {
    const a = await upload("來源甲.mp4", srcA), b = await upload("來源乙.mp4", srcB);
    const meta = {
      engine: "filmcraft", engineVersion: "0.17.0", title: "專業剪輯成片", ratio: "16:9", width: 1920, height: 1080,
      sources: [{ url: a.url, id: a.id, name: "來源甲.mp4" }, { url: b.url, id: b.id, name: "來源乙.mp4" }],
      cues: [{ start: 0, end: 0.5, text: "第一句" }, { start: 0.5, end: 1, text: "第二句" }],
      link: { projectId: "p-1", episodeId: "e-1", tool: "edit-pro", step: "edit" }, // PJ spec §8 C4
    };

    // 1. A render with two sources and two lines -> one succeeded job, registered with exactly those sources.
    const assetsBefore = calls.assets.length;
    const ok = await send(meta, render);
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const job = ok.body;
    assert.equal(job.status, "succeeded");
    assert.equal(job.input.operation, "engine-render");
    assert.deepEqual(job.input.link, meta.link, "專案歸屬原樣存成 input.link");
    assert.deepEqual(jobsOnDisk().filter((j) => j.input?.operation === "engine-render").map((j) => [j.id, j.status]), [[job.id, "succeeded"]]);
    assert.equal(calls.assets.length, assetsBefore + 1, "成片登記一次");
    const ledger = calls.assets.at(-1).meta;
    assert.deepEqual(ledger.rightsSources.map((s) => s.url).sort(), [a.url, b.url].sort(), "主系統收到的來源正好是那兩個");
    assert.deepEqual(ledger.parentAssetIds.sort(), [a.assetId, b.assetId].sort());
    assert.equal(ledger.ratio, "16x9");
    assert.equal(job.result.assetId, "aaaaaaaa-0000-4000-8000-" + String(calls.assets.length).padStart(12, "0"));
    const text = releaseText(job);
    assert.equal(text.title, "專業剪輯成片");
    assert.deepEqual(text.captions, [{ startMs: 0, endMs: 500, text: "第一句" }, { startMs: 500, endMs: 1000, text: "第二句" }]);
    assert.equal(calls.releaseText.at(-1).title, "專業剪輯成片", "送審文字送到主系統");
    assert.equal(calls.releaseText.at(-1).captions.length, 2);
    assert.equal(calls.jobs.at(-1).kind, "render");
    console.log("PASS render -> one succeeded job, ledger sources = the two inputs, release text = title + two lines");

    // 2. No source list -> 400 before anything is stored (rights guard).
    const before = { assets: calls.assets.length, jobs: jobsOnDisk().length };
    for (const sources of [undefined, []]) {
      const r = await send({ ...meta, sources }, render);
      assert.equal(r.status, 400, "沒有來源清單要拒絕：" + JSON.stringify(r.body));
      assert.match(r.body.error.message, /來源素材/);
    }
    assert.deepEqual({ assets: calls.assets.length, jobs: jobsOnDisk().length }, before);
    console.log("PASS no source list -> 400, nothing stored");

    // 3. A silent or broken file is refused by verifyOutput; no job.
    for (const [name, video] of [["silent", silent], ["broken", crypto.randomBytes(4096)]]) {
      const r = await send(meta, video);
      assert.equal(r.status, 400, name + " 應被拒：" + JSON.stringify(r.body));
      assert.match(r.body.error.message, /成片檢查沒過/);
    }
    assert.deepEqual({ assets: calls.assets.length, jobs: jobsOnDisk().length }, before);
    console.log("PASS silent / broken file -> refused, no job");

    // 4. EffectCraft (card EC.3), same route: its Render Queue has no loudness setting and a motion piece may be silent, so a
    // silent picture is accepted; the source list is required the same way; a broken file is refused.
    const ec = { engine: "effectcraft", engineVersion: "0.21.1", title: "專業特效成片", ratio: "16:9", width: 1920, height: 1080, sources: [{ url: a.url, id: a.id, name: "來源甲.mp4" }] };
    const ecOk = await send(ec, silent);
    assert.equal(ecOk.status, 201, JSON.stringify(ecOk.body));
    assert.equal(ecOk.body.input.settings.engine, "effectcraft");
    assert.equal(ecOk.body.result.origin.engine, "effectcraft");
    assert.deepEqual(calls.assets.at(-1).meta.rightsSources.map((s) => s.url), [a.url], "主系統收到的來源正好是那一個");
    assert.equal(releaseText(ecOk.body).title, "專業特效成片");
    const ecBefore = { assets: calls.assets.length, jobs: jobsOnDisk().length };
    for (const sources of [undefined, []]) {
      const r = await send({ ...ec, sources }, silent);
      assert.equal(r.status, 400, "effectcraft 沒有來源清單要拒絕：" + JSON.stringify(r.body));
      assert.match(r.body.error.message, /來源素材/);
    }
    const broken = await send(ec, crypto.randomBytes(4096));
    assert.equal(broken.status, 400);
    assert.deepEqual({ assets: calls.assets.length, jobs: jobsOnDisk().length }, ecBefore);
    console.log("PASS effectcraft render -> one job with its source; no source list -> 400; broken -> refused");
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
