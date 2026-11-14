// Card VD.1: free cover candidates (backend/cover.cjs). The defect it closes: 2026-11-14 every video in 貼文清單 showed a
// black square because videos open on black. A cover is never a black frame when the video has a picture, is the
// video's own size, fits YouTube's 2 MB, and carries the title only when there is one.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { run } = require("../backend/media.cjs"),
  { fontDir } = require("../backend/editor-export.cjs"),
  { autoCovers, pickTimes, parseStats, titleSize, coverBudget, MAX_BYTES } = require("../backend/cover.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-cover-"));
const make = (name, filter, seconds, size = "640x360") => {
  const file = path.join(dir, name);
  assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", filter, "-t", String(seconds), "-s", size, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", file], { windowsHide: true }).status, 0);
  return file;
};
// Mean luma of one JPEG (signalstats YAVG), read the same way cover.cjs reads frames.
const yavg = (file) => {
  const stats = path.join(dir, "probe-" + path.basename(file) + ".txt");
  assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-i", file, "-vf", `signalstats,metadata=print:file=${path.basename(stats)}`, "-f", "null", "-"], { cwd: dir, windowsHide: true }).status, 0);
  return parseStats(fs.readFileSync(stats, "utf8"))[0].YAVG;
};
const size = (file) => {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8", windowsHide: true });
  return /(\d{2,5})x(\d{2,5})/.exec(r.stderr).slice(1).map(Number);
};

(async () => {
  // Pure ranking: dark/white frames dropped, highest contrast first, kept >= 2 s apart, returned in time order.
  assert.deepEqual(pickTimes([
    { t: 0, YAVG: 5, YLOW: 0, YHIGH: 10 }, { t: 1, YAVG: 120, YLOW: 20, YHIGH: 220 }, { t: 2, YAVG: 120, YLOW: 10, YHIGH: 230 },
    { t: 5, YAVG: 240, YLOW: 200, YHIGH: 255 }, { t: 6, YAVG: 100, YLOW: 60, YHIGH: 140 },
  ], 3), [2, 6]);
  assert.deepEqual(pickTimes([{ t: 0, YAVG: 3 }], 3), []);
  assert.equal(titleSize(1920, 1080), 80);
  assert.equal(titleSize(1080, 1920), 45);
  // Covers end 5 s before the job's deadline (the browser stops watching then), take at most 120 s, and are skipped
  // when under 3 s would be left; no deadline (a professional-editor render) = 120 s.
  const now = Date.parse("2026-11-14T00:00:00Z"), at = (s) => new Date(now + s * 1000).toISOString();
  assert.equal(coverBudget(at(600), now), 120000);
  assert.equal(coverBudget(at(65), now), 60000);
  assert.equal(coverBudget(at(7), now), 0);
  assert.equal(coverBudget(at(-1), now), 0);
  assert.equal(coverBudget(undefined, now), 120000);

  // Black for the first 3 s, then colour bars: no candidate may be black; 16:9 at its own size, each <= 2 MB.
  const bars = make("bars.mp4", "smptebars=size=640x360:rate=10", 7),
    black = make("black.mp4", "color=c=black:size=640x360:rate=10", 3);
  const joined = path.join(dir, "joined.mp4");
  assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-i", black, "-i", bars, "-filter_complex", "[0:v][1:v]concat=n=2:v=1[v]", "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", joined], { windowsHide: true }).status, 0);
  const plain = await autoCovers({ file: joined, duration: 10, width: 640, height: 360, title: "", dir }, { run, fontDir });
  assert.ok(plain.length >= 1 && plain.length <= 3, "1-3 candidates");
  for (const c of plain) {
    assert.ok(c.t >= 3, `candidate at ${c.t}s is after the black opening`);
    assert.ok(yavg(c.file) > 24, "candidate is not black");
    assert.deepEqual(size(c.file), [640, 360]);
    assert.ok(fs.statSync(c.file).size <= MAX_BYTES);
  }

  // Same frame with a 中文 title: the picture changes (the title band is drawn); the pinned font has the glyphs.
  const titled = await autoCovers({ file: joined, duration: 10, width: 640, height: 360, title: "封面標題 Cover", dir, count: 1 }, { run, fontDir });
  const untitled = await autoCovers({ file: joined, duration: 10, width: 640, height: 360, title: "", dir, count: 1 }, { run, fontDir });
  assert.equal(titled[0].t, untitled[0].t);
  assert.notEqual(fs.readFileSync(titled[0].file).toString("base64"), fs.readFileSync(untitled[0].file).toString("base64"), "title drawn");

  // A video that is black throughout still gets one cover: the middle frame (never nothing, never an error).
  const dark = make("dark.mp4", "color=c=black:size=360x640:rate=10", 4, "360x640");
  const fallback = await autoCovers({ file: dark, duration: 4, width: 360, height: 640, title: "", dir }, { run, fontDir });
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].t, 2);
  assert.deepEqual(size(fallback[0].file), [360, 640]);

  // Shorter than 1 s: no sampling window; the middle frame.
  const short = make("short.mp4", "smptebars=size=640x360:rate=10", 0.6);
  assert.equal((await autoCovers({ file: short, duration: 0.6, width: 640, height: 360, dir }, { run, fontDir })).length, 1);

  // A run that fails while a JPEG is being written (timeout, cancel, ffmpeg error) leaves no JPEG behind, finished or not.
  const failDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-cover-fail-"));
  let extracts = 0;
  const failing = async (args, signal) => {
    const out = args[args.length - 1];
    if (/\.jpg$/.test(out) && ++extracts === 2) {
      fs.writeFileSync(out, "half");
      throw Error("媒體處理失敗：stopped");
    }
    return run(args, signal);
  };
  await assert.rejects(autoCovers({ file: joined, duration: 10, width: 640, height: 360, title: "", dir: failDir }, { run: failing, fontDir }), /stopped/);
  assert.deepEqual(fs.readdirSync(failDir), [], "no partial or finished cover left after a failure");
  fs.rmSync(failDir, { recursive: true, force: true });

  // No temporary stats/ASS files are left behind next to the covers.
  assert.deepEqual(fs.readdirSync(dir).filter((f) => /^cover-.*\.(txt|ass)$/.test(f)), []);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("cover: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
