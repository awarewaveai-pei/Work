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
const rates = require(path.join(require("../backend/appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/ai/cost-model.ts"));
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
    const u = new URL(url);
    if (u.origin + u.pathname !== "http://whisper.test:8421/v1/transcribe") throw Error("未預期的網路請求：" + url);
    assert.equal(options.headers.Authorization, "Bearer worker-test");
    const bytes = Buffer.from(options.body), saved = path.join(dir, `sent-${calls.length}.mp3`);
    fs.writeFileSync(saved, bytes);
    calls.push({ language: u.searchParams.get("language"), traditional: u.searchParams.get("traditional"), bytes: bytes.length, saved });
    return Response.json(answer(calls.length - 1));
  };
  return { calls, fetchImpl };
}
async function serve(fetchImpl, extraEnv = {}) {
  const server = createServer({ dataDir, env: { VW_TRANSCRIBE_WORKER_URL: "http://whisper.test:8421/", VW_TRANSCRIBE_WORKER_TOKEN: "worker-test", ...extraEnv }, fetchImpl });
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

  // 1b. The host worker's answer (apps/video-whisper-worker /v1/transcribe; numbers from the 2026-11-10 A/B run on ks-aw-01,
  // English pieces already joined by its merge_words) reads the same way.
  const hostAnswer = {
    model: "large-v3", backend: "cpu/int8 x8", language: "zh", duration: 25.4,
    segments: [{ id: 0, start: 0, end: 3.48, text: "這次的Workshop,我們會用Premiere Pro跟DaVinci Resolve做比較。", avg_logprob: -0.1305, no_speech_prob: 0.02, compression_ratio: 1.1 }],
    words: [["這", 0, 0.22], ["次", 0.22, 0.34], ["的", 0.34, 0.44], ["Workshop,", 0.44, 0.84], ["我們", 0.9, 1.08], ["Premiere", 1.44, 1.78], [" Pro", 1.78, 1.94]].map(([word, start, end]) => ({ word, start, end, probability: 0.9 })),
  };
  const h = transcribe.normalize(hostAnswer);
  assert.deepEqual([h.language, h.segments.length, h.segments[0].score, h.segments[0].needsReview], ["zh", 1, 0.97, false]);
  assert.deepEqual(h.words.map((w) => [w.text, w.start, w.end]), [["這", 0, 0.22], ["次", 0.22, 0.34], ["的", 0.34, 0.44], ["Workshop,", 0.44, 0.84], ["我們", 0.9, 1.08], ["Premiere", 1.44, 1.78], ["Pro", 1.78, 1.94]]);
  assert.equal(h.segments[0].words.length, 7);
  pass("主機 whisper 回覆轉成 normalize() 格式：逐字起訖、句分數、字歸句");

  // 1c. Gemini Transcribe (words only, "0.100s" offsets, UTF-8 byte indexes into the text, punctuation only in the text):
  // sentences cut at 。 and at a pause over 1 s; no confidence = every sentence 需校對.
  const geminiText = "大家好。今天 test";
  const g = transcribe.normalize(transcribe.fromGemini({ usage: { total_input_tokens: 100, total_output_tokens: 20 }, steps: [{ content: [{ type: "text", text: geminiText, annotations: [
    { type: "word_info", text: "大家", start_index: 0, end_index: 6, start_offset: "0.100s", end_offset: "0.400s" },
    { type: "word_info", text: "好", start_index: 6, end_index: 9, start_offset: "0.400s", end_offset: "0.600s" },
    { type: "word_info", text: "今天", start_index: 12, end_index: 18, start_offset: "0.700s", end_offset: "1s" },
    { type: "word_info", text: "test", start_index: 19, end_index: 23, start_offset: "2.500s", end_offset: "2.800s" },
  ] }] }] }, "zh"));
  assert.deepEqual(g.segments.map((x) => [x.start, x.end, x.text, x.needsReview]), [[0.1, 0.6, "大家好。", true], [0.7, 1, "今天", true], [2.5, 2.8, "test", true]]);
  assert.deepEqual(g.words.map((w) => [w.text, w.start, w.end]), [["大家", 0.1, 0.4], ["好", 0.4, 0.6], ["今天", 0.7, 1], ["test", 2.5, 2.8]]);
  const gtr = rates.GEMINI_TRANSCRIBE_RATES["gemini-3.5-transcribe"];
  near(costs.transcribeUsd("gemini-3.5-transcribe", 60, { total_input_tokens: 1500, total_output_tokens: 175 }), (1500 * gtr.audioInPerM + 175 * gtr.textOutPerM) / 1e6, 1e-12, "Gemini 依回覆 token 計費");
  near(costs.transcribeUsd("gemini-3.5-transcribe", 60), (60 * gtr.audioTokensPerSec * gtr.audioInPerM + gtr.textTokensPerMin * gtr.textOutPerM) / 1e6, 1e-12, "沒有 usage 用官方估算");
  pass("Gemini 辨識接頭：逐字換成句（標點／停頓切）、無分數＝需校對、依回覆 token 計費");

  // 1d. The lists drop a row on its registry retireOn (whisper-1 2027-02-26, gpt-4o-mini-tts 2027-01-06): not offered,
  // and a job naming it is refused (never silently swapped).
  const speech = require("../backend/speech.cjs");
  assert.deepEqual(transcribe.capability({}, () => null, "2027-02-25").engines.map((e) => e.id), ["host", "gemini", "openai"]);
  assert.deepEqual(transcribe.capability({}, () => null, "2027-02-26").engines.map((e) => e.id), ["host", "gemini"]);
  assert.throws(() => transcribe.pick("openai", {}, "2027-02-26"), (e) => e.status === 400 && /已停止/.test(e.message));
  assert.equal(transcribe.pick("openai", {}, "2027-02-25").model, "whisper-1");
  assert.equal(transcribe.pick(undefined, { VW_TRANSCRIBE_ENGINE: "openai" }, "2027-02-26").id, "host", "預設指到已下線的列 = 用清單第一列");
  assert.deepEqual(speech.capability({}, () => null, "2027-01-05").models.map((m) => m.id), ["gemini-3.8-flash-lite-tts", "gpt-4o-mini-tts"]);
  assert.deepEqual(speech.capability({}, () => null, "2027-01-06").models.map((m) => m.id), ["gemini-3.8-flash-lite-tts"]);
  assert.throws(() => speech.pick("gpt-4o-mini-tts", {}, "2027-01-06"), (e) => e.status === 400 && /已停止/.test(e.message));
  pass("過了 retireOn 的配音／辨識選項：不在清單（頁面按鈕由清單長出）、指名送出回 400");

  // 2. Filler and pause data for ED.11.
  const marked = TranscriptWords.annotate([{ start: 0, end: 0.3, text: "嗯嗯" }, { start: 0.4, end: 1, text: "你好" }, { start: 2.5, end: 3, text: "Umm," }, { start: 3.1, end: 3.5, text: "那個" }]);
  assert.deepEqual(marked.map((w) => [w.filler, w.pauseAfter]), [[true, 0.1], [false, 1.5], [true, 0.1], [false, null]]);
  assert.deepEqual(TranscriptWords.cutRanges(marked, { maxPause: 0.5 }), [[0, 0.3], [1.25, 2.25], [2.5, 3]]);
  assert.deepEqual(TranscriptWords.cutRanges([{ start: 0, end: 1, text: "a", source: 0 }, { start: 3, end: 4, text: "b", source: 1 }], { maxPause: 0.5 }), []);
  pass("剪贅字資料：語氣詞（嗯嗯、Umm）標記、停頓秒數、不跨錄音的剪除區間");

  // 3. Single file: words:true answers word times; the old call keeps the old SRT contract (built from the worker's segments).
  const single = mockProvider(() => verbose([["嗯", 0.4, 0.6], ["大家好", 0.8, 1.5]]));
  let s = await serve(single.fetchImpl);
  const old = await s.ok("POST", "/transcriptions", { source: { url: voice, type: "audio/wav" } });
  assert.deepEqual(Object.keys(old), ["srt"]);
  assert.match(old.srt, /^1\n00:00:00,400 --> 00:00:01,600\n嗯 大家好\n$/);
  assert.deepEqual([single.calls[0].language, single.calls[0].traditional], ["", "1"], "自動偵測：不指定語言、中文寫繁體");
  const rich = await s.ok("POST", "/transcriptions", { source: { url: voice, type: "audio/wav" }, words: true, language: "繁體中文" });
  assert.deepEqual([single.calls[1].language, single.calls[1].traditional], ["zh", "1"]);
  await s.ok("POST", "/transcriptions", { source: { url: voice, type: "audio/wav" }, words: true, language: "簡體中文" });
  assert.deepEqual([single.calls[2].language, single.calls[2].traditional], ["zh", "0"], "簡體中文：不加繁體提示");
  assert.deepEqual(rich.words.map((w) => [w.start, w.end, w.text, w.filler]), [[0.4, 0.6, "嗯", true], [0.8, 1.5, "大家好", false]]);
  assert.equal(rich.segments[0].needsReview, false);
  assert.match(rich.srt, /00:00:00,400 --> 00:00:01,600/);
  await s.close();
  pass("/transcriptions（自家主機 whisper）：words:true 回逐句＋逐字＋分數；舊呼叫者照舊只拿 SRT；繁／簡提示照語言");

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
  assert.equal(quote.costUsd, 0, "自家主機辨識不計費");
  assert.equal((await s.call("POST", "/editor/transcriptions/quote", { settings: { ...settings, engine: "nope" } })).status, 400, "不在清單的辨識方式回 400");
  assert.equal((await s.call("POST", "/editor/transcriptions", { settings: { ...settings, engine: "nope" } })).status, 400, "不在清單的辨識方式不建立任務");
  assert.equal(quote.model, "host-whisper-large-v3");
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
