// Card ED.3.0 (docs/ed3-properties-spec-20261106.md §7, invariant I1): projects without the ED.3 fields export with the
// same FFmpeg arguments (A, every run() call, byte for byte) and the same video frames (B, framemd5) as when recorded.
// Corpus = tests/fixtures/ed3-legacy/projects.json; ratios 16:9/9:16/4:5/4:3 are projects 1-4, 29.97 fps is project 6.
// Record once: node tests/ed3-legacy-golden.cjs --record   (refuses to overwrite unless --force; say why in the commit)
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { run } = require("../backend/media.cjs"),
  { exportEditor } = require("../backend/editor-export.cjs"),
  { filterPath } = require("../backend/subtitle-burn.cjs");

const here = path.join(__dirname, "fixtures", "ed3-legacy"),
  argsFile = path.join(here, "args.json"),
  md5File = path.join(here, "framemd5.json"),
  record = process.argv.includes("--record"),
  force = process.argv.includes("--force");
if (record && !force && (fs.existsSync(argsFile) || fs.existsSync(md5File)))
  throw Error("快照已存在；重產需 --record --force，並在 commit message 寫明原因");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed3-golden-"));
function ff(args) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args], { windowsHide: true, encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
// Assets made here, deterministically: numbered test pattern with a tone, a still, a tone, a 2^3 LUT.
ff(["-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-c:a", "aac", "-shortest", path.join(dir, "src.mp4")]);
ff(["-f", "lavfi", "-i", "color=c=0xc04020:s=320x180", "-frames:v", "1", path.join(dir, "still.png")]);
ff(["-f", "lavfi", "-i", "sine=frequency=660:duration=3", path.join(dir, "tone.wav")]);
fs.writeFileSync(path.join(dir, "grade.cube"), "LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 .9\n1 0 .9\n0 1 .9\n1 1 .9\n");

// <APP> = this app's folder: the export's ass fontsdir points at <APP>/vendor/fonts, which differs per checkout.
const app = path.join(__dirname, ".."),
  placeholders = [
    ...[dir, dir.replace(/\\/g, "/"), filterPath(dir)].map((p) => [p, "<DIR>"]),
    ...[app, app.replace(/\\/g, "/"), filterPath(app)].map((p) => [p, "<APP>"]),
  ].sort((a, b) => b[0].length - a[0].length);
const scrub = (s) => placeholders.reduce((out, [p, name]) => out.split(p).join(name), s);
const corpus = JSON.parse(fs.readFileSync(path.join(here, "projects.json"), "utf8"));

function firstDifference(want, got) {
  if (want.length !== got.length) return `參數個數 ${want.length} → ${got.length}`;
  for (let i = 0; i < want.length; i++) {
    if (want[i] === got[i]) continue;
    if (want[i - 1] === "-filter_complex") {
      const a = want[i].split(";"),
        b = got[i].split(";"),
        j = a.findIndex((s, k) => s !== b[k]);
      return `filter 段 ${j}：\n  原：${a[j]}\n  新：${b[j]}`;
    }
    return `參數 ${i}：\n  原：${want[i]}\n  新：${got[i]}`;
  }
  return null;
}

(async () => {
  const allArgs = {},
    allMd5 = {};
  for (const [n, { name, project }] of corpus.entries()) {
    const calls = [];
    let count = 0;
    const output = (ext) => {
      const filename = `p${n + 1}-out-${++count}.${ext}`;
      return { file: path.join(dir, filename), url: filename };
    };
    const result = await exportEditor(
      project,
      { file: (url) => path.join(dir, url), output, signal: undefined, run: (args, signal) => (calls.push(args.map(scrub)), run(args, signal)) },
      "720p",
    );
    const frames = ff(["-i", path.join(dir, result.url), "-map", "0:v", "-f", "framemd5", "-"])
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#"));
    allArgs[name] = calls;
    allMd5[name] = frames;
    if (record) {
      console.log(`RECORD ${name}：${calls.length} 次 FFmpeg、${frames.length} 格`);
      continue;
    }
    const want = JSON.parse(fs.readFileSync(argsFile, "utf8"))[name],
      wantMd5 = JSON.parse(fs.readFileSync(md5File, "utf8"))[name];
    assert.ok(want && wantMd5, "快照沒有這個專案：" + name);
    assert.equal(calls.length, want.length, `${name}：FFmpeg 呼叫次數 ${want.length} → ${calls.length}`);
    calls.forEach((args, i) => {
      const diff = firstDifference(want[i], args);
      assert.equal(diff, null, `${name}：第 ${i + 1} 次 FFmpeg 參數不同 — ${diff}`);
    });
    const bad = wantMd5.findIndex((l, i) => l !== frames[i]);
    assert.ok(frames.length === wantMd5.length && bad === -1, `${name}：影格 ${bad === -1 ? "數量 " + wantMd5.length + " → " + frames.length : bad + " 不同"}`);
    console.log(`PASS ${name}：${calls.length} 次 FFmpeg 參數逐字相同、${frames.length} 格 framemd5 相同`);
  }
  if (record) {
    fs.writeFileSync(argsFile, JSON.stringify(allArgs, null, 1) + "\n");
    fs.writeFileSync(md5File, JSON.stringify(allMd5, null, 1) + "\n");
  }
  console.log("EVIDENCE " + dir);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
