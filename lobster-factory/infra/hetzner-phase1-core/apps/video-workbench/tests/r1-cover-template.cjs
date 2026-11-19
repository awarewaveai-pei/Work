// Card R1: the cover title is drawn by the remotion-service cover template (backend/remotion.cjs coverStill ->
// backend/cover.cjs titledJpeg). Covers: the request the service gets; a failing, unset or slow service falls back to
// the ASS title once (never no cover, never one retry per frame); a stop is not a fallback; an already chosen cover
// stays chosen when new covers arrive (next-admin lib/content/video/cover.ts, unchanged). Pure node, no network.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { pathToFileURL } = require("node:url"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { run } = require("../backend/media.cjs"),
  { fontDir } = require("../backend/editor-export.cjs"),
  { autoCovers, titledJpeg, MAX_BYTES } = require("../backend/cover.cjs"),
  remotion = require("../backend/remotion.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-r1-cover-"));
const make = (name, args) => {
  const file = path.join(dir, name);
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", ...args, file], { windowsHide: true });
  assert.equal(r.status, 0, String(r.stderr));
  return file;
};
const size = (file) => /(\d{2,5})x(\d{2,5})/.exec(spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8", windowsHide: true }).stderr).slice(1).map(Number);
const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8;
const video = make("bars.mp4", ["-f", "lavfi", "-i", "smptebars=size=640x360:rate=10", "-t", "6", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"]);
// What the service sends back: a 1920x1080 JPEG (the 16x9 render size), a different picture from the video.
const rendered = fs.readFileSync(make("rendered.jpg", ["-f", "lavfi", "-i", "color=c=red:s=1920x1080", "-frames:v", "1"]));
const base = { file: video, duration: 6, width: 640, height: 360, title: "封面標題 Cover", dir };

(async () => {
  // 1. The request: the frame as a data: URI, the title, the format key of the video's ratio; 9:16 / 4:5 too.
  const frame = fs.readFileSync(make("frame.jpg", ["-f", "lavfi", "-i", "testsrc2=size=64x36", "-frames:v", "1"]));
  const body = remotion.coverRequest({ frame, title: "  失眠\n怎麼辦  ", subtitle: "", width: 1280, height: 720 });
  assert.deepEqual({ ...body, props: { ...body.props, backgroundUrl: body.props.backgroundUrl.slice(0, 23) } },
    { templateId: "cover", props: { backgroundUrl: "data:image/jpeg;base64,", title: "失眠 怎麼辦" }, outputFormat: "16x9", fps: 30, durationInFrames: 1 });
  assert.deepEqual(Buffer.from(body.props.backgroundUrl.split(",")[1], "base64"), frame);
  assert.equal(remotion.coverRequest({ frame, title: "t", subtitle: "副標", width: 720, height: 1280 }).outputFormat, "9x16");
  assert.equal(remotion.coverRequest({ frame, title: "t", width: 864, height: 1080 }).props.subtitle, undefined);
  assert.equal(remotion.coverRequest({ frame, title: "t", width: 864, height: 1080 }).outputFormat, "4x5");
  assert.throws(() => remotion.coverRequest({ frame, title: "t", width: 1440, height: 1080 }), /不支援這個畫面比例/);
  assert.throws(() => remotion.coverRequest({ frame, title: " ", width: 1280, height: 720 }), /需要標題/);

  // 2. coverStill against a fake service: POST /render with the token, poll, download the JPEG; a failed render names 封面.
  const SERVICE = "https://remotion.test", env = { REMOTION_SERVICE_URL: SERVICE, MEDIA_RENDER_AUTH_TOKEN: "tok-r1" },
    appDir = path.join(__dirname, "../../next-admin");
  const fake = (status) => {
    const calls = [];
    return { calls, fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (url === SERVICE + "/render") return Response.json({ jobId: "c1" });
      if (url === SERVICE + "/status/c1") return Response.json(status);
      if (url === "https://r2.test/c1.jpg") return new Response(rendered, { status: 200 });
      throw Error("unexpected fetch " + url);
    } };
  };
  const ok = fake({ status: "done", url: "https://r2.test/c1.jpg" });
  const bytes = await remotion.coverStill({ frame, title: "標題", width: 1280, height: 720 }, { env, appDir, fetchImpl: ok.fetchImpl, signal: AbortSignal.timeout(5000), pollMs: 10 });
  assert.deepEqual(bytes, rendered);
  assert.equal(ok.calls[0].init.headers["X-Render-Token"], "tok-r1");
  assert.equal(JSON.parse(ok.calls[0].init.body).templateId, "cover");
  const bad = fake({ status: "error", error: "Chromium crashed" });
  await assert.rejects(remotion.coverStill({ frame, title: "標題", width: 1280, height: 720 }, { env, appDir, fetchImpl: bad.fetchImpl, signal: AbortSignal.timeout(5000), pollMs: 10 }), /^Error: 封面模板渲染失敗：Chromium crashed/);

  // 3. With the template: every candidate is the template's picture, scaled to the video's own size, <= 2 MB; the
  // template got the frame (a JPEG) and the title.
  const seen = [];
  const template = async (c) => (seen.push(c), rendered);
  const made = await autoCovers({ ...base, templateMs: 60000 }, { run, fontDir, template });
  assert.ok(made.length >= 1);
  for (const c of made) {
    assert.equal(c.by, "template");
    assert.deepEqual(size(c.file), [640, 360]);
    assert.ok(fs.statSync(c.file).size <= MAX_BYTES);
  }
  assert.equal(seen.length, made.length);
  assert.ok(seen.every((c) => isJpeg(c.frame) && c.title === "封面標題 Cover" && c.width === 640 && c.height === 360));

  // 4. The service fails: the ASS title is drawn instead, the reason is reported once, and the service is asked once.
  let asked = 0;
  const reasons = [];
  const fallback = await autoCovers({ ...base, templateMs: 60000 }, { run, fontDir, template: async () => (asked++, Promise.reject(Error("無法連線到封面模板服務"))), onFallback: (e) => reasons.push(e.message) });
  assert.ok(fallback.length >= 2, "every candidate still made");
  assert.ok(fallback.every((c) => c.by === "ass"));
  assert.deepEqual([asked, reasons], [1, ["無法連線到封面模板服務"]]);

  // 5. Too slow: stopped at templateMs (named in words), the covers still come with the ASS title.
  const slow = [];
  const t0 = Date.now(), alive = setInterval(() => {}, 1000); // AbortSignal.timeout's timer does not hold the process
  const late = await autoCovers({ ...base, count: 1, templateMs: 300 }, { run, fontDir,
    template: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
    onFallback: (e) => slow.push(e.message) });
  clearInterval(alive);
  assert.ok(Date.now() - t0 < 20000);
  assert.deepEqual([late.length, late[0].by, slow], [1, "ass", ["封面模板在時限內沒有完成"]]);

  // 5b. The window covers the frame extraction too (Codex c8a06699 F1): a slow extraction ends the template step, the
  // ASS cover still comes, the template is never asked.
  const slowRun = async (args, sig) => {
    if (/\.frame\.jpg$/.test(args[args.length - 1])) await new Promise((res, rej) => { const t = setTimeout(res, 5000); sig?.addEventListener("abort", () => (clearTimeout(t), rej(sig.reason)), { once: true }); });
    return run(args, sig);
  };
  let slowAsked = 0;
  const slowFrame = [];
  const hold = setInterval(() => {}, 1000);
  const viaAss = await autoCovers({ ...base, count: 1, templateMs: 300 }, { run: slowRun, fontDir, template: async () => (slowAsked++, rendered), onFallback: (e) => slowFrame.push(e.message) });
  clearInterval(hold);
  assert.deepEqual([viaAss.length, viaAss[0].by, slowAsked, slowFrame], [1, "ass", 0, ["封面模板在時限內沒有完成"]]);

  // 5c. The paid AI cover's template window ends 15 s before its job's deadline, at most 60 s from now (Codex b1a86dfd F1).
  const { templateUntil } = require("../backend/cover-ai.cjs"), now0 = Date.parse("2026-11-19T00:00:00Z"), at = (s) => new Date(now0 + s * 1000).toISOString();
  assert.equal(templateUntil(at(600), now0), now0 + 60000);
  assert.equal(templateUntil(at(20), now0), now0 + 5000);
  assert.ok(templateUntil(at(10), now0) < now0, "under 15 s left: no template at all");
  assert.equal(templateUntil(undefined, now0), now0 + 60000);

  // 6. No title: the template is not asked (nothing to lay out). No template given (service not set up): the ASS path.
  let untitled = 0;
  assert.ok((await autoCovers({ ...base, title: "", count: 1, templateMs: 60000 }, { run, fontDir, template: async () => (untitled++, rendered) }))[0].by === "ass");
  assert.equal(untitled, 0);
  const unset = [];
  assert.equal((await autoCovers({ ...base, templateMs: 60000 }, { run, fontDir, onFallback: (e) => unset.push(e.message) }))[0].by, "ass");
  assert.deepEqual(unset, ["封面模板服務未設定"], "said once, not per frame");
  // The same rule for the one paid AI cover's title (backend/cover-ai.cjs uses titledJpeg): unset is reported too.
  const aiOut = path.join(dir, "ai.jpg"), aiNote = [];
  assert.equal(await titledJpeg({ input: path.join(dir, "rendered.jpg"), width: 640, height: 360, title: "標題", out: aiOut, assFile: path.join(dir, "ai.ass"), until: Date.now() + 60000 },
    { run, fontDir, onFallback: (e) => aiNote.push(e.message) }), "ass");
  assert.deepEqual(aiNote, ["封面模板服務未設定"]);

  // 7. A stop (cancel / the cover budget) while the template runs is a stop, not a fallback: nothing is left behind.
  const stopDir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-r1-stop-")), stop = new AbortController();
  let fellBack = false;
  await assert.rejects(autoCovers({ ...base, dir: stopDir, templateMs: 60000, signal: stop.signal }, { run, fontDir,
    template: () => (stop.abort(Error("cancelled")), Promise.reject(Error("aborted"))), onFallback: () => (fellBack = true) }));
  assert.equal(fellBack, false);
  assert.deepEqual(fs.readdirSync(stopDir), [], "no frame, template or cover file left after a stop");

  // 8. Already chosen covers stay chosen when the template's covers are registered after them (VD.3 rule, unchanged):
  // new rows are later auto covers without chosenAt.
  const { coversOf } = await import(pathToFileURL(path.join(appDir, "lib/content/video/cover.ts")).href);
  const row = (id, created, extra = {}) => ({ id, object_url: "https://x/" + id + ".jpg", mime_type: "image/jpeg", created_at: created, metadata: { coverOf: "v1", coverKind: "auto", ...extra } });
  const old = [row("old-0", "2026-11-18T00:00:00Z"), row("old-1", "2026-11-18T00:00:01Z", { chosenAt: "2026-11-18T01:00:00Z" })],
    fresh = [row("new-0", "2026-11-19T00:00:00Z"), row("new-1", "2026-11-19T00:00:01Z")];
  assert.equal(coversOf("v1", [...old, ...fresh]).find((c) => c.chosen).id, "old-1", "a chosen cover is kept");
  assert.equal(coversOf("v1", [old[0], ...fresh]).find((c) => c.chosen).id, "old-0", "none chosen: the oldest auto cover, not a new one");

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(stopDir, { recursive: true, force: true });
  console.log("r1-cover-template: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
