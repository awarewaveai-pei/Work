// Browser media copy, real run (card acceptance 3): the served workbench (VW_CONFIG_MODE=http) in Edge, /media answered
// 300 ms late like the EU host seen from Taiwan. The same file read a second time (new query string, then as a <video>
// after a reload) must make no request to the server. Prints the numbers. Needs Edge + node_modules (not in the gate).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process");
const { chromium } = require("playwright");
const { createServer } = require("../server.cjs");
const LATENCY = 300;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-media-cache-"));
  const clip = path.join(dir, "clip.mp4");
  const made = spawnSync(require("ffmpeg-static"), ["-y", "-hide_banner", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=6",
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", clip], { encoding: "utf8" });
  assert.equal(made.status, 0, made.stderr);
  const bytes = fs.readFileSync(clip), sha = crypto.createHash("sha256").update(bytes).digest("hex");
  fs.mkdirSync(path.join(dir, "data", "media", sha), { recursive: true });
  fs.copyFileSync(clip, path.join(dir, "data", "media", sha, "original.mp4"));
  const url = `/media/${sha}/original.mp4`;

  const server = createServer({ dataDir: path.join(dir, "data"), env: { VW_CONFIG_MODE: "http" } });
  const hits = [];
  const handlers = server.listeners("request");
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    if (req.url.startsWith("/media/")) {
      hits.push(req.url + (req.headers.range ? " " + req.headers.range : ""));
      return setTimeout(() => handlers.forEach((h) => h(req, res)), LATENCY);
    }
    handlers.forEach((h) => h(req, res));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    const page = await browser.newPage();
    await page.goto(base + "/index.html");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const timing = (u) => page.evaluate(async (u) => {
      const t0 = performance.now(), r = await fetch(u), size = (await r.arrayBuffer()).byteLength;
      const e = performance.getEntriesByName(new URL(u, location.href).href).pop();
      return { ms: Math.round(performance.now() - t0), size, cache: r.headers.get("x-vw-media-cache"), workerStart: e?.workerStart > 0, transferSize: e?.transferSize };
    }, u);
    const first = await timing(url + "?sig=first");
    const afterFirst = hits.length;
    await page.waitForTimeout(1500); // the copy is written after the page got its bytes
    const second = await timing(url + "?sig=second");
    const afterSecond = hits.length;
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const video = await page.evaluate(async (u) => {
      const v = document.createElement("video");
      v.muted = true;
      v.src = u;
      document.body.append(v);
      const t0 = performance.now();
      await new Promise((ok, fail) => { v.onloadeddata = ok; v.onerror = () => fail(Error("video error " + v.error?.code)); });
      v.currentTime = 5;
      await new Promise((ok) => (v.onseeked = ok));
      return { ms: Math.round(performance.now() - t0), duration: v.duration, readyState: v.readyState };
    }, url + "?sig=third");
    const afterVideo = hits.length;
    console.log(JSON.stringify({ bytes: bytes.length, latencyMs: LATENCY, first, second, video, serverMediaRequests: { first: afterFirst, second: afterSecond - afterFirst, videoAfterReload: afterVideo - afterSecond }, hits }, null, 1));
    assert.equal(first.size, bytes.length);
    assert.equal(afterFirst, 1, "first read = one server request");
    assert.equal(second.cache, "hit");
    assert.equal(second.size, bytes.length);
    assert.equal(afterSecond - afterFirst, 0, "second read (new query string) makes no server request");
    assert.equal(afterVideo - afterSecond, 0, "a <video> after reload plays (and seeks) from the copy");
    assert.ok(video.readyState >= 2 && video.duration > 5);
    console.log(`media-cache-browser ok: first ${first.ms} ms (server ${afterFirst} request), second ${second.ms} ms (server 0), video+seek ${video.ms} ms (server 0)`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
