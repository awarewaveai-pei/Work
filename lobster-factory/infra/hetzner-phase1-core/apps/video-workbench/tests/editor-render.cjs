const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { media } = require("../backend/media.cjs");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seedstar-editor-render-"));
function run(args) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args], {
    windowsHide: true,
    encoding: null,
    timeout: 30000,
  });
  assert.equal(r.status, 0, r.stderr?.toString());
  return r.stdout;
}
for (const color of ["red", "blue"])
  run([
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=160x90:r=30:d=2`,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    path.join(dir, color + ".mp4"),
  ]);
const output = (ext) => {
  const filename = crypto.randomUUID() + "." + ext;
  return { file: path.join(dir, filename), url: filename };
};
const clip = (id, color, start) => ({
  id,
  kind: "video",
  track: "V1",
  asset: { url: color + ".mp4" },
  startFrame: start * 30,
  durationFrames: 30,
  filter: "鮮豔",
});
function pixels(file, time) {
  return run([
    "-ss",
    String(time),
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "scale=1:1",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
}
(async () => {
  for (const type of ["融接", "淡入淡出", "向左擦除", "向右擦除", "圓形裁切"]) {
    const p = {
      ratio: "16:9",
      timebase: { num: 30, den: 1 },
      clips: [
        clip("red", "red", 0),
        {
          ...clip("blue", "blue", 1),
          transition: type,
          transitionDuration: 0.4,
          transitionCurve: "平滑",
        },
      ],
    };
    const result = await media(
      { operation: "editor-export", settings: { project: p, quality: "720p" } },
      { file: (url) => path.join(dir, url), output },
    );
    const file = path.join(dir, result.url),
      a = pixels(file, 0.2),
      b = pixels(file, 1.8);
    assert(a[0] > a[2] + 100);
    assert(b[2] > b[0] + 100);
    if (type === "融接") {
      const mid = pixels(file, 1);
      assert(mid[0] > 40 && mid[2] > 40, JSON.stringify([...mid]));
    }
    console.log("PASS 真實轉場輸出 " + type);
  }
  for (const mask of ["圓形", "圓角矩形", "三角形"]) {
    const p = {
      ratio: "4:3",
      timebase: { num: 30, den: 1 },
      clips: [
        {
          ...clip("masked", "red", 0),
          mask,
          background: "模糊",
          filter: "鮮豔",
          grain: 0.1,
          rotation: 10,
        },
      ],
    };
    const result = await media(
      { operation: "editor-export", settings: { project: p, quality: "720p" } },
      { file: (url) => path.join(dir, url), output },
    );
    assert(fs.statSync(path.join(dir, result.url)).size > 1000);
    const corner = run([
      "-ss",
      "0.5",
      "-i",
      path.join(dir, result.url),
      "-frames:v",
      "1",
      "-vf",
      "crop=20:20:0:0,scale=1:1",
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    assert(
      [...corner].every((n) => n < 20),
      "遮罩外應透明並露出黑底",
    );
    console.log("PASS 遮罩／模糊背景／旋轉／濾鏡 " + mask);
  }
  console.log("EVIDENCE " + dir);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
