// Card P2 acceptance (handoff §4.1–4.4, plan §4 P2): a MOV + MP4 cut with a real 溶解 (xfade) transition, an image,
// three video tracks, overlapping 繁中 subtitles on two text tracks, two audio tracks with volume keyframes, a LUT
// (.cube uploaded to the library) and +1 EV on one clip, exported at 1080p through the job API, then checked from
// the output file itself: (a) verifyOutput incl. BT.709 tags (b) the cut midpoint is a real mix (c) an untouched
// frame equals its source frame (job frameChecks) (d) loudness -16 ± 1 LU, true peak <= -1 dBTP (e) no silence
// across the cut (f) the grade changes measured pixels vs the ungraded source (g) save -> reload -> export again ->
// same frames. Then a 3 s project at 4K: 3840x2160, verified.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static");
const { isolatedServer } = require("./isolated-server.cjs"),
  { verifyOutput, loudnessStats, inspectMedia } = require("../backend/media-inspect.cjs"),
  SubtitleParse = require("../shared/subtitle-parse.js"),
  ProjectEnvelope = require("../shared/project-envelope.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vw-p2-mix-fixtures-"));
function ff(args, { binary = false } = {}) {
  const r = spawnSync(ffmpeg, ["-v", "error", "-y", ...args], { windowsHide: true, timeout: 120000, encoding: binary ? null : "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, String(r.stderr));
  return r;
}
// Frame n of a file as the mean RGB of a box (each file decoded with its own colour matrix).
function rgb(file, n, [x, y, w, h]) {
  const out = ff(["-i", file, "-vf", `select=eq(n\\,${n}),crop=${w}:${h}:${x}:${y},scale=1:1:flags=area,format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "-"], { binary: true }).stdout;
  return [...out.subarray(0, 3)];
}
function frameHash(file, n) {
  const out = ff(["-i", file, "-vf", `select=eq(n\\,${n}),format=rgb24`, "-frames:v", "1", "-f", "rawvideo", "-"], { binary: true }).stdout;
  assert.ok(out.length > 0, "frame " + n + " missing");
  return crypto.createHash("sha256").update(out).digest("hex");
}
let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};

(async () => {
  const { base, dataDir, server } = await isolatedServer("vw-p2-mix-");
  const generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated, { recursive: true });
  const fixture = (ext, args) => {
    const name = crypto.randomUUID() + "." + ext;
    ff([...args, path.join(generated, name)]);
    return "/generated/" + name;
  };
  // Footage: moving testsrc2 (frame-exact checks) with a solid colour band on top and a grey (100) band below.
  const bands = (top) => `drawbox=x=0:y=0:w=640:h=60:color=${top}:t=fill,drawbox=x=0:y=300:w=640:h=60:color=0x646464:t=fill`;
  const mov = fixture("mov", ["-f", "lavfi", "-i", `testsrc2=s=640x360:r=30:d=8,${bands("0xFF0000")}`, "-f", "lavfi", "-i", "sine=f=440:sample_rate=48000:d=8",
    "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]);
  const mp4 = fixture("mp4", ["-f", "lavfi", "-i", `testsrc2=s=640x360:r=30:d=6,${bands("0x0000FF")}`, "-f", "lavfi", "-i", "sine=f=1000:sample_rate=48000:d=6",
    "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]);
  const png = fixture("png", ["-f", "lavfi", "-i", "color=c=orange:s=320x180", "-frames:v", "1"]);
  const voice = fixture("wav", ["-f", "lavfi", "-i", "sine=f=300:sample_rate=48000:d=3"]);
  const music = fixture("wav", ["-f", "lavfi", "-i", "sine=f=220:sample_rate=48000:d=4"]);
  const api = (route, method = "GET", body) =>
    fetch(base + "/api/seedstar" + route, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body && JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

  // LUT asset: a 2-point cube that inverts red (R' = 1 - R), uploaded like any library file.
  const rows = [];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) rows.push(`${1 - r} ${g} ${b}`);
  const cube = "TITLE \"invert red\"\nLUT_3D_SIZE 2\n" + rows.join("\n") + "\n";
  const lut = await api("/uploads", "POST", { name: "反轉紅色.cube", data: "data:application/x-cube;base64," + Buffer.from(cube).toString("base64") });
  assert.equal(lut.status, 201, JSON.stringify(lut.body));
  assert.equal(lut.body.kind, "lut");
  const badLut = await api("/uploads", "POST", { name: "bad.cube", data: "data:application/x-cube;base64," + Buffer.from("LUT_3D_SIZE 2\n0 0 0\n").toString("base64") });
  assert.equal(badLut.status, 400);
  pass("LUT：.cube 上傳成素材庫資產（kind lut）；資料列數不符的 .cube 被拒（400）");

  // Subtitles: an overlapping pair with 繁中 multi-line text, parsed by the editor's parser; the overlap goes to T2.
  const cues = SubtitleParse.parse("1\r\n00:00:09,000 --> 00:00:09,800\r\n第一行，\r\n第二行！\r\n\r\n2\r\n00:00:09,400 --> 00:00:10,000\r\n重疊字幕\r\n");
  const fps = 30,
    f = (ms) => Math.round((ms / 1000) * fps);
  const project = {
    id: crypto.randomUUID(),
    title: "P2 混音",
    ratio: "16:9",
    timebase: { num: 30, den: 1 },
    output: { loudness: -16 },
    tracks: [
      { id: "V1", kind: "video" }, { id: "V2", kind: "video" }, { id: "V3", kind: "video" },
      { id: "T", kind: "text" }, { id: "T2", kind: "text" },
      { id: "A1", kind: "audio" }, { id: "A2", kind: "audio" },
    ],
    assets: [],
    markers: [],
    clips: [
      // Main track: MOV 0-150, MP4 150-270 with a 20-frame 溶解 centred on the cut; the MP4 is graded.
      { id: "mov", kind: "video", track: "V1", asset: { url: mov }, startFrame: 0, durationFrames: 150, sourceStartFrame: 30, speed: 1 },
      { id: "mp4", kind: "video", track: "V1", asset: { url: mp4 }, startFrame: 150, durationFrames: 120, sourceStartFrame: 30, speed: 1,
        transition: "溶解", transitionFrames: 20, exposure: 1, lut: { url: lut.body.url, name: lut.body.name } },
      { id: "logo", kind: "image", track: "V2", asset: { url: png }, startFrame: 240, durationFrames: 60 },
      { id: "pip", kind: "video", track: "V3", asset: { url: mp4 }, startFrame: 270, durationFrames: 30, sourceStartFrame: 0, speed: 1, width: 20, x: 10, y: 10 },
      ...cues.map((cue, i) => ({ id: "cue" + i, kind: "text", track: i ? "T2" : "T", text: cue.text, startFrame: f(cue.startMs), durationFrames: f(cue.endMs) - f(cue.startMs) })),
      { id: "voice", kind: "audio", track: "A1", asset: { url: voice }, startFrame: 0, durationFrames: 90, sourceStartFrame: 0, speed: 1, volumeKeys: [{ frame: 0, gain: 0.2 }, { frame: 60, gain: 1 }] },
      { id: "music", kind: "audio", track: "A2", asset: { url: music }, startFrame: 210, durationFrames: 90, sourceStartFrame: 0, speed: 1, volumeKeys: [{ frame: 0, gain: 1 }, { frame: 89, gain: 0.3 }] },
    ],
  };
  async function exportJob(p, quality) {
    const created = await api("/generations", "POST", { type: "video", operation: "editor-export", settings: { quality, project: p } });
    assert.equal(created.status, 202, JSON.stringify(created.body));
    let job;
    for (let i = 0; i < 2400; i++) {
      job = (await api("/generations/" + created.body.id)).body;
      if (["succeeded", "failed"].includes(job.status)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(job.status, "succeeded", JSON.stringify(job.error || job));
    return { job, file: path.join(dataDir, job.result.url.slice(1)) };
  }

  const first = await exportJob(project, "1080p"),
    out = first.file,
    v = first.job.result.verification;
  // (a)
  assert.equal(v.ok, true);
  assert.deepEqual(v.color, { space: "bt709", primaries: "bt709", transfer: "bt709", range: "tv" });
  const check = await verifyOutput(out, { duration: 10, fps: { num: 30, den: 1 }, width: 1920, height: 1080, audio: true, audible: true, color: "bt709" });
  assert.equal(check.ok, true, JSON.stringify(check.findings));
  pass("(a) 1080p 匯出通過 verifyOutput：10 秒、30 fps、1920×1080、有聲、BT.709／TV 範圍標記");

  // (b) Transition window = frames 140..159; frame 150 is its midpoint. Top band: MOV red vs graded MP4.
  const band = [860, 40, 200, 100],
    before = rgb(out, 130, band),
    after = rgb(out, 170, band),
    mid = rgb(out, 150, band);
  const mixed = [0, 1, 2].filter((ch) => {
    const lo = Math.min(before[ch], after[ch]),
      hi = Math.max(before[ch], after[ch]),
      span = hi - lo;
    return span > 60 && mid[ch] > lo + span * 0.25 && mid[ch] < hi - span * 0.25;
  });
  assert.ok(mixed.length >= 1, JSON.stringify({ before, mid, after }));
  pass(`(b) 剪點中央第 150 格是兩段真正混合：前 ${before} → 中 ${mid} → 後 ${after}（第 ${mixed} 色板介於兩者之間）`);

  // (c)
  assert.ok(v.frameChecks >= 1, JSON.stringify(v));
  pass(`(c) 未加工的整畫面片段由匯出任務抽格比對來源（frameChecks ${v.frameChecks}，PSNR ≥ 28 dB）`);

  // (d)
  const measured = await loudnessStats(out);
  assert.ok(Math.abs(measured.integratedLufs + 16) <= 1, JSON.stringify(measured));
  assert.ok(measured.truePeakDb <= -1, JSON.stringify(measured));
  assert.ok(Math.abs(v.loudness.integratedLufs - measured.integratedLufs) < 0.05 && v.loudness.target === -16, JSON.stringify(v.loudness));
  pass(`(d) 響度 ${measured.integratedLufs} LUFS（目標 −16 ± 1）、真峰值 ${measured.truePeakDb} dBTP（≤ −1）；任務紀錄同值`);

  // (e) 4.5 s .. 5.5 s around the cut at 5 s: clip audio (440 Hz -> 1000 Hz) without a gap.
  const silence = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-ss", "4.5", "-t", "1", "-i", out, "-af", "silencedetect=n=-50dB:d=0.05", "-f", "null", "-"], { encoding: "utf8", windowsHide: true });
  assert.equal(silence.status, 0);
  assert.doesNotMatch(silence.stderr, /silence_start/, silence.stderr.slice(-800));
  pass("(e) 剪點前後各 0.5 秒沒有超過 50 ms 的靜音（silencedetect −50 dB）");

  // (f) Grey band (source 100): MP4 frame 200 = source frame 80, graded (+1 EV, then red inverted) vs ungraded.
  const grey = [860, 940, 200, 100],
    src = rgb(path.join(dataDir, mp4.slice(1)), 80, [287, 313, 66, 33]),
    graded = rgb(out, 200, grey),
    plain = rgb(out, 75, grey);
  assert.ok(Math.abs(plain[1] - src[1]) <= 12, JSON.stringify({ src, plain }));
  assert.ok(Math.abs(graded[1] - Math.min(255, 2 * src[1])) <= 25, JSON.stringify({ src, graded }));
  assert.ok(graded[0] < graded[1] - 90, JSON.stringify({ src, graded }));
  pass(`(f) 調色改變實際像素：來源灰 ${src} → 未調色片段 ${plain} → 曝光 +1＋LUT 反轉紅色 ${graded}`);

  // (g) Save through /state, reload it, export the reloaded project: the same frames come out.
  const state = (await api("/state")).body;
  const saved = await api("/state", "PUT", {
    version: 1, characters: [], projects: [], assets: [], jobs: [], ...(state || {}),
    preferences: { ...(state?.preferences || {}), "tools.editor.projects": [ProjectEnvelope.wrap(project, { revision: 0 })] },
    revision: state?.revision ?? 0,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const reloaded = ProjectEnvelope.unwrap((await api("/state")).body.preferences["tools.editor.projects"][0]).native;
  assert.deepEqual(reloaded, project);
  const second = await exportJob(reloaded, "1080p");
  for (const n of [75, 150, 200, 285]) assert.equal(frameHash(second.file, n), frameHash(out, n), "frame " + n);
  pass("(g) 保存 → 重新讀回 → 再匯出：第 75／150／200／285 格逐格雜湊相同");

  // 4K once: a 3 s cut of the MOV with its audio.
  const short = {
    ...project,
    id: crypto.randomUUID(),
    tracks: undefined,
    clips: [{ id: "k4", kind: "video", track: "V1", asset: { url: mov }, startFrame: 0, durationFrames: 90, sourceStartFrame: 0, speed: 1 }],
  };
  delete short.tracks; // pre-P2 form (no tracks): reads as the five legacy tracks
  const k4 = await exportJob(short, "4K"),
    info = await inspectMedia(k4.file);
  assert.equal(info.displayWidth, 3840);
  assert.equal(info.displayHeight, 2160);
  assert.equal(k4.job.result.verification.ok, true);
  assert.equal(k4.job.result.width, 3840);
  pass("4K：3 秒專案輸出 3840×2160，驗證通過（舊格式無軌道清單的專案也可匯出）");

  console.log(passed + " passed");
  server.closeAllConnections();
  server.close();
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
