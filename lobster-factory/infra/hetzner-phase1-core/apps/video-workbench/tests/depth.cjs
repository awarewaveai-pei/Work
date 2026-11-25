// Card D1 (影片轉深度影片): the de-flicker alignment of backend/depth-video.cjs, the clip range (I2) and the frame-count
// check (I3). The model itself is checked by the real run in the card's acceptance, not here.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const dv = require("../backend/depth-video.cjs");

const meanAbsDiff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

(async () => {
  // Alignment: one scene, every frame at its own scale and shift (what MiDaS answers) -> after alignment adjacent
  // frames are the same, and one clip-wide range maps them to the same grey frame.
  {
    const scene = Float32Array.from({ length: 64 * 64 }, (_, i) => Math.sin(i / 37) * 3 + (i % 64) / 10);
    const raw = [[1, 0], [2.5, 40], [0.4, -7], [1.8, 300], [0.9, 5]].map(([k, c]) => scene.map((v) => k * v + c));
    let previous = null;
    const aligned = raw.map((map) => (previous = dv.alignFrame(map, previous)).out);
    for (let i = 1; i < aligned.length; i++) assert.ok(meanAbsDiff(aligned[i], aligned[i - 1]) < 1e-3, `frame ${i} aligned onto ${i - 1}`);
    assert.ok(meanAbsDiff(raw[1], raw[0]) > 10, "the raw frames really differ");
    const levels = dv.clipLevels(aligned.flatMap((a) => [...a])),
      grey = aligned.map((a) => dv.toGrey(a, levels));
    for (let i = 1; i < grey.length; i++) assert.ok(meanAbsDiff(grey[i], grey[i - 1]) < 0.01);
    assert.ok(grey[0].includes(0) && grey[0].includes(255), "the clip range spans black to white");
  }
  // No drift: 300 noisy frames of one scene keep the first frame's contrast (ordinary least squares, or aligning onto the smoothed frame, shrank it to < 50%).
  {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
    const scene = Float32Array.from({ length: 4096 }, (_, i) => Math.sin(i / 37) * 3 + (i % 64) / 10),
      spread = (a) => {
        const m = a.reduce((s, v) => s + v, 0) / a.length;
        return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
      };
    let previous = null, first = null;
    for (let f = 0; f < 300; f++) {
      const k = 1 + 0.5 * Math.sin(f / 9), c = 20 * Math.cos(f / 13);
      previous = dv.alignFrame(scene.map((v) => k * (v + 0.6 * rand()) + c), previous);
      first ??= spread(previous.out);
    }
    const ratio = spread(previous.out) / first;
    assert.ok(ratio > 0.9 && ratio < 1.1, `contrast after 300 frames = ${ratio.toFixed(2)} of the first`);
  }
  // A flat frame (no scale to find) keeps its place instead of dividing by zero.
  {
    const fit = dv.fitScaleShift(new Float32Array(16).fill(5), new Float32Array(16).fill(9));
    assert.deepEqual(fit, { scale: 1, shift: 4 });
  }
  // I2: the clip range.
  {
    assert.deepEqual(dv.clipRange({ depthStart: 0, depthEnd: 30 }, 60), { start: 0, end: 30 });
    assert.deepEqual(dv.clipRange({ depthStart: "2.5", depthEnd: "12.5" }, 60), { start: 2.5, end: 12.5 });
    assert.deepEqual(dv.clipRange({ depthStart: 0, depthEnd: 10.03 }, 10), { start: 0, end: 10 });
    // No end = 30 s after the start, or the end of the video; no start = 0.
    assert.deepEqual(dv.clipRange({ depthStart: 5 }, 60), { start: 5, end: 35 });
    assert.deepEqual(dv.clipRange({ depthStart: "50", depthEnd: "" }, 60), { start: 50, end: 60 });
    assert.deepEqual(dv.clipRange({}, 12), { start: 0, end: 12 });
    assert.throws(() => dv.clipRange({ depthStart: 70 }, 60), /大於起始/);
    for (const [settings, message] of [
      [{ depthStart: "a", depthEnd: 5 }, /起始與結束/],
      [{ depthStart: -1, depthEnd: 5 }, /小於 0/],
      [{ depthStart: 5, depthEnd: 5 }, /大於起始/],
      [{ depthStart: 0, depthEnd: 61 }, /超過影片長度/],
      [{ depthStart: 10, depthEnd: 40.5 }, /最多 30 秒/],
    ])
      assert.throws(() => dv.clipRange(settings, 60), message, JSON.stringify(settings));
    // End to end: a refused range writes nothing.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-depth-")),
      source = path.join(dir, "clip.mp4");
    const made = spawnSync(require("ffmpeg-static"), ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=2", "-pix_fmt", "yuv420p", source]);
    assert.equal(made.status, 0, String(made.stderr));
    const outputs = path.join(dir, "out");
    fs.mkdirSync(outputs);
    await assert.rejects(
      dv.depth(
        { operation: "depth", settings: { depthStart: 1, depthEnd: 3 }, references: { src: { url: "/src" } } },
        { file: () => source, output: (ext) => ({ file: path.join(outputs, "result." + ext), url: "/generated/result." + ext }) },
      ),
      /超過影片長度/,
    );
    assert.deepEqual(fs.readdirSync(outputs), [], "no file is left behind");
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // I3: a depth frame count that differs from the frame count is refused.
  assert.throws(() => dv.verifyCounts(299, 300), /深度格數/);
  dv.verifyCounts(300, 300);
  console.log("depth: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
