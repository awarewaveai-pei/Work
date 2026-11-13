// Old data: a see-through preview made silent (the former -an transcode) while its original has sound is re-made with
// sound by scripts/backfill-alpha-proxy-audio.cjs, in an org folder too; until then it still plays; a second run leaves it.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { createMediaStore } = require("../backend/media-store.cjs"),
  { inspectMedia, ffprobePath } = require("../backend/media-inspect.cjs");
const ff = (args) => {
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-v", "error", ...args], { windowsHide: true, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
};
(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-alpha-backfill-")),
    org = path.join(dataDir, "orgs", "11111111-1111-4111-8111-111111111111"),
    src = path.join(dataDir, "alpha.mov");
  ff(["-f", "lavfi", "-i", "color=c=red@0.5:s=320x180:r=24:d=2,format=rgba", "-f", "lavfi", "-i", "sine=frequency=500:d=2", "-shortest", "-c:v", "png", "-pix_fmt", "rgba", "-c:a", "aac", src]);
  const stored = await createMediaStore({ dataDir: org }).ingest({ file: src, ext: "mov" }),
    proxy = path.join(org, stored.previewUrl.slice(1));
  // Make it the old kind: the same picture without its sound (what the -an transcode wrote).
  const silent = proxy + ".old.webm";
  ff(["-i", proxy, "-map", "0:v:0", "-c:v", "copy", "-an", silent]);
  fs.renameSync(silent, proxy);
  assert.equal((await inspectMedia(proxy)).audio, false);
  const run = () => spawnSync(process.execPath, [path.join(__dirname, "../scripts/backfill-alpha-proxy-audio.cjs"), "--data", dataDir], { encoding: "utf8", windowsHide: true });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /REMADE .*proxy\.webm/);
  const after = await inspectMedia(proxy);
  assert.equal(after.audio, true, "補齊後 proxy.webm 有音軌");
  // VP9 keeps alpha as a stream tag in WebM (ffprobe reports the picture itself as yuv420p).
  const tags = spawnSync(ffprobePath(), ["-v", "error", "-show_entries", "stream=codec_name:stream_tags=alpha_mode", "-of", "compact", proxy], { encoding: "utf8", windowsHide: true }).stdout;
  assert.match(tags, /codec_name=vp9\|tag:alpha_mode=1/, "仍是透明影片");
  assert.match(tags, /codec_name=opus/);
  assert.match(run().stdout, /REMADE 0$/m, "再跑一次不重轉");
  console.log("PASS 舊的無聲透明 proxy：補齊腳本（含組織資料夾）重轉成有音軌、仍透明；重跑不動");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
