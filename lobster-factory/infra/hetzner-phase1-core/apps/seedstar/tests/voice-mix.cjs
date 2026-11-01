const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { media } = require("../backend/media.cjs");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seedstar-voice-mix-"));
function run(args) {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args], {
    windowsHide: true,
    encoding: null,
    timeout: 20000,
  });
  assert.equal(r.status, 0, r.stderr?.toString());
  return r.stdout;
}
run([
  "-f",
  "lavfi",
  "-i",
  "color=blue:s=160x90:r=24:d=2",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=2",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-c:a",
  "aac",
  "-shortest",
  path.join(dir, "video.mp4"),
]);
run([
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=660:duration=1",
  "-c:a",
  "libmp3lame",
  path.join(dir, "voice.mp3"),
]);
function strength(pcm, hz) {
  let real = 0,
    imag = 0;
  for (let i = 0; i < pcm.length / 2; i++) {
    const n = pcm.readInt16LE(i * 2) / 32768,
      angle = (2 * Math.PI * hz * i) / 8000;
    real += n * Math.cos(angle);
    imag += n * Math.sin(angle);
  }
  return Math.hypot(real, imag) / (pcm.length / 2);
}
(async () => {
  const result = await media(
    {
      operation: "voice-overlay",
      references: { src: { url: "video.mp4" }, audio: { url: "voice.mp3" } },
      settings: { image: false, duration: 2 },
    },
    {
      file: (url) => path.join(dir, url),
      output: (ext) => {
        const name = crypto.randomUUID() + "." + ext;
        return { file: path.join(dir, name), url: name };
      },
    },
  );
  const pcm = run([
    "-ss",
    "0.2",
    "-i",
    path.join(dir, result.url),
    "-t",
    "0.5",
    "-vn",
    "-ar",
    "8000",
    "-ac",
    "1",
    "-f",
    "s16le",
    "pipe:1",
  ]);
  assert(strength(pcm, 440) > 0.025, "原音軌應保留");
  assert(strength(pcm, 660) > 0.025, "新旁白應混入");
  console.log("PASS 配音混合保留原片 440Hz 與新旁白 660Hz，真實 AAC 輸出");
  console.log("EVIDENCE " + dir);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
