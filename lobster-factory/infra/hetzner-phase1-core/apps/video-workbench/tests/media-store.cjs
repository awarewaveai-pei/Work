// Card M1 (docs/creative-suite-plan-20261102.md §3 invariants 1/3/4): uploads land in .data/media/<sha256>/,
// probe.json is ffprobe-structured, browser-unsafe video gets an H.264 proxy, verifyOutput catches a wrong file.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), http = require("node:http");
const assert = require("node:assert/strict"), { spawnSync } = require("node:child_process"), ffmpeg = require("ffmpeg-static");
const { inspectMedia, verifyOutput } = require("../backend/media-inspect.cjs");
const { isolatedServer } = require("./isolated-server.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-media-store-"));
function make(name, args) {
  const file = path.join(dir, name);
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, file], { windowsHide: true, timeout: 60000 });
  assert.equal(r.status, 0, String(r.stderr));
  return file;
}
const tone = ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2"];
const picture = ["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=2"];
const hevc = make("phone.mov", [...picture, ...tone, "-c:v", "libx265", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1",
  "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc", "-x265-params", "log-level=error",
  "-c:a", "aac", "-shortest"]);
const h264 = make("clip.mp4", [...picture, ...tone, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]);
const wav = make("tone.wav", tone);
const h264mov = make("clip-h264.mov", [...picture, ...tone, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]);
// Every other frame dropped without retiming: header says 30 fps, the real average is 15 (Codex 2026-11-02 finding).
const vfr = make("vfr.mp4", [...picture, "-vf", "select='not(mod(n\,2))'", "-fps_mode", "vfr", "-c:v", "libx264", "-pix_fmt", "yuv420p"]);

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
(async () => {
  const { base, dataDir } = await isolatedServer("vw-media-store-");
  const media = path.join(dataDir, "media");
  const upload = async (file, type) => {
    const r = await fetch(base + "/api/vw/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: path.basename(file), data: `data:${type};base64,` + fs.readFileSync(file).toString("base64") }),
    });
    const body = await r.json();
    assert.equal(r.status, 201, JSON.stringify(body));
    return body;
  };
  const shaDirs = () => fs.readdirSync(media).filter((f) => /^[a-f0-9]{64}$/.test(f));
  const local = (url) => path.join(dataDir, ...url.slice(1).split("/"));

  const [first, second] = await Promise.all([upload(h264, "video/mp4"), upload(h264, "video/mp4")]);
  assert.deepEqual(shaDirs(), [first.checksum_sha256]);
  assert.notEqual(first.id, second.id);
  assert.equal(first.url, second.url);
  assert.deepEqual(fs.readdirSync(media).filter((f) => !/^[a-f0-9]{64}$/.test(f)), [], "temp files left in .data/media");
  pass("同一檔同時上傳兩次：一個 sha 目錄、兩個不同 id、無殘留暫存檔");

  assert.equal(first.previewUrl, first.url);
  assert.match(first.url, /^\/media\/[a-f0-9]{64}\/original\.mp4$/);
  assert.ok(!fs.existsSync(path.join(media, first.checksum_sha256, "proxy.mp4")));
  assert.ok(fs.statSync(local(first.thumbUrl)).size > 0);
  pass("H.264 yuv420p ≤1080p：無代理檔、previewUrl == url、有縮圖");

  const phone = await upload(hevc, "video/quicktime");
  assert.match(phone.url, /\/original\.mov$/);
  assert.match(phone.previewUrl, /\/proxy\.mp4$/);
  const proxy = await inspectMedia(local(phone.previewUrl));
  assert.equal(proxy.probe.videoCodec, "h264");
  assert.equal(proxy.probe.pixFmt, "yuv420p");
  assert.equal(proxy.audio, true);
  assert.equal(proxy.displayHeight, 360);
  const served = await fetch(base + phone.previewUrl);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "video/mp4");
  pass("HEVC Main10 MOV：產生 H.264 yuv420p＋AAC 代理檔可經 /media/ 取得，url 仍指原檔");

  const browser = await require("playwright").chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(base + "/");
    const played = await page.evaluate(
      (src) =>
        new Promise((resolve) => {
          const v = document.createElement("video");
          v.muted = true;
          v.onerror = () => resolve({ error: v.error?.code });
          v.onloadeddata = () => v.play().then(() => setTimeout(() => resolve({ width: v.videoWidth, time: v.currentTime }), 700), (e) => resolve({ error: String(e) }));
          v.src = src;
        }),
      phone.previewUrl,
    );
    assert.equal(played.width, 640, JSON.stringify(played));
    assert.ok(played.time > 0.2, JSON.stringify(played));
  } finally {
    await browser.close();
  }
  pass("HEVC 匯入後的預覽（代理檔）在 Edge 實際解碼播放");

  const probe = JSON.parse(fs.readFileSync(path.join(media, phone.checksum_sha256, "probe.json"), "utf8"));
  assert.deepEqual(probe.frameRate, { num: 30, den: 1 });
  assert.equal(probe.videoCodec, "hevc");
  assert.equal(probe.bitDepth, 10);
  assert.equal(probe.colorPrimaries, "bt2020");
  assert.equal(probe.colorTransfer, "arib-std-b67");
  assert.equal(probe.colorSpace, "bt2020nc");
  assert.equal(probe.audioStreams.length, 1);
  assert.deepEqual(phone.probe, probe);
  pass("probe.json：frameRate {num,den}、色彩欄位、位元深度、音軌");

  const audio = await upload(wav, "audio/wav");
  assert.equal(audio.previewUrl, audio.url);
  assert.equal(audio.thumbUrl, null);
  const wave = JSON.parse(fs.readFileSync(local(audio.waveformUrl), "utf8"));
  assert.equal(wave.peaks.length, wave.points);
  assert.ok(Math.max(...wave.peaks) > 0.1);
  pass("WAV：波形 waveform.json 有固定點數峰值、無縮圖、無代理");

  const good = await verifyOutput(h264, { duration: 2, fps: { num: 30, den: 1 }, width: 640, height: 360, audio: true });
  assert.deepEqual(good.findings, []);
  assert.equal(good.ok, true);
  const bad = await verifyOutput(h264, { duration: 3, audio: false });
  assert.equal(bad.ok, false);
  assert.equal(bad.findings.length, 2, JSON.stringify(bad.findings));
  pass("verifyOutput：正確預期 ok；錯時長與錯音軌各一條 finding");
  const uneven = await verifyOutput(vfr, { fps: 30 });
  assert.ok(uneven.findings.some((f) => f.code === "video.variable_fps"), JSON.stringify(uneven.findings) + " " + JSON.stringify(uneven.info?.probe));
  pass("verifyOutput：標示 30 fps、實際平均 15 的檔被判不固定");

  const mov = await upload(h264mov, "video/quicktime");
  assert.match(mov.url, /\/original\.mov$/);
  assert.match(mov.previewUrl, /\/proxy\.mp4$/);
  pass("H.264 MOV：容器不是 MP4 也產代理檔");

  const raw = (p) =>
    new Promise((resolve, reject) =>
      http.get(base + "/", { path: p }, (r) => (r.resume(), resolve(r.statusCode))).on("error", reject),
    );
  const sha = phone.checksum_sha256;
  for (const p of [`/media/${sha}/..%2f..%2fjobs.json`, `/media/${sha}/../../jobs.json`, `/media/${sha}/original.exe`,
    `/media/${sha}/probe.json.tmp`, `/media/${sha.slice(1)}/probe.json`, "/media/../jobs.json"])
    assert.ok([400, 404].includes(await raw(p)), p);
  assert.equal(await raw(`/media/${sha}/probe.json`), 200);
  pass("/media/ 路徑穿越與非白名單檔名回 400／404，白名單檔 200");

  console.log(`media-store: ${passed} passed`);
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
