// Card ED.10 backend: word-level recognition with scores, whole-project recognition (mix -> split -> map to timeline),
// free quote, results kept across a restart, filler/pause data for ED.11, and 逐字高亮 / 卡拉 OK burned into the export.
// The provider is a mock: no paid API is called.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static");
const { createServer } = require("../server.cjs");
const transcribe = require("../backend/transcribe.cjs"),
  TranscriptWords = require("../shared/transcript-words.js"),
  costs = require("../backend/provider-cost.cjs"),
  { run } = require("../backend/media.cjs"),
  { exportEditor } = require("../backend/editor-export.cjs"),
  { inspectMedia } = require("../backend/media-inspect.cjs");

const pass = (m) => console.log("PASS " + m);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-ed10-"));
function ff(args, binary = false) {
  const r = spawnSync(ffmpeg, ["-v", "error", "-y", ...args], { windowsHide: true, timeout: 120000, encoding: binary ? null : "utf8", maxBuffer: 256 * 1024 * 1024 });
  assert.equal(r.status, 0, String(r.stderr));
  return r.stdout;
}
const near = (a, b, tol = 0.02, what = "") => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} ≠ ${b}`);

// Fixtures in the data dir, addressed as /generated/<uuid>.<ext> like uploads.
const dataDir = path.join(dir, "data");
fs.mkdirSync(path.join(dataDir, "generated"), { recursive: true });
function fixture(ext, args) {
  const name = crypto.randomUUID() + "." + ext;
  ff([...args, path.join(dataDir, "generated", name)]);
  return "/generated/" + name;
}
const voice = fixture("wav", ["-f", "lavfi", "-i", "sine=frequency=440:duration=4"]);
const voiced = fixture("mp4", ["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=4", "-f", "lavfi", "-i", "sine=frequency=660:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest"]);
const silent = fixture("mp4", ["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=4", "-c:v", "libx264", "-preset", "ultrafast"]);

// What the mock "provider" answers: words at fixed times in whatever file it is sent.
const verbose = (list) => { const words = list.map(([word, start, end]) => ({ word, start, end })); return {
  language: "chinese",
  duration: 5,
  segments: [
    { start: 0.4, end: 1.6, text: "嗯 大家好", avg_logprob: -0.1, compression_ratio: 1.2, no_speech_prob: 0.01 },
    { start: 2.4, end: 3.7, text: "今天", avg_logprob: -1.6, compression_ratio: 1.2, no_speech_prob: 0.01 },
  ].filter((s) => words.some((w) => w.start >= s.start && w.end <= s.end)),
  words,
}; };
function mockProvider(answer) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    if (!url.endsWith("/audio/transcriptions")) throw Error("未預期的網路請求：" + url);
    const form = options.body, file = form.get("file");
    const bytes = Buffer.from(await file.arrayBuffer()), saved = path.join(dir, `sent-${calls.length}.mp3`);
    fs.writeFileSync(saved, bytes);
    calls.push({ format: form.get("response_format"), granularities: form.getAll("timestamp_granularities[]"), language: form.get("language"), bytes: bytes.length, saved });
    return form.get("response_format") === "srt" ? new Response("1\n00:00:00,000 --> 00:00:00,500\n你好\n") : Response.json(answer(calls.length - 1));
  };
  return { calls, fetchImpl };
}
async function serve(fetchImpl, extraEnv = {}) {
  const server = createServer({ dataDir, env: { OPENAI_API_KEY: "test-only", ...extraEnv }, fetchImpl });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port + "/api/vw";
  const call = async (method, route, data) => {
    const r = await fetch(base + route, { method, headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: r.status, value: await r.json() };
  };
  const ok = async (method, route, data) => {
    const r = await call(method, route, data);
    assert.ok(r.status < 300, route + " " + JSON.stringify(r.value));
    return r.value;
  };
  const poll = async (job) => {
    for (let i = 0; i < 400; i++) {
      const v = await ok("GET", "/generations/" + job.id);
      if (["succeeded", "failed", "cancelled"].includes(v.status)) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("任務逾時");
  };
  return { server, call, ok, poll, close: () => new Promise((r) => server.close(r)) };
}

(async () => {
  // 1. Score and word format (pure).
  const n = transcribe.normalize(verbose([["嗯", 0.4, 0.6], ["大家好", 0.8, 1.5], ["今天", 2.5, 3.0]]));
  assert.deepEqual(n.segments.map((s) => [s.score, s.needsReview]), [[0.98, false], [0.68, true]]);
  assert.deepEqual(n.segments[0].words.map((w) => w.text), ["嗯", "大家好"]);
  assert.equal(transcribe.scoreOf({ avg_logprob: -0.1, compression_ratio: 2.6 }), 0.5);
  assert.match(transcribe.toSrt(n.segments), /^1\n00:00:00,400 --> 00:00:01,600\n嗯 大家好\n\n2\n00:00:02,400 --> 00:00:03,700\n今天\n$/);
  pass("逐字結果：每句有起訖、文字、分數；分數 < 0.8 標需校對；字歸到所屬句；SRT 由句組成");

  // 2. Filler and pause data for ED.11.
  const marked = TranscriptWords.annotate([{ start: 0, end: 0.3, text: "嗯嗯" }, { start: 0.4, end: 1, text: "你好" }, { start: 2.5, end: 3, text: "Umm," }, { start: 3.1, end: 3.5, text: "那個" }]);
  assert.deepEqual(marked.map((w) => [w.filler, w.pauseAfter]), [[true, 0.1], [false, 1.5], [true, 0.1], [false, null]]);
  assert.deepEqual(TranscriptWords.cutRanges(marked, { maxPause: 0.5 }), [[0, 0.3], [1.25, 2.25], [2.5, 3]]);
  assert.deepEqual(TranscriptWords.cutRanges([{ start: 0, end: 1, text: "a", source: 0 }, { start: 3, end: 4, text: "b", source: 1 }], { maxPause: 0.5 }), []);
  pass("剪贅字資料：語氣詞（嗯嗯、Umm）標記、停頓秒數、不跨錄音的剪除區間");

  // 3. Single file: words:true asks for word times; the old call keeps the old SRT contract.
  const single = mockProvider(() => verbose([["嗯", 0.4, 0.6], ["大家好", 0.8, 1.5]]));
  let s = await serve(single.fetchImpl);
  const old = await s.ok("POST", "/transcriptions", { source: { url: voice, type: "audio/wav" } });
  assert.deepEqual(Object.keys(old), ["srt"]);
  assert.equal(single.calls[0].format, "srt");
  const rich = await s.ok("POST", "/transcriptions", { source: { url: voice, type: "audio/wav" }, words: true, language: "繁體中文" });
  assert.deepEqual([single.calls[1].format, single.calls[1].granularities, single.calls[1].language], ["verbose_json", ["word", "segment"], "zh"]);
  assert.deepEqual(rich.words.map((w) => [w.start, w.end, w.text, w.filler]), [[0.4, 0.6, "嗯", true], [0.8, 1.5, "大家好", false]]);
  assert.equal(rich.segments[0].needsReview, false);
  assert.match(rich.srt, /00:00:00,400 --> 00:00:01,600/);
  await s.close();
  pass("/transcriptions：words:true 回逐句＋逐字＋分數；舊呼叫者照舊只拿 SRT");

  // 4. Whole project: V1 0–2 s (source 1–3 s of a video with sound), A1 10–13 s (narration), a silent V1 clip skipped.
  const settings = {
    projectId: "p-ed10", language: "繁體中文",
    segments: [
      { url: voiced, sourceStart: 1, duration: 2, start: 0, track: "V1", clipId: "v1" },
      { url: silent, sourceStart: 0, duration: 2, start: 4, track: "V1", clipId: "mute" },
      { url: voiced, sourceStart: 0, duration: 2, start: 20, track: "V1", clipId: "muted", muted: true },
      { url: voice, sourceStart: 0, duration: 1, start: 30, track: "A1", clipId: "zero", volume: 0 },
      { url: voice, sourceStart: 0, duration: 3, start: 10, track: "A1", clipId: "a1" },
    ],
  };
  // Mixed file = 2 s + 1 s gap + 3 s = 6 s. File 0.4 → 0.4; 今天 = file 2.5–3.6, middle 3.05 is in the A1 stretch, so its
  // start (in the gap) is clamped to that stretch: 10.0–10.6.
  const whole = mockProvider(() => verbose([["嗯", 0.4, 0.6], ["大家好", 0.8, 1.5], ["今天", 2.5, 3.6]]));
  s = await serve(whole.fetchImpl);
  const quote = await s.ok("POST", "/editor/transcriptions/quote", { settings });
  assert.deepEqual([quote.seconds, quote.segments, quote.chunks, quote.skipped.map((k) => k.clipId)], [6, 2, 1, ["mute", "muted", "zero"]]);
  assert.deepEqual(quote.skipped.map((k) => k.reason), ["沒有聲音", "已靜音", "已靜音"]);
  near(quote.costUsd, costs.transcribeUsd("whisper-1", 6), 1e-9, "估價");
  assert.equal(whole.calls.length, 0);
  assert.deepEqual((await s.ok("GET", "/editor/transcriptions?projectId=p-ed10")).results, []);
  pass("整片估價：不呼叫供應商、不建立任務；跳過無聲與靜音（同匯出規則）片段；秒數＝有聲段＋段間 1 秒");

  const job = await s.poll(await s.ok("POST", "/editor/transcriptions", { settings, idempotencyKey: "ed10-k1" }));
  assert.equal(job.status, "succeeded", job.error);
  assert.equal(whole.calls.length, 1);
  near((await inspectMedia(whole.calls[0].saved)).duration, 6, 0.1, "合成音訊長度");
  assert.equal(job.result.origin.costUsd, quote.costUsd);
  assert.equal((await s.ok("POST", "/editor/transcriptions", { settings, idempotencyKey: "ed10-k1" })).id, job.id);
  const t = await s.ok("GET", "/editor/transcriptions/" + job.id);
  assert.deepEqual(t.words.map((w) => [w.text, w.start, w.end, w.track, w.filler]), [["嗯", 0.4, 0.6, "V1", true], ["大家好", 0.8, 1.5, "V1", false], ["今天", 10, 10.6, "A1", false]]);
  assert.deepEqual(t.segments.map((x) => [x.start, x.end, x.needsReview]), [[0.4, 1.6, false], [10, 10.7, true]]);
  await s.close();
  pass("整片辨識：伺服器合成一段 6 秒音訊、結果換成時間軸時間、扣費＝估價、同一 idempotencyKey 不重複送");

  // 5. Results survive a restart (= reopening the page) and the job history limit pruning the job record (simulated by
  // removing it from jobs.json): listed by project, words fetched by job id.
  const ledger = path.join(dataDir, "jobs.json");
  fs.writeFileSync(ledger, JSON.stringify(JSON.parse(fs.readFileSync(ledger, "utf8")).filter((j) => j.id !== job.id)));
  s = await serve(whole.fetchImpl);
  const listed = await s.ok("GET", "/editor/transcriptions?projectId=p-ed10");
  assert.deepEqual(listed.results.map((r) => [r.jobId, r.segmentCount, r.wordCount, r.reviewCount]), [[job.id, 2, 3, 1]]);
  assert.equal((await s.ok("GET", "/editor/transcriptions/" + job.id)).words.length, 3);
  assert.equal((await s.call("GET", "/editor/transcriptions/" + crypto.randomUUID())).status, 404);
  assert.deepEqual((await s.ok("GET", "/editor/transcriptions?projectId=other")).results, []);
  await s.close();
  pass("找回已完成的字幕結果：重開伺服器、任務紀錄被清掉後仍依專案列出、可取回逐字；不存在回 404");

  // 6. Over the upload limit: split in the silence between the two stretches, each part mapped by its own offset.
  const parts = mockProvider(() => verbose([["嗯", 0.4, 0.6]]));
  s = await serve(parts.fetchImpl, { VW_TRANSCRIBE_CHUNK_BYTES: "20000" });
  const split = await s.poll(await s.ok("POST", "/editor/transcriptions", { settings: { ...settings, projectId: "p-split" } }));
  assert.equal(split.status, "succeeded", split.error);
  assert.equal(parts.calls.length, 2);
  assert.ok(parts.calls.every((c) => c.bytes <= 20000), JSON.stringify(parts.calls.map((c) => c.bytes)));
  near((await inspectMedia(parts.calls[0].saved)).duration, 2.5, 0.1, "第一段長度");
  const splitWords = (await s.ok("GET", "/editor/transcriptions/" + split.id)).words;
  assert.deepEqual(splitWords.map((w) => [w.start, w.track]), [[0.4, "V1"], [10, "A1"]]);
  assert.equal(split.result.chunks, 2);
  await s.close();
  pass("超過上傳上限：在段間靜音處分兩段辨識，每段時間各自換回時間軸");

  // 7. 卡拉 OK / 逐字高亮 burned into the export (frames sampled).
  const black = path.join(dir, "black.mp4");
  ff(["-f", "lavfi", "-i", "color=c=black:s=640x360:r=30:d=2", "-c:v", "libx264", "-preset", "ultrafast", black]);
  let k = 0;
  const render = async (text, extra) => {
    const output = (ext) => ({ file: path.join(dir, `out-${++k}.${ext}`), url: `out-${k}.${ext}` });
    const result = await exportEditor({
      timebase: { num: 30, den: 1 }, ratio: "16:9",
      clips: [
        { id: "bg", kind: "video", track: "V1", asset: { url: "black.mp4" }, startFrame: 0, durationFrames: 60 },
        { id: "sub", kind: "text", track: "T", text, startFrame: 0, durationFrames: 60, fontSize: 120, x: 50, y: 50, ...extra },
      ],
    }, { file: (u) => path.join(dir, u), output, signal: undefined, run }, "720p");
    return path.join(dir, result.url);
  };
  const frame = (file, index, crop) => ff(["-i", file, "-vf", `select=eq(n\\,${index}),crop=${crop}`, "-vsync", "0", "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], true);
  const count = (buf) => {
    let yellow = 0, white = 0;
    for (let i = 0; i < buf.length; i += 3) {
      if (buf[i] > 180 && buf[i + 1] > 150 && buf[i + 2] < 100) yellow++;
      else if (buf[i] > 200 && buf[i + 1] > 200 && buf[i + 2] > 200) white++;
    }
    return { yellow, white };
  };
  const words = [{ start: 0, end: 0.5, text: "AAAA" }, { start: 1, end: 1.5, text: "BBBB" }];
  const karaoke = await render("AAAA BBBB", { subtitleStyle: "卡拉 OK", words });
  const full = "1280:200:0:260";
  const [k0, k1, k2] = [2, 24, 55].map((f) => count(frame(karaoke, f, full)));
  assert.ok(k0.yellow < k1.yellow && k1.yellow < k2.yellow && k0.white > k2.white && k1.white > 500, JSON.stringify({ k0, k1, k2 }));
  const highlight = await render("AAAA BBBB", { subtitleStyle: "逐字高亮", words });
  const left = "640:200:0:260", right = "640:200:640:260";
  const [hl, hr, gl, gr] = [[10, left], [10, right], [40, left], [40, right]].map(([f, c]) => count(frame(highlight, f, c)).yellow);
  assert.ok(hl > 500 && hr < 50 && gl < 50 && gr > 500, JSON.stringify({ hl, hr, gl, gr }));
  // A word whose text holds a newline stays on one ASS line (a raw newline would end the Dialogue and drop the rest).
  const { validateProject, subtitleEvents } = require("../backend/editor-export.cjs");
  const odd = validateProject({ timebase: { num: 30, den: 1 }, ratio: "16:9", clips: [
    { id: "bg", kind: "video", track: "V1", asset: { url: "black.mp4" }, startFrame: 0, durationFrames: 60 },
    { id: "sub", kind: "text", track: "T", text: "he llo world", startFrame: 0, durationFrames: 60, subtitleStyle: "卡拉 OK", words: [{ start: 0, end: 0.5, text: "he\nllo" }, { start: 0.6, end: 1, text: "world" }] },
  ] }, "720p").clips.find((c) => c.id === "sub");
  const oddEvents = subtitleEvents(odd);
  assert.ok(oddEvents.length === 1 && !/[\r\n]/.test(oddEvents[0].text) && /\\kf/.test(oddEvents[0].text), JSON.stringify(oddEvents));
  const stale = await render("AAAA CCCC", { subtitleStyle: "逐字高亮", words });
  const plain = count(frame(stale, 10, full));
  assert.ok(plain.yellow < 50 && plain.white > 1000, JSON.stringify(plain));
  pass("輸出：卡拉 OK 依逐字時間由白變黃；逐字高亮只亮當下那個字；文字改過（逐字對不上）照一般樣式");
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
