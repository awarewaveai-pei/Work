// Card M3 (docs/creative-suite-plan-20261102.md §3 invariants 5/8/10): frame time survives save/reload and export,
// output verification catches a wrong frame and a silent mix, pre-M3 projects convert with the original kept,
// MediaTimelineV1 export validates against the main-system contract and lists what it loses.
const assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { isolatedServer } = require("./isolated-server.cjs"),
  { verifyOutput } = require("../backend/media-inspect.cjs");

const pass = (message) => console.log("PASS " + message);
const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), "vw-media-contract-fixtures-"));
function make(file, args) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, path.join(fixtures, file)], { encoding: "utf8", windowsHide: true, timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  return path.join(fixtures, file);
}
const font = process.platform === "win32" ? ":fontfile='C\\:/Windows/Fonts/arial.ttf'" : "";
// Every frame carries its own number, so a wrong frame cannot look right.
const source = make("numbered.mp4", [
  "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30000/1001:d=10",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
  "-vf", `drawtext=text='%{n}'${font}:fontsize=160:fontcolor=white:box=1:boxcolor=black:x=40:y=60`,
  "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-c:a", "aac", "-shortest",
]);
const silent = make("silent.wav", ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo:d=3"]);
const NTSC = { num: 30000, den: 1001 };

(async () => {
  const { base, dataDir } = await isolatedServer("vw-media-contract-");
  const api = async (route, method = "GET", body) => {
    const r = await fetch(base + "/api/vw" + route, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated, { recursive: true });
  const place = (file, ext) => {
    const name = crypto.randomUUID() + "." + ext;
    fs.copyFileSync(file, path.join(generated, name));
    return "/generated/" + name;
  };
  const sourceUrl = place(source, "mp4"),
    silentUrl = place(silent, "wav"),
    assetId = crypto.randomUUID();
  async function render(project) {
    const created = await api("/generations", "POST", { type: "video", operation: "editor-export", settings: { quality: "720p", project } });
    assert.equal(created.status, 202, JSON.stringify(created.body));
    for (let i = 0; i < 600; i++) {
      const job = (await api("/generations/" + created.body.id)).body;
      if (["succeeded", "failed"].includes(job.status)) return job;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw Error("render timed out");
  }

  // 1. Pre-M3 projects: the untouched array is backed up under its own key, then converted at 30 fps.
  const legacy = [
    {
      id: "legacy-project",
      title: "舊專案",
      ratio: "16:9",
      clips: [{ id: "old-clip", kind: "video", track: "V1", asset: { url: sourceUrl, name: "舊片段" }, start: 1.5, duration: 2, sourceStart: 0.5, speed: 1 }],
      assets: [],
      tracks: {},
      markers: [],
    },
  ];
  const put = await api("/state", "PUT", {
    version: 1, revision: 0, characters: [], projects: [], assets: [], jobs: [], selection: {},
    preferences: { "tools.editor.projects": legacy },
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(30000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    await page.waitForFunction(() => typeof ed !== "undefined" && ed.ready);
    await page.evaluate(() => ed.queue);
    let prefs = (await api("/state")).body.preferences;
    const backupKey = Object.keys(prefs).find((k) => k.startsWith("tools.editor.projects.pre-frames-"));
    assert.ok(backupKey, Object.keys(prefs).join(","));
    assert.deepEqual(prefs[backupKey], legacy);
    const converted = prefs["tools.editor.projects"][0];
    assert.equal(converted.formatVersion, 1);
    assert.equal(converted.engine, "workbench-editor");
    assert.deepEqual(converted.timebase, { num: 30, den: 1 });
    const oldClip = converted.native.clips[0];
    assert.deepEqual([oldClip.startFrame, oldClip.durationFrames, oldClip.sourceStartFrame], [45, 60, 15]);
    assert.ok(!("start" in oldClip) && !("duration" in oldClip) && !("sourceStart" in oldClip));
    pass("舊專案：原陣列另存 " + backupKey + " 且內容相同；轉成外層格式＋30 fps 影格（45／60／15）");

    // 2. A 29.97 project: a clip set through the UI at 4 s snaps to frame 120 and is stored as frames only.
    const projectId = crypto.randomUUID();
    await page.evaluate(
      ({ projectId, assetId, sourceUrl }) => {
        const p = edNormalizeProject({ id: projectId, title: "影格測試", ratio: "16:9", timebase: { num: 30000, den: 1001 }, clips: [], assets: [], tracks: Object.fromEntries(edTracks.map((id) => [id, { volume: 1 }])), markers: [] });
        ed.projects.push(p);
        ed.current = projectId;
        const clip = edTime(p, { id: "frame-clip", kind: "video", track: "V1", asset: { id: assetId, url: sourceUrl, name: "編號影片", duration: 10 }, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, width: 25 }, { startFrame: 0, durationFrames: 60, sourceStartFrame: 120 });
        p.clips.push(clip);
        ed.selected = clip.id;
        edRender();
      },
      { projectId, assetId, sourceUrl },
    );
    await page.getByLabel("時間軸起點（秒）").fill("4");
    await page.getByLabel("時間軸起點（秒）").press("Tab");
    await page.evaluate(() => ed.queue);
    prefs = (await api("/state")).body.preferences;
    const stored = prefs["tools.editor.projects"].find((e) => e.native.id === projectId);
    assert.deepEqual(stored.timebase, NTSC);
    const storedClip = stored.native.clips[0];
    assert.equal(storedClip.startFrame, 120);
    assert.ok(stored.native.clips.every((c) => !("start" in c) && !("duration" in c) && !("sourceStart" in c)), JSON.stringify(stored.native.clips));
    assert.deepEqual(stored.assets, [{ id: assetId, url: sourceUrl }]);
    await page.reload();
    await page.waitForFunction(() => typeof ed !== "undefined" && ed.ready);
    const reloaded = await page.evaluate((id) => ed.projects.find((p) => p.id === id).clips[0], projectId);
    assert.equal(reloaded.startFrame, 120);
    assert.ok(Math.abs(reloaded.start - 4.004) < 1e-9, String(reloaded.start));
    assert.ok(!(await api("/state")).body.preferences[backupKey + "x"]);
    pass("29.97 專案：介面輸入 4 秒 → 第 120 格；伺服器只存影格；重開仍是 120（4.004 秒）");

    // 3. Export of that project: output frame 120 is source frame 120; a frame 5 off is a mismatch.
    const job = await render(stored.native);
    assert.equal(job.status, "succeeded", job.error);
    assert.equal(job.result.verification.ok, true);
    const out = path.join(dataDir, job.result.url.slice(1));
    const right = await verifyOutput(out, { fps: NTSC, frames: [{ outFrame: 120, source, sourceFrame: 120 }] });
    assert.deepEqual(right.findings, []);
    const wrong = await verifyOutput(out, { frames: [{ outFrame: 125, source, sourceFrame: 120 }] });
    assert.deepEqual(wrong.findings.map((f) => f.code), ["frame.mismatch"], JSON.stringify(wrong.findings));
    pass("匯出 29.97：輸出第 120 格＝來源第 120 格（PSNR 比對）；差 5 格判 frame.mismatch（PSNR " + wrong.findings[0].evidence.psnr + "）");

    // 4. Silence: every audio clip at volume 0 renders, but is silent when audibility is demanded; a mix that
    // should be heard (volume 1) yet comes out silent fails the job with the finding.
    const muted = {
      ...stored.native,
      clips: [
        { ...storedClip, volume: 0 },
        { id: "quiet-a1", kind: "audio", track: "A1", asset: { url: sourceUrl }, startFrame: 0, durationFrames: 60, sourceStartFrame: 0, speed: 1, volume: 0 },
      ],
    };
    const mutedJob = await render(muted);
    assert.equal(mutedJob.status, "succeeded", mutedJob.error);
    const hush = await verifyOutput(path.join(dataDir, mutedJob.result.url.slice(1)), { audible: true });
    assert.deepEqual(hush.findings.map((f) => f.code), ["audio.silent"], JSON.stringify(hush.findings));
    const silentJob = await render({
      ...stored.native,
      clips: [
        { ...storedClip, volume: 0 },
        { id: "silent-a1", kind: "audio", track: "A1", asset: { url: silentUrl }, startFrame: 0, durationFrames: 60, sourceStartFrame: 0, speed: 1, volume: 1 },
      ],
    });
    assert.equal(silentJob.status, "failed");
    assert.match(silentJob.error, /audio\.silent/);
    assert.deepEqual(silentJob.findings.map((f) => f.code), ["audio.silent"]);
    pass("全部音量 0 的輸出要求有聲 → audio.silent；應有聲卻靜音的匯出任務 → failed＋findings");

    // 5. MediaTimelineV1: 29.97 maps to 30 with a loss entry, speed is listed, the contract validator accepts it.
    const organizationId = crypto.randomUUID();
    const v1 = await api("/editor/timeline-v1", "POST", {
      organizationId,
      project: {
        ...stored,
        native: {
          ...stored.native,
          clips: [
            { ...storedClip, speed: 1.5, sourceStartFrame: 0 },
            { id: "caption-1", kind: "text", track: "T", text: "Hello", startFrame: 0, durationFrames: 90, x: 50, y: 80 },
          ],
        },
      },
    });
    assert.equal(v1.status, 200, JSON.stringify(v1.body));
    assert.equal(v1.body.validation.ok, true, JSON.stringify(v1.body.validation.errors));
    assert.equal(v1.body.timeline.frameRate, 30);
    const lost = v1.body.losses.map((l) => l.field);
    assert.ok(lost.includes("frameRate") && lost.includes("speed"), JSON.stringify(v1.body.losses));
    const missing = await api("/editor/timeline-v1", "POST", { project: stored });
    assert.equal(missing.status, 400);
    pass("Timeline v1：29.97→30、通過 timeline-v1.ts 驗證、losses 列 " + lost.join("／") + "；缺 organizationId → 400");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  console.log("EVIDENCE " + fixtures + " " + dataDir);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
