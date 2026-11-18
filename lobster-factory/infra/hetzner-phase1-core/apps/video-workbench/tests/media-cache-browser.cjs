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
  const store = (seconds) => {
    const clip = path.join(dir, `clip${seconds}.mp4`);
    const made = spawnSync(require("ffmpeg-static"), ["-y", "-hide_banner", "-f", "lavfi", "-i", `testsrc2=size=1280x720:rate=30:duration=${seconds}`,
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", clip], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr);
    const bytes = fs.readFileSync(clip), sha = crypto.createHash("sha256").update(bytes).digest("hex");
    fs.mkdirSync(path.join(dir, "data", "media", sha), { recursive: true });
    fs.copyFileSync(clip, path.join(dir, "data", "media", sha, "original.mp4"));
    return { bytes, url: `/media/${sha}/original.mp4` };
  };
  const { bytes, url } = store(6), fresh = store(8); // fresh: never fetched before; its first read is a <video>

  const hits = [];
  let testOrg = null;
  const start = async (env, port = 0) => {
    const s = createServer({ dataDir: path.join(dir, "data"), env: { VW_CONFIG_MODE: "http", ...env } });
    const handlers = s.listeners("request");
    s.removeAllListeners("request");
    s.on("request", (req, res) => {
      if (req.url === "/api/vw/identity" && testOrg) {
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ scope: "scope-" + testOrg, organizationId: testOrg }));
        return;
      }
      if (req.url.startsWith("/media/")) {
        if (testOrg && req.headers["x-vw-org"] !== testOrg) {
          res.writeHead(403);
          res.end();
          return;
        }
        hits.push(req.url + (req.headers.range ? " " + req.headers.range : ""));
        return setTimeout(() => handlers.forEach((h) => h(req, res)), LATENCY);
      }
      handlers.forEach((h) => h(req, res));
    });
    await new Promise((r) => s.listen(port, "127.0.0.1", r));
    return s;
  };
  let server = await start({});
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
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
    const play = (u, seek) => page.evaluate(async ([u, seek]) => {
      const v = document.createElement("video");
      v.muted = true;
      v.preload = "auto";
      v.src = u;
      document.body.append(v);
      const t0 = performance.now();
      await new Promise((ok, fail) => { v.onloadeddata = ok; v.onerror = () => fail(Error("video error " + v.error?.code)); });
      if (seek) {
        v.currentTime = seek;
        await new Promise((ok) => (v.onseeked = ok));
      }
      return { ms: Math.round(performance.now() - t0), duration: v.duration, readyState: v.readyState };
    }, [u, seek]);
    const video = await play(url + "?sig=third", 5);
    const afterVideo = hits.length;
    // First-ever read of a file by a <video> ("bytes=0-"): one download feeds the player and the copy.
    const freshFirst = await play(fresh.url, 0);
    await page.waitForTimeout(2000);
    const freshHits = hits.filter((h) => h.startsWith(fresh.url)).length;
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const freshAgain = await play(fresh.url + "?sig=again", 7);
    const freshHitsAfter = hits.filter((h) => h.startsWith(fresh.url)).length - freshHits;
    console.log(JSON.stringify({ freshBytes: fresh.bytes.length, freshFirst, freshAgain, serverRequests: { freshFirstPlay: freshHits, freshAfterReload: freshHitsAfter } }, null, 1));
    assert.equal(freshHits, 1, "first <video> play of a new file = one server request (no background second download)");
    assert.equal(freshHitsAfter, 0, "after reload it plays and seeks from the copy");
    console.log(JSON.stringify({ bytes: bytes.length, latencyMs: LATENCY, first, second, video, serverMediaRequests: { first: afterFirst, second: afterSecond - afterFirst, videoAfterReload: afterVideo - afterSecond }, hits }, null, 1));
    assert.equal(first.size, bytes.length);
    assert.equal(afterFirst, 1, "first read = one server request");
    assert.equal(second.cache, "hit");
    assert.equal(second.size, bytes.length);
    assert.equal(afterSecond - afterFirst, 0, "second read (new query string) makes no server request");
    assert.equal(afterVideo - afterSecond, 0, "a <video> after reload plays (and seeks) from the copy");
    assert.ok(video.readyState >= 2 && video.duration > 5);
    // A real controlling worker must consult this document's pin, even for a cached file after another tab switches.
    const orgA = "11111111-1111-4111-8111-111111111111", orgB = "22222222-2222-4222-8222-222222222222";
    const client = await page.context().newPage();
    await client.goto(base + "/robots.txt"); // plain document: no workbench scripts or competing context listener
    await client.waitForFunction(() => !!navigator.serviceWorker.controller);
    await client.evaluate((organizationId) => {
      window.documentOrg = organizationId;
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.source === navigator.serviceWorker.controller && event.data?.type === "vw:document-organization")
          event.ports[0]?.postMessage({ organizationId: window.documentOrg });
      });
    }, orgA);
    const protocol = await client.evaluate(() => new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => { channel.port1.close(); resolve(event.data); };
      navigator.serviceWorker.controller.postMessage({ type: "vw:media-context", version: 1 }, [channel.port2]);
    }));
    assert.deepEqual(protocol, { type: "vw:media-context", version: 1, ok: true });
    const scopedRead = () => client.evaluate(async (u) => {
      const r = await fetch(u);
      const size = (await r.arrayBuffer()).byteLength;
      return { status: r.status, size, hit: r.headers.get("x-vw-media-cache") };
    }, url);
    testOrg = orgA;
    assert.equal((await scopedRead()).size, bytes.length);
    await client.waitForTimeout(500);
    assert.equal((await scopedRead()).hit, "hit");
    testOrg = orgB;
    assert.equal((await scopedRead()).status, 403, "old A document cannot read media under the new B cookie");
    await client.evaluate((organizationId) => { window.documentOrg = organizationId; }, orgB);
    const bRead = await scopedRead();
    assert.deepEqual([bRead.status, bRead.size, bRead.hit], [200, bytes.length, null], "new B identity does not hit A's copy");
    await client.evaluate(() => { window.documentOrg = null; });
    assert.equal((await scopedRead()).status, 503, "locked document is denied before a cache read");
    await client.close();
    testOrg = null;
    console.log("PASS 真實 Edge：新版控制 worker 握手、org header、A 副本不給 B、舊分頁 403、鎖頁 503");
    // Kill switch: <dataDir>/media-cache-off created on the running server. One reload retires the worker and deletes the copies.
    fs.writeFileSync(path.join(dir, "data", "media-cache-off"), "");
    await page.reload();
    const retired = await page.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        if (!(await navigator.serviceWorker.getRegistrations()).length && !(await indexedDB.databases()).some((d) => d.name === "vw-media-cache")) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    });
    assert.ok(retired, "one page load with media-cache-off removes the worker and the copy database within 10 s");
    await page.reload(); // the old worker still controlled the tab that triggered the update
    const off = await page.evaluate(async (u) => ({
      controller: !!navigator.serviceWorker.controller,
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      databases: (await indexedDB.databases()).map((d) => d.name),
      cache: (await fetch(u)).headers.get("x-vw-media-cache"),
    }), url + "?sig=off");
    const offHits = hits.filter((h) => h.endsWith("?sig=off")).length;
    console.log(JSON.stringify({ killSwitch: { ...off, serverRequests: offHits } }));
    assert.deepEqual([off.controller, off.registrations, off.databases.includes("vw-media-cache"), off.cache, offHits], [false, 0, false, null, 1],
      "media-cache-off: no worker, no copy database, media read from the server");
    console.log(`media-cache-browser ok: kill switch retired the worker and deleted the copies; first ${first.ms} ms (server ${afterFirst} request), second ${second.ms} ms (server 0), video+seek ${video.ms} ms (server 0); new file first <video> ${freshFirst.ms} ms (server ${freshHits}), after reload +seek ${freshAgain.ms} ms (server 0)`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
