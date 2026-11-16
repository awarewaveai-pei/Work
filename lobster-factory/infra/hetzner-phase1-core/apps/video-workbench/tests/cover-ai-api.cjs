// Card VD.4 through the real job queue (local mode, vendor stubbed): a "cover-ai" job for a finished export adds one AI
// cover to THAT export (kind "ai", its cost), served from /generated; it is priced like any image-edit run (video.image,
// the chosen row); a job naming no finished export is refused before any vendor call.
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const ffmpeg = require("ffmpeg-static");
const { createServer } = require("../server.cjs"), mainSystem = require("../backend/main-system.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-cover-ai-api-"));
const ff = (args) => assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", ...args], { windowsHide: true }).status, 0);
(async () => {
  fs.mkdirSync(path.join(dir, "generated"), { recursive: true });
  const video = crypto.randomUUID() + ".mp4", auto = crypto.randomUUID() + ".jpg", red = path.join(dir, "red.png");
  ff(["-f", "lavfi", "-i", "smptebars=size=640x360:rate=10", "-t", "3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path.join(dir, "generated", video)]);
  ff(["-f", "lavfi", "-i", "color=c=gray:s=640x360", "-frames:v", "1", path.join(dir, "generated", auto)]);
  ff(["-f", "lavfi", "-i", "color=c=red:s=1024x576", "-frames:v", "1", red]);
  const exportJob = { id: "e1", type: "video", status: "succeeded", createdAt: new Date().toISOString(),
    input: { type: "video", operation: "editor-export", settings: { project: { title: "封面標題" } } },
    result: { url: "/generated/" + video, width: 640, height: 360, ledger: "local_mode", covers: [{ url: "/generated/" + auto, kind: "auto", at: 1 }] } };
  fs.writeFileSync(path.join(dir, "jobs.json"), JSON.stringify([exportJob]));

  const calls = [];
  const server = createServer({
    dataDir: dir,
    // an ElevenLabs key: a refused cover-ai request must not even refresh that account (Codex ccdf770d F3)
    env: { GEMINI_API_KEY: "test-only", REPLICATE_API_TOKEN: "test-only", OPENAI_API_KEY: "test-only", ELEVENLABS_API_KEY: "test-only" },
    fetchImpl: async (url, options = {}) => {
      calls.push(String(url));
      if (String(url).endsWith("/v1beta/interactions")) {
        const sent = JSON.parse(options.body);
        assert.match(sent.input[0].text, /Do not add any text/, "the model is told to write no text");
        return Response.json({ steps: [{ content: [{ type: "image", mime_type: "image/png", data: fs.readFileSync(red).toString("base64") }] }], usage: { total_input_tokens: 300, total_output_tokens: 1700, output_tokens_by_modality: [{ modality: "image", tokens: 1680 }] } });
      }
      if (/elevenlabs/.test(String(url))) return Response.json({ tier: "free", character_count: 0, character_limit: 10000 });
      throw Error("unexpected call " + url);
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const api = "http://127.0.0.1:" + server.address().port + "/api/vw";
  const post = (body) => fetch(api + "/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const poll = async (job) => { for (let i = 0; i < 300 && !["succeeded", "failed"].includes(job.status); i++) { await new Promise((r) => setTimeout(r, 50)); job = await (await fetch(api + "/generations/" + job.id)).json(); } return job; };
  try {
    // priced as an image-edit run (the button's data-paid="video.image" + the row)
    assert.equal(mainSystem.paidFeature({ operation: "cover-ai" }, "image"), "video.image");

    // no finished export with covers -> 400, nothing called
    for (const forJob of ["nope", undefined]) {
      const r = await post({ type: "image", operation: "cover-ai", prompt: "封面", settings: { model: "nano-banana-2", forJob } });
      assert.equal(r.status, 400, await r.text());
    }
    assert.deepEqual(calls, []);

    const started = await (await post({ type: "image", operation: "cover-ai", prompt: "封面", settings: { model: "nano-banana-2", forJob: "e1" } })).json();
    const done = await poll(started);
    assert.equal(done.status, "succeeded", JSON.stringify(done.error || done));
    assert.equal(done.result.ledger, "cover", "the AI cover is registered with its export, never as a loose asset");
    // the billed-run record stays until the job is saved succeeded (charged then from result.origin, once)
    assert.equal(done.finishing?.origin?.costUsd, done.result.origin.costUsd);
    assert.ok(done.result.origin.costUsd > 0 && done.result.origin.model === "nano-banana-2");
    const exp = await (await fetch(api + "/generations/e1")).json();
    assert.equal(exp.result.covers.length, 2);
    const ai = exp.result.covers[1];
    assert.deepEqual([ai.kind, ai.model, ai.url], ["ai", "nano-banana-2", done.result.url]);
    assert.ok(ai.costUsd > 0);
    const img = await fetch(api.replace("/api/vw", "") + ai.url);
    assert.equal(img.status, 200);
    assert.match(img.headers.get("content-type"), /^image\/jpeg/);
    assert.deepEqual(calls.filter((u) => u.endsWith("/interactions")).length, 1, "one vendor call");
    // R26: the cover's settle of e1 (saved before thumbnails) also makes e1's thumbnail; it is awaited here so the folder
    // is not deleted while ffmpeg reads the video.
    let e1 = exp;
    for (let i = 0; i < 100 && !e1.result.thumbUrl; i++) {
      await new Promise((r) => setTimeout(r, 100));
      e1 = await (await fetch(api + "/generations/e1")).json();
    }
    assert.equal(e1.result.thumbUrl, e1.result.url.replace(/\.mp4$/, ".thumb.jpg"));
    // Codex 94927dcb F2: a paid job whose billed run is not yet in usage is never pruned by the history limit (pruned =
    // never charged). Local mode keeps it owed (nothing settles), so the restart's prune is what is tested.
    const pruneDir = path.join(dir, "prune");
    fs.mkdirSync(pruneDir, { recursive: true });
    const old = (id) => ({ id, type: "image", status: "succeeded", createdAt: new Date().toISOString(), result: { url: "/generated/x.png", ledger: "local_mode" } });
    fs.writeFileSync(path.join(pruneDir, "jobs.json"), JSON.stringify([
      { id: "owed-usage", type: "image", status: "failed", createdAt: new Date().toISOString(), paid: { feature: "video.image", billingOrgId: "b", userId: "u" },
        input: { type: "image", operation: "cover-ai", prompt: "封面", settings: {} }, finishing: { origin: { kind: "ai_generated", costUsd: 0.06 } } },
      ...Array.from({ length: 101 }, (_, i) => old("old-" + i)),
    ]));
    const pruner = createServer({ dataDir: pruneDir, env: { VW_JOB_HISTORY_LIMIT: "100" }, fetchImpl: async () => { throw Error("no calls"); } });
    await new Promise((r) => pruner.listen(0, "127.0.0.1", r));
    await fetch("http://127.0.0.1:" + pruner.address().port + "/api/vw/generations/owed-usage");
    const kept = JSON.parse(fs.readFileSync(path.join(pruneDir, "jobs.json"), "utf8")).map((j) => j.id);
    pruner.close();
    assert(kept.includes("owed-usage"), "a billed run not yet in usage survives the history limit");
    assert(!kept.includes("old-0"), "settled old jobs are pruned as before");
    console.log("cover-ai-api: ok");
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
