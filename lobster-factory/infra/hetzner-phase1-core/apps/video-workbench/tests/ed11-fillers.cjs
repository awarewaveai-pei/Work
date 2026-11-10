// Card ED.11 剪贅字: the cut (scripts/editor-panes/fillers.js FillerCut) on a synthetic clip with a known 「嗯」 and a
// 2-second pause -- picture, narration and subtitle cut together, word times still on their sound, music continuous;
// then the real export of the cut project is sampled. No paid API: the words are given, as recognition would place them.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static");
const FillerCut = require("../scripts/editor-panes/fillers.js"),
  { run } = require("../backend/media.cjs"),
  { exportEditor } = require("../backend/editor-export.cjs"),
  { inspectMedia } = require("../backend/media-inspect.cjs");

const pass = (m) => console.log("PASS " + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed11-"));
const at = (name) => path.join(dir, name);
function ff(args, binary = false) {
  const r = spawnSync(ffmpeg, ["-v", "error", "-y", ...args], { windowsHide: true, timeout: 120000, encoding: binary ? null : "utf8", maxBuffer: 256 * 1024 * 1024 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
}
// Narration: 「大家」 0.1–0.9, 「嗯」 1.0–1.4, silence, 「好」 3.4–4.4 (440 Hz tones). Music: a sweep whose pitch is
// 1000 + 200·t Hz, so its pitch at an output time tells which music second plays there (a cut music would jump ahead).
ff(["-f", "lavfi", "-i", "aevalsrc=0.5*sin(2*PI*440*t)*(between(t\\,0.1\\,0.9)+between(t\\,1.0\\,1.4)+between(t\\,3.4\\,4.4)):d=6:s=48000", at("voice.wav")]);
ff(["-f", "lavfi", "-i", "aevalsrc=0.3*sin(2*PI*(1000*t+100*t*t)):d=6:s=48000", at("music.wav")]);
ff(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=6", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", at("picture.mp4")]);

const tb = { num: 30, den: 1 };
const clip = (id, kind, track, url, startFrame, durationFrames, extra = {}) => ({
  id, kind, track, ...(url ? { asset: { url } } : {}), startFrame, durationFrames, sourceStartFrame: 0,
  start: startFrame / 30, duration: durationFrames / 30, sourceStart: 0, speed: 1, volume: 1, ...extra,
});
const project = () => ({
  id: "p-ed11", timebase: tb, ratio: "16:9", markers: [3.5], tracks: require("../shared/editor-model.js").normalizeTracks(undefined),
  clips: [
    clip("v", "video", "V1", "picture.mp4", 0, 180),
    clip("n", "audio", "A1", "voice.wav", 0, 180),
    clip("m", "audio", "A2", "music.wav", 0, 180),
    clip("s", "text", "T", null, 0, 135, { text: "大家嗯好", subtitleStyle: "白字暗底", x: 50, y: 80,
      words: [{ start: 0.1, end: 0.9, text: "大家" }, { start: 1.0, end: 1.4, text: "嗯" }, { start: 3.4, end: 4.4, text: "好" }] }),
  ],
});

(async () => {
  // 1. Plan: the 「嗯」 (frames 30–42) and the pause after it beyond 0.5 s (1.65–3.15 s = frames 50–95).
  const p = project(), plan = FillerCut.plan(p, { maxPause: 0.5, fillers: true });
  assert.deepEqual([plan.ranges, plan.fillers, plan.pauses, plan.seconds], [[[30, 42], [50, 95]], 1, 1, 1.9]);
  assert.deepEqual(FillerCut.plan(p, { maxPause: 0.5, fillers: false }).ranges, [[50, 95]]);
  assert.deepEqual(FillerCut.plan(p, { maxPause: 2.5, fillers: false }).ranges, []);
  pass("剪除計畫：贅字「嗯」＋超過 0.5 秒的停頓；不剪贅字或放寬停頓時照設定");

  // 2. Apply: picture and narration split into three pieces that close up; subtitle shortened and rewritten; music kept.
  let n = 0;
  FillerCut.apply(p, plan.ranges, () => "piece-" + ++n);
  const rows = (track) => p.clips.filter((c) => c.track === track).sort((a, b) => a.startFrame - b.startFrame).map((c) => [c.startFrame, c.durationFrames, c.sourceStartFrame]);
  assert.deepEqual(rows("V1"), [[0, 30, 0], [30, 8, 42], [38, 85, 95]]);
  assert.deepEqual(rows("A1"), rows("V1"));
  const sub = p.clips.find((c) => c.id === "s");
  assert.deepEqual([sub.startFrame, sub.durationFrames, sub.text], [0, 78, "大家好"]);
  assert.deepEqual(sub.words.map((w) => [w.text, w.start, w.end]), [["大家", 0.1, 0.9], ["好", 1.5, 2.5]]);
  const music = p.clips.find((c) => c.id === "m");
  assert.deepEqual([music.startFrame, music.sourceStartFrame, music.durationFrames], [0, 0, 123]);
  assert.deepEqual(p.markers, [1.6]);
  pass("一起剪：主視訊、旁白各切三段補上空隙，字幕縮短並去掉「嗯」、逐字時間跟著聲音；配樂不切，只收到畫面結尾");

  // 3. Only inside one recording: two narration clips with a 2-second gap between them are not closed up.
  const two = project();
  two.clips = two.clips.filter((c) => c.id !== "n" && c.id !== "s");
  two.clips.push(clip("n1", "audio", "A1", "voice.wav", 0, 30), clip("n2", "audio", "A1", "voice.wav", 90, 60),
    clip("s2", "text", "T", null, 0, 150, { text: "大家好", words: [{ start: 0.1, end: 0.9, text: "大家" }, { start: 3.4, end: 4.4, text: "好" }] }));
  assert.deepEqual(FillerCut.plan(two, { maxPause: 0.5 }).ranges, []);
  pass("只剪同一段錄音內：跨兩段旁白的停頓不剪");

  // 3b. A clip that starts inside a cut, with keys: every piece reads the clip as it was (Codex F2, F4).
  const late = { ...project(), clips: [clip("v", "video", "V1", "picture.mp4", 60, 120, { sourceStartFrame: 10, volumeKeys: [{ frame: 0, gain: 1 }, { frame: 90, gain: 0.25 }] })] };
  FillerCut.apply(late, [[30, 90], [120, 135]], () => "late-2");
  assert.deepEqual(late.clips.map((c) => [c.startFrame, c.durationFrames, c.sourceStartFrame]), [[30, 30, 40], [60, 45, 85]]);
  assert.deepEqual(late.clips[1].volumeKeys.map((k) => k.frame), [0, 15]);
  // A line whose only word is cut goes with it (Codex F3).
  const only = { ...project(), clips: [clip("v", "video", "V1", "picture.mp4", 0, 180), clip("n", "audio", "A1", "voice.wav", 0, 180),
    clip("s", "text", "T", null, 0, 60, { text: "嗯", words: [{ start: 1.0, end: 1.4, text: "嗯" }] })] };
  FillerCut.apply(only, FillerCut.plan(only, { maxPause: 0.5 }).ranges, () => "x");
  assert.ok(!only.clips.some((c) => c.id === "s"));
  // Past the export's clip limit nothing changes (Codex F1); the limit is the exporter's own.
  const { validateProject } = require("../backend/editor-export.cjs");
  const many = (n) => ({ ...project(), clips: Array.from({ length: n }, (_, i) => clip("c" + i, "video", "V1", "picture.mp4", i * 10, 10)) });
  validateProject(many(FillerCut.MEDIA_CLIPS), "720p");
  assert.throws(() => validateProject(many(FillerCut.MEDIA_CLIPS + 1), "720p"));
  const full = many(FillerCut.MEDIA_CLIPS), before = JSON.stringify(full);
  assert.throws(() => FillerCut.apply(full, [[3, 4]], () => "y"), /超過匯出上限 64 段/);
  assert.equal(JSON.stringify(full), before);
  pass("分段讀原片段（來源起點、音量鍵不重複位移）；只剩贅字的字幕句一起剪掉；超過匯出上限 64 段不剪、專案不變");

  // 4. The real export of the cut project: 4.1 s; the 「好」 tone sits under its subtitle word (1.5–2.5 s); the music
  // plays without a gap from start to end.
  const output = (ext) => ({ file: at("out." + ext), url: "out." + ext });
  const result = await exportEditor(p, { file: (u) => at(u), output, signal: undefined, run }, "720p");
  const file = at(result.url);
  assert.ok(Math.abs((await inspectMedia(file)).duration - 4.1) < 0.08, "長度");
  const rms = (filter, from, to) => {
    const pcm = ff(["-i", file, "-af", filter, "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"], true),
      s = pcm.subarray(Math.round(from * 8000) * 2, Math.round(to * 8000) * 2);
    let sum = 0;
    for (let i = 0; i < s.length; i += 2) sum += s.readInt16LE(i) ** 2;
    return Math.sqrt(sum / (s.length / 2));
  };
  const voice = "lowpass=f=600,lowpass=f=600,lowpass=f=600", band = "highpass=f=800,highpass=f=800,highpass=f=800";
  const said = rms(voice, 1.6, 2.4), quiet = rms(voice, 2.6, 3.0);
  assert.ok(said > 8 * quiet, JSON.stringify({ said, quiet }));
  const pcm = ff(["-i", file, "-af", band, "-ac", "1", "-ar", "48000", "-f", "s16le", "pipe:1"], true);
  const pitch = (t) => {
    let crossings = 0;
    for (let i = Math.round(t * 48000), end = Math.round((t + 0.1) * 48000); i < end; i++)
      if ((pcm.readInt16LE(i * 2) >= 0) !== (pcm.readInt16LE(i * 2 + 2) >= 0)) crossings++;
    return crossings / 2 / 0.1;
  };
  for (const t of [0.3, 1.2, 2.0, 3.0, 3.7]) assert.ok(Math.abs(pitch(t) - (1000 + 200 * (t + 0.05))) < 30, `配樂 ${t}s 音高 ${pitch(t)}`);
  const windows = [];
  for (let t = 0.2; t < 3.8; t += 0.1) windows.push(rms(band, t, t + 0.1));
  // The sweep's level through the high-pass rises slowly with its pitch; a gap or a splice would drop a window.
  const jump = windows.findIndex((w, i) => i && (w < 0.85 * windows[i - 1] || w > 1.15 * windows[i - 1]));
  assert.equal(jump, -1, JSON.stringify(windows.map(Math.round)));
  pass("輸出：成片 4.1 秒；「好」的聲音在字幕時間 1.5–2.5 秒；配樂每個取樣點的音高＝原曲同一秒（沒被剪）、音量平穩無斷點");
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
