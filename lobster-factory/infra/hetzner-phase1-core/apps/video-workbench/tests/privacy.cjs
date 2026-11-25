// Card P1 (肖像權保護): the tracking rules of backend/face-privacy.cjs (I2), zero faces = no result (I3), mask count =
// frame count (I4). The detector itself is checked by the real run in the card's acceptance, not here.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const fp = require("../backend/face-privacy.cjs");
const W = 1280,
  H = 720,
  face = (x, y, w = 100, h = 120) => ({ x, y, w, h, score: 0.9 });
const empty = (n) => Array.from({ length: n }, () => []);

(async () => {
  // I2 missing frames: detected at 30 and 40 only -> every frame between is covered, interpolated.
  {
    const frames = empty(100);
    frames[30] = [face(100, 100)];
    frames[40] = [face(200, 100)];
    const { perFrame } = fp.planMasks(frames, { width: W, height: H });
    for (let f = 30; f <= 40; f++) assert.equal(perFrame[f].length, 1, `frame ${f} must be covered`);
    const mid = perFrame[35][0];
    assert.ok(Math.abs(mid.x + mid.w / 2 - 200) < 1, "frame 35 sits halfway between the two detections");
  }
  // I2 head/tail: 0.3 s (9 frames at 30 fps) before the first and after the last detection, not further.
  {
    const frames = empty(100);
    for (let f = 30; f <= 60; f++) frames[f] = [face(300, 200)];
    const { perFrame, stats } = fp.planMasks(frames, { width: W, height: H });
    assert.equal(perFrame[21].length, 1);
    assert.equal(perFrame[69].length, 1);
    assert.equal(perFrame[20].length, 0);
    assert.equal(perFrame[70].length, 0);
    assert.deepEqual(stats, { faces: 1, coveredFrames: 49, totalFrames: 100 });
  }
  // I2 expansion: every side grows by >= 25% of the face, and the drawn ellipse still covers the whole face box.
  {
    const box = face(400, 300, 100, 120),
      grown = fp.expandBox(box, W, H);
    assert.ok(box.x - grown.x >= 25 && box.y - grown.y >= 30);
    assert.ok(grown.x + grown.w - (box.x + box.w) >= 25 && grown.y + grown.h - (box.y + box.h) >= 30);
    const mask = fp.drawMask([grown], W, H, 1);
    for (const [x, y] of [[box.x, box.y], [box.x + box.w - 1, box.y], [box.x, box.y + box.h - 1], [box.x + box.w - 1, box.y + box.h - 1]])
      assert.equal(mask[y * W + x], 255, `face corner ${x},${y} under the mask`);
  }
  // Two faces passing each other keep their own tracks (no swap at the crossing).
  {
    const frames = empty(60);
    for (let f = 0; f < 60; f++) frames[f] = [face(100 + f * 15, 300), face(1000 - f * 15, 310)];
    const tracks = fp.buildTracks(frames);
    assert.equal(tracks.length, 2);
    for (const t of tracks) {
      const xs = t.dets.map((d) => d.box.x),
        direction = Math.sign(xs[1] - xs[0]);
      assert.equal(t.dets.length, 60);
      assert.ok(xs.every((x, i) => !i || Math.sign(x - xs[i - 1]) === direction), "a track never turns back = no swap");
    }
  }
  // I3: no face anywhere -> refused (pure) and, end to end, no file is written.
  {
    assert.throws(() => fp.planMasks(empty(50), { width: W, height: H }), /沒有偵測到人臉/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-privacy-")),
      source = path.join(dir, "faceless.mp4");
    const made = spawnSync(require("ffmpeg-static"), ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=2", "-pix_fmt", "yuv420p", source]);
    assert.equal(made.status, 0, String(made.stderr));
    const outputs = path.join(dir, "out");
    fs.mkdirSync(outputs);
    await assert.rejects(
      fp.privacy(
        { operation: "privacy", settings: { privacyType: "馬賽克", privacyStrength: "中" }, references: { src: { url: "/src" } } },
        { file: () => source, output: (ext) => ({ file: path.join(outputs, "result." + ext), url: "/generated/result." + ext }) },
      ),
      /沒有偵測到人臉/,
    );
    assert.deepEqual(fs.readdirSync(outputs), [], "no protected-looking file is left behind");
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // I4: a mask count that differs from the frame count is refused.
  assert.throws(() => fp.verifyCounts(899, 900), /遮罩格數/);
  fp.verifyCounts(900, 900);
  console.log("privacy: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
