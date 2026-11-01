const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  ffmpeg = require("ffmpeg-static"),
  { media } = require(root + "/backend/media.cjs");
const dir = fs.mkdtempSync(
  path.join(require("node:os").tmpdir(), "seedstar-cta-effects-"),
);
function run(args) {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", ...args], {
    windowsHide: true,
    timeout: 20000,
    maxBuffer: 4e6,
  });
  assert.equal(r.status, 0, r.stderr?.toString());
  return r.stdout;
}
run([
  "-y",
  "-f",
  "lavfi",
  "-i",
  "color=black:s=160x120:r=30:d=2",
  "-c:v",
  "libx264",
  path.join(dir, "source.mp4"),
]);
run([
  "-y",
  "-f",
  "lavfi",
  "-i",
  "color=red:s=64x32",
  "-frames:v",
  "1",
  path.join(dir, "mark.png"),
]);
function redness(file, time) {
  const buf = run([
    "-ss",
    String(time),
    "-i",
    file,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "pipe:1",
  ]);
  let total = 0;
  for (let i = 0; i < buf.length; i += 3)
    total += Math.max(0, buf[i] - Math.max(buf[i + 1], buf[i + 2]));
  return total;
}
(async () => {
  const cases = [
    ["static", "縮頭", "無"],
    ["fade", "淡入", "0.3 秒"],
    ["pop", "彈出", "0.5 秒"],
  ];
  const evidence = [];
  for (const [name, appear, fade] of cases) {
    const file = path.join(dir, name + ".mp4");
    await media(
      {
        operation: "cta",
        references: { src: { url: "source" }, ctaImage: { url: "mark" } },
        settings: {
          ctaAppear: appear,
          ctaFade: fade,
          出現: 0.2,
          消失: 1.5,
          不透明度: 100,
          overlayWidth: 64,
        },
      },
      {
        file: (id) =>
          path.join(dir, id === "source" ? "source.mp4" : "mark.png"),
        output: () => ({ file, url: "/" + name + ".mp4" }),
      },
    );
    let pixels = {
      before: redness(file, 0.1),
      start: redness(file, 0.2333),
      middle: redness(file, 0.8),
      end: redness(file, 1.4667),
      after: redness(file, 1.7),
    };
    assert(pixels.before < 1000 && pixels.after < 1000, JSON.stringify(pixels));
    assert(pixels.middle > 200000, JSON.stringify(pixels));
    if (name !== "static")
      assert(
        pixels.start < pixels.middle / 2 && pixels.end < pixels.middle / 2,
        JSON.stringify(pixels),
      );
    evidence.push({ name, pixels });
    console.log("PASS CTA " + name + " real FFmpeg frames and timing");
  }
  await assert.rejects(
    media(
      {
        operation: "cta",
        references: { src: { url: "source" }, ctaImage: { url: "mark" } },
        settings: { ctaAppear: "invalid" },
      },
      {
        file: (id) =>
          path.join(dir, id === "source" ? "source.mp4" : "mark.png"),
        output: () => {
          throw Error("Must validate before output");
        },
      },
    ),
    /CTA 動畫選項無效/,
  );
  for (const ctaFade of ["constructor", "toString", "__proto__"]) {
    await assert.rejects(
      media(
        {
          operation: "cta",
          references: { src: { url: "source" }, ctaImage: { url: "mark" } },
          settings: { ctaFade },
        },
        {
          file: (id) =>
            path.join(dir, id === "source" ? "source.mp4" : "mark.png"),
          output: () => {
            throw Error("Invalid settings reached output");
          },
        },
      ),
      /CTA 動畫選項無效/,
    );
  }
  console.log("PASS CTA 拒絕無效及原型鍵設定");
  fs.writeFileSync(
    path.join(dir, "pixels.json"),
    JSON.stringify(evidence, null, 2),
  );
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
