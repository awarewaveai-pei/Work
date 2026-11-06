// Card ED.3 (docs/ed3-properties-spec-20261106.md §8): every new effect renders one real 720p video and the frames the
// spec names are sampled. Speed 2x lives in tests/ed3-inspector.cjs (it is a UI length rule).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { run } = require("../backend/media.cjs"),
  { exportEditor, piecewise } = require("../backend/editor-export.cjs"),
  { loudnessStats } = require("../backend/media-inspect.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed3-effects-"));
const pass = (m) => console.log("PASS " + m);
function ff(args, binary = false) {
  const r = spawnSync(ffmpeg, ["-v", "error", "-y", ...args], { windowsHide: true, timeout: 120000, encoding: binary ? null : "utf8", maxBuffer: 256 * 1024 * 1024 });
  assert.equal(r.status, 0, String(r.stderr));
  return binary ? r.stdout : r.stdout + r.stderr;
}
const at = (name) => path.join(dir, name);
ff(["-f", "lavfi", "-i", "color=c=red:s=640x360:r=30:d=3", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv444p", at("red.mp4")]);
ff(["-f", "lavfi", "-i", "color=c=black:s=640x360:r=30:d=5", "-c:v", "libx264", "-preset", "ultrafast", at("black.mp4")]);
ff(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=4", "-c:v", "libx264", "-preset", "ultrafast", at("moving.mp4")]);
// A still pattern as a 30 fps video: without shake two neighbouring output frames are identical.
ff(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=1:d=1", "-frames:v", "1", at("pattern.png")]);
ff(["-loop", "1", "-framerate", "30", "-i", at("pattern.png"), "-t", "5", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", at("still.mp4")]);
ff(["-f", "lavfi", "-i", "color=c=red:s=100x100", "-frames:v", "1", at("square.png")]);
ff(["-f", "lavfi", "-i", "color=c=black:s=1280x720", "-f", "lavfi", "-i", "color=c=red:s=1280x80", "-filter_complex", "[0][1]overlay=0:320", "-frames:v", "1", at("bar.png")]);
ff(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", at("voiced.mp4")]);
ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=3", at("bed.wav")]);
ff(["-f", "lavfi", "-i", "sine=frequency=880:duration=1", at("voice.wav")]);

let n = 0;
async function render(project) {
  const output = (ext) => ({ file: at(`out-${++n}.${ext}`), url: `out-${n}.${ext}` });
  const result = await exportEditor({ timebase: { num: 30, den: 1 }, ratio: "16:9", ...project }, { file: (url) => at(url), output, signal: undefined, run }, "720p");
  return at(result.url);
}
// Raw RGB of one output frame (by index), optionally cropped.
const frame = (file, index, crop = "") =>
  ff(["-i", file, "-vf", `select=eq(n\\,${index})${crop ? "," + crop : ""}`, "-vsync", "0", "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], true);
const mean = (buf) => [0, 1, 2].map((c) => buf.filter((_, i) => i % 3 === c).reduce((a, b) => a + b, 0) / (buf.length / 3));
const video = (id, url, startFrame, durationFrames, extra = {}) => ({ id, kind: "video", track: "V1", asset: { url }, startFrame, durationFrames, ...extra });
// Red pixels on row y of a 1280-wide frame: [count, centre x].
function redRow(file, index, y) {
  const row = frame(file, index, `crop=1280:2:0:${y}`), // yuv420p crops in even rows; the first row is read
    xs = [];
  for (let x = 0; x < 1280; x++) if (row[x * 3] > 150 && row[x * 3 + 1] < 90 && row[x * 3 + 2] < 90) xs.push(x);
  return [xs.length, xs.length ? (xs[0] + xs.at(-1) + 1) / 2 : NaN];
}

(async () => {
  // 濾鏡強度: half-strength black & white sits between the untouched red and the full grey.
  const centre = "crop=40:40:620:340";
  const [orig, full, half] = await Promise.all([
    render({ clips: [video("r", "red.mp4", 0, 30)] }),
    render({ clips: [video("r", "red.mp4", 0, 30, { filter: "黑白" })] }),
    render({ clips: [video("r", "red.mp4", 0, 30, { filter: "黑白", filterStrength: 0.5 })] }),
  ]).then((files) => files.map((f) => mean(frame(f, 15, centre))[0]));
  assert.ok(orig - full > 20 && half > full + 10 && half < orig - 10, JSON.stringify({ orig, full, half }));
  pass(`濾鏡強度：0.5 s 中心 R 原始 ${orig.toFixed(0)}、黑白 50% ${half.toFixed(0)}、黑白 100% ${full.toFixed(0)}（介於兩者之間）`);

  // 套用範圍: the project's black & white reaches the first clip; the second clip's own 原始 wins.
  const scoped = await render({ filter: "黑白", clips: [video("a", "red.mp4", 0, 30), video("b", "red.mp4", 30, 30, { filter: "原始" })] });
  const [a, b] = [mean(frame(scoped, 15, centre)), mean(frame(scoped, 45, centre))];
  assert.ok(Math.abs(a[0] - a[2]) < 10 && b[0] > b[2] + 100, JSON.stringify({ a, b }));
  pass(`套用範圍：整片黑白＋第二段自己的原始 → 第一段灰（R${a[0].toFixed(0)}／B${a[2].toFixed(0)}）、第二段紅（R${b[0].toFixed(0)}）`);

  // 光漏: warm light from the top-left corner over black, nothing in the bottom-right.
  const leak = await render({ clips: [video("k", "black.mp4", 0, 30, { lightLeak: 1 })] });
  const tl = mean(frame(leak, 15, "crop=40:40:0:0")),
    br = mean(frame(leak, 15, "crop=40:40:1240:680"));
  assert.ok(tl[0] > 120 && tl[0] > tl[2] + 60 && Math.max(...br) < 20, JSON.stringify({ tl, br }));
  pass(`光漏：0.5 s 左上 40×40 RGB ${tl.map((v) => v.toFixed(0))}（暖光）、右下 ${br.map((v) => v.toFixed(0))}（黑）`);

  // 震動: a still picture moves between frames 5 and 6 only with shake; the clip is long enough for the export's own
  // frame check to apply, which must skip shaken clips (spec §3.4 point 8).
  const shakeCrop = "crop=400:240:440:240";
  const [still, shaken] = await Promise.all([render({ clips: [video("s", "still.mp4", 0, 130)] }), render({ clips: [video("s", "still.mp4", 0, 130, { shake: 1 })] })]);
  const moved = (file) => {
    const a = frame(file, 5, shakeCrop),
      b = frame(file, 6, shakeCrop);
    return a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
  };
  const [calm, shook] = [moved(still), moved(shaken)];
  assert.ok(calm < 2 && shook > 8, JSON.stringify({ calm, shook }));
  pass(`震動：靜止畫面第 5、6 格同一 crop 平均像素差 — 無震動 ${calm.toFixed(2)}（與來源一致）、震動 100% ${shook.toFixed(1)}；4.3 秒片段輸出驗證通過（抽格自驗已跳過震動片段）`);

  // 關鍵影格縮放／位移: a 100 px red square, scale 1 -> 2 and x 0 -> 50 % over frames 0..59; centre row y = 50 %.
  const keys = [{ frame: 0, scale: 1, x: 0, y: 50, rotation: 0 }, { frame: 59, scale: 2, x: 50, y: 50, rotation: 0 }];
  const keyed = await render({
    clips: [video("bg", "black.mp4", 0, 60), { id: "sq", kind: "image", track: "V2", asset: { url: "square.png" }, startFrame: 0, durationFrames: 60, width: 7.8125, transformKeys: keys }],
  });
  for (const f of [0, 30, 59]) {
    const t = f / 30,
      s = evalCurve(keys, "scale", t),
      x = evalCurve(keys, "x", t),
      w = 2 * Math.trunc((100 * s) / 2),
      cx = (1280 - 100 * s) * (x / 100) + (100 * s) / 2,
      [count, mid] = redRow(keyed, f, 360);
    assert.ok(Math.abs(count - w) <= 4 && Math.abs(mid - cx) <= 4, JSON.stringify({ f, count, w, mid, cx }));
  }
  pass("關鍵影格縮放／位移：第 0／30／59 格中線紅色寬度與中心 x 等於 piecewise 算出的值 ±4 px");

  // 關鍵影格旋轉: a full-width red bar on the main track turns 0 -> 90 degrees.
  const turned = await render({
    clips: [{ id: "bar", kind: "image", track: "V1", asset: { url: "bar.png" }, startFrame: 0, durationFrames: 60, transformKeys: [{ frame: 0, scale: 1, x: 0, y: 0, rotation: 0 }, { frame: 59, scale: 1, x: 0, y: 0, rotation: 90 }] }],
  });
  const [r0] = redRow(turned, 0, 360),
    [r59] = redRow(turned, 59, 360);
  assert.ok(r59 < r0 / 2, JSON.stringify({ r0, r59 }));
  pass(`關鍵影格旋轉：中線橫向紅色長度第 0 格 ${r0} px → 第 59 格 ${r59} px（< 一半）`);

  // 背景模糊強度: 16:9 footage in a 9:16 frame; the blurred band above it is smoother at 40 than at 2.
  const spread = (buf) => {
    const values = [...buf],
      m = values.reduce((p, q) => p + q, 0) / values.length;
    return Math.sqrt(values.reduce((p, q) => p + (q - m) ** 2, 0) / values.length);
  };
  const [blur2, blur40] = await Promise.all(
    [2, 40].map((r) => render({ ratio: "9:16", clips: [video("m", "moving.mp4", 0, 30, { background: "模糊", backgroundBlur: r })] })),
  ).then((files) => files.map((f) => spread(frame(f, 15, "crop=40:40:340:100"))));
  assert.ok(blur40 < blur2, JSON.stringify({ blur2, blur40 }));
  pass(`背景模糊強度：上方模糊區 40×40 像素標準差 半徑 2 = ${blur2.toFixed(1)}、半徑 40 = ${blur40.toFixed(1)}`);

  // 分離音訊: the detached A1 clip carries the video's sound; from a video without sound it renders silent.
  const detach = (url) => ({
    clips: [video("v", url, 0, 60, { muted: true }), { id: "d", kind: "audio", track: "A1", asset: { url }, startFrame: 0, durationFrames: 60, detachedFrom: "v" }],
  });
  const heard = await loudnessStats(await render(detach("voiced.mp4")));
  assert.ok(heard.integratedLufs > -40, JSON.stringify(heard));
  const mute = await loudnessStats(await render(detach("moving.mp4")));
  assert.ok(!(mute.integratedLufs > -70), JSON.stringify(mute));
  pass(`分離音訊：有聲影片 → 響度 ${heard.integratedLufs} LUFS；無音軌影片 → 輸出成功且靜音（${mute.integratedLufs}）`);

  // 旁白時降低: the 440 Hz bed ducks while the 880 Hz narration (1.0-2.0 s) plays.
  const ducked = await render({
    clips: [
      video("bg", "black.mp4", 0, 90, { volume: 0 }),
      { id: "bed", kind: "audio", track: "A2", asset: { url: "bed.wav" }, startFrame: 0, durationFrames: 90, duck: true },
      { id: "vo", kind: "audio", track: "A1", asset: { url: "voice.wav" }, startFrame: 30, durationFrames: 30 },
    ],
  });
  const rms = (from) => {
    const log = ff(["-v", "info", "-ss", String(from), "-t", "0.4", "-i", ducked, "-af", "bandpass=f=440:width_type=q:w=8,astats=metadata=0:measure_overall=RMS_level:measure_perchannel=none", "-f", "null", "-"]);
    return Number(/RMS level dB:\s*(-?[\d.]+)/.exec(log)[1]);
  };
  const before = rms(0.3),
    during = rms(1.3);
  assert.ok(before - during >= 10 && before - during <= 14, JSON.stringify({ before, during }));
  pass(`旁白時降低：440 Hz 頻帶 RMS 0.3–0.7 s ${before} dB、1.3–1.7 s ${during} dB（低 ${(before - during).toFixed(1)} dB）`);
  console.log("EVIDENCE " + dir);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

// The keyframe curve evaluated in JS the same way the FFmpeg expression is built (piecewise), for the expected values.
function evalCurve(keys, name, t) {
  const expr = piecewise(keys.map((k) => [k.frame / 30, k[name]]), "T");
  return Function("T", "const lt=(a,b)=>a<b; const iff=(c,a,b)=>c?a:b; return " + expr.replace(/if\(/g, "iff(").replace(/lt\(/g, "lt("))(t);
}
