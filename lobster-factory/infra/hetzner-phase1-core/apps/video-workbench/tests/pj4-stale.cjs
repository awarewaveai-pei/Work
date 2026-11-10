// Card PJ.4 (docs/pj-project-spine-spec-20261106.md §2 PJ.4): one staleness rule, seen where the work is.
// 1 a shot's picture changes -> its clip is marked stale; 換成新的 clears it and keeps the old asset (previousAssetIds);
// 2 the edit file saved again (revision +1) -> the cut is stale on the projects page; 3 a changed line -> its subtitle
// clip is stale; 4 lineage of the spec §1.3 example = 4 rows; 5 a stale paid step sends nothing (no POST /generations,
// the job list keeps its length). Mutation: isStale always false -> 1 red.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  { isolatedServer } = require("./isolated-server.cjs"),
  ProjectEnvelope = require("../shared/project-envelope.js"),
  Spine = require("../shared/episode-spine.js");
const STORE = "awarewave-projects-screenshot-frontend-v1";

(async () => {
  // 4 (pure): the spec §1.3 example, word for word in its steps.
  const example = {
    shots: [{ id: "s-1", line: "早上五分鐘，熱到下班。", image: "/generated/a1.png" }, { id: "s-2", image: "/generated/a2.png", video: "/generated/a3.mp4" }],
    steps: [
      { id: "j-101", step: "shot", tool: "generator", jobId: "j-101", from: [], sources: [], target: "shot:s-1", output: { url: "/generated/a1.png", kind: "image" }, at: "2026-11-10T02:01:00Z" },
      { id: "j-102", step: "shot", tool: "generator", jobId: "j-102", from: [], sources: [], target: "shot:s-2", output: { url: "/generated/a3.mp4", kind: "video" }, at: "2026-11-10T02:04:00Z" },
      { id: "j-110", step: "sound", tool: "voice", jobId: "j-110", from: [{ slot: "line:s-1", key: "早上五分鐘，熱到下班。" }], sources: [], target: "line:s-1", output: { url: "/generated/a4.mp3", kind: "audio" }, at: "2026-11-10T02:10:00Z" },
      { id: "j-120", step: "export", tool: "edit", jobId: "j-120", from: [{ slot: "edit", key: "rev:7" }], sources: ["/generated/a1.png", "/generated/a3.mp4", "/generated/a4.mp3"], target: "output", output: { url: "/generated/a5.mp4", kind: "video" }, at: "2026-11-10T02:20:00Z" },
      { id: "j-130", step: "finish", tool: "watermark", jobId: "j-130", from: [{ slot: "export", key: "/generated/a5.mp4" }], sources: ["/generated/a5.mp4"], target: "output", output: { url: "/generated/a6.mp4", kind: "video" }, at: "2026-11-10T02:25:00Z" },
    ],
  };
  const rows = Spine.lineage(example, "/generated/a6.mp4");
  assert.deepEqual(rows.map((r) => [r.n, r.tools, r.outputs.length]), [[10, ["watermark"], 1], [9, ["edit"], 1], [7, ["voice"], 1], [3, ["generator"], 2]]);

  const { base, dataDir } = await isolatedServer("vw-pj4-");
  const generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated, { recursive: true });
  const file = (ext, args) => {
    const name = crypto.randomUUID() + "." + ext,
      r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, path.join(generated, name)], { encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    return "/generated/" + name;
  };
  const before = file("png", ["-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1"]),
    after = file("png", ["-f", "lavfi", "-i", "color=c=green:s=64x64", "-frames:v", "1"]),
    voice = file("mp3", ["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libmp3lame"]),
    cut = file("mp4", ["-f", "lavfi", "-i", "color=c=blue:s=64x64:r=30:d=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]);

  const browser = await chromium.launch({ channel: "msedge", headless: true }),
    errors = [],
    paid = [];
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => {
      if (r.request().method() === "POST" && /\/api\/vw\/generations$/.test(new URL(r.request().url()).pathname)) {
        paid.push(r.request().url());
        return r.abort();
      }
      return r.request().url().startsWith(base + "/") ? r.continue() : r.abort();
    });
    const openMain = async () => {
      await p.goto(base);
      await p.waitForFunction(() => window.VideoWorkbench?.router);
      await p.evaluate(() => VideoWorkbench.ready.then(() => VideoWorkbench.flush()));
    };
    await openMain();
    const episode = {
      id: "ep-pj4", name: "保溫杯", outline: "",
      shots: [{ id: "s1", text: "倒熱水", seconds: 3, line: "早上五分鐘，熱到下班。", image: before }],
      edit: { engine: "workbench-editor", projectId: "ed-pj4" },
      steps: [{ id: "j-v1", step: "sound", tool: "voice", jobId: "j-v1", from: [{ slot: "line:s1", key: "早上五分鐘，熱到下班。" }], sources: [], settings: {}, target: "line:s1", output: { url: voice, assetId: "job-j-v1", kind: "audio" }, at: "2026-11-10T02:10:00Z" }],
      outputs: [],
    };
    const row = ProjectEnvelope.wrap({ id: "ed-pj4", title: "保溫杯", ratio: "9:16", clips: [], assets: [], markers: [], output: {} }, { revision: 0 });
    await p.evaluate(async ({ STORE, episode, row }) => {
      VideoWorkbench.storage.setItem(STORE, JSON.stringify({ current: "proj-pj4", episode: 0, projects: [{ id: "proj-pj4", title: "保溫杯", type: "single", ratio: "9:16", style: 1, customStyle: "", settings: {}, assets: { character: [], scene: [], prop: [] }, episodes: [episode] }] }));
      await VideoWorkbench.preferences.set("tools.editor.projects", [row]);
      await VideoWorkbench.flush();
    }, { STORE, episode, row });
    await openMain();
    const jobsBefore = await p.evaluate(() => VideoWorkbench.generations.list().then((l) => l.length));
    // Step 6 opens and arranges; the settled voice-over is placed; then subtitles from the line.
    await p.locator("#projectsNav").click();
    await p.frameLocator("#projectsFrame").locator('[data-step="6"] [data-action="openEdit"]').click();
    const tools = () => p.frames().find((x) => x.url().includes("tools.html"));
    await p.frameLocator("#toolsFrame").locator('[data-ed-action="spine-arrange"]').waitFor();
    await tools().waitForFunction(() => edProject()?.clips.some((c) => c.slot === "shot:s1") && edProject().clips.some((c) => c.jobId === "j-v1"));
    await tools().evaluate(() => edSpineSubtitles(edProject(), edSpineHit(edProject()).episode));
    assert.equal(await tools().locator(".editor-clip.stale").count(), 0, "剛排好的片段不該是過期");
    // A cut of the file as it is now (settled the way its export job would be).
    const exportJob = (id, revision) => ({ id, status: "succeeded", type: "video", result: { url: cut, kind: "video" }, input: { settings: { projectRevision: revision }, link: { projectId: "proj-pj4", episodeId: "ep-pj4", tool: "edit", step: "export", target: "output", from: [{ slot: "edit", key: "rev:" + revision }] } } });
    const revision = await tools().evaluate(() => edProject().revision);
    await p.evaluate((job) => VideoWorkbench.spine.settle(job), exportJob("j-cut", revision));

    // 1 the shot gets a new picture (a generator job settles on it) -> its clip is marked at once.
    await p.evaluate((url) => VideoWorkbench.spine.settle({ id: "j-s1b", status: "succeeded", type: "image", result: { url, kind: "image" }, input: { link: { projectId: "proj-pj4", episodeId: "ep-pj4", tool: "generator", step: "shot", target: "shot:s1" } } }), after);
    const shotClip = await tools().evaluate(() => edProject().clips.find((c) => c.slot === "shot:s1").id);
    await tools().locator(`.editor-clip.stale[data-ed-clip="${shotClip}"]`).waitFor();
    await tools().locator(`[data-ed-clip="${shotClip}"]`).click();
    assert.equal(await tools().locator("[data-ed-stale] .note").innerText(), "鏡頭 1 換過了。");
    await tools().locator('[data-ed-action="spine-swap"]').click();
    await tools().waitForFunction((id) => !document.querySelector(`[data-ed-clip="${id}"]`)?.classList.contains("stale"), shotClip);
    const swapped = await tools().evaluate((id) => {
      const c = edProject().clips.find((x) => x.id === id);
      return { url: c.asset.url, previous: c.previousAssetIds?.length ?? 0, stale: EpisodeSpine.staleClip(edSpineHit(edProject()).episode, c) };
    }, shotClip);
    assert.deepEqual(swapped, { url: after, previous: 1, stale: false });
    console.log("PASS 1 鏡頭換圖 → 片段標成過期；按「換成新的」→ 不再過期、previousAssetIds 多一個");

    // 2 換成新的 saved the file (revision +1) -> the cut asks to be exported again.
    await tools().waitForFunction((r) => edProject().revision > r && ed.save.state !== "saving", revision);
    await openMain();
    await p.locator("#projectsNav").click();
    const projects = p.frameLocator("#projectsFrame");
    await projects.locator('[data-output="0"]').getByText("剪輯改過了，要重新輸出。").waitFor();
    assert.equal(await projects.locator('[data-step="9"] .badge').innerText(), "要重做");
    console.log("PASS 2 剪輯存檔（revision +1）→ 成片標「要重新輸出」、第 9 步「要重做」");

    // 3 the line is changed on the projects page -> the subtitle clip and the voice-over clip are stale.
    await projects.locator('[data-bind="shot.0.line"]').fill("側袋放得下，不怕漏。");
    await p.waitForFunction(() => JSON.parse(VideoWorkbench.storage.getItem("awarewave-projects-screenshot-frontend-v1")).projects[0].episodes[0].shots[0].line === "側袋放得下，不怕漏。");
    await projects.locator('[data-step="6"] [data-action="openEdit"]').click();
    await p.frameLocator("#toolsFrame").locator('[data-ed-action="spine-arrange"]').waitFor();
    await tools().waitForFunction(() => edSpineHit(edProject())?.episode.shots[0].line === "側袋放得下，不怕漏。");
    const stale = await tools().evaluate(() => {
      const p = edProject(),
        e = edSpineHit(p).episode;
      return p.clips.filter((c) => c.slot?.startsWith("line:")).map((c) => [c.kind, EpisodeSpine.staleClip(e, c)]).sort();
    });
    assert.deepEqual(stale, [["audio", true], ["text", true]]);
    const sub = await tools().evaluate(() => edProject().clips.find((c) => c.kind === "text" && c.slot).id);
    await tools().locator(`.editor-clip.stale[data-ed-clip="${sub}"]`).waitFor();
    console.log("PASS 3 改旁白 → 字幕片段（與配音片段）標成過期");

    // 5 nothing paid was sent for the stale voice-over: no POST, the job list keeps its length.
    await p.waitForTimeout(500);
    assert.deepEqual(paid, [], "過期後不該自動送出付費任務");
    assert.equal(await p.evaluate(() => VideoWorkbench.generations.list().then((l) => l.length)), jobsBefore);
    console.log("PASS 4 lineage（規格 §1.3 例）→ 4 列：浮水印 → 輸出 → 配音 → 兩個鏡頭");
    console.log("PASS 5 付費步驟過期後沒有自動建任務（沒有 POST /generations、任務筆數不變）");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
