// B25: a stock clip is checked for a frozen stretch before it goes on a shot. Pure parts (shared/stock-pick.js) + the
// measure with a fake ffmpeg; one real ffmpeg pass proves the log format the parser reads. No Pexels call, no paid call.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const P = require("../shared/stock-pick.js");
const { measure, durationOf } = require("../backend/stock-freeze.cjs");

(async () => {
  // the measure is the review's own: same freezedetect filter as video-service (a drift here = two standards)
  const server = path.join(__dirname, "../../video-service/server.py");
  if (fs.existsSync(server)) assert.ok(fs.readFileSync(server, "utf8").includes(P.FREEZE_FILTER), "freeze filter differs from video-service/server.py");

  // log -> spans: closed span, span left open (runs to the last frame), no freeze
  const log = "[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 2.5\n[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 1.5\n[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 4\n[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 8.2\n  Duration: 00:00:10.04, start: 0.000000, bitrate: 900 kb/s\n";
  assert.deepEqual(P.freezeSpans(log, 10.04), [[2.5, 4], [8.2, 10.04]]);
  assert.deepEqual(P.freezeSpans("no freeze here", 10), []);
  assert.equal(durationOf(log), 10.04);
  const rec = P.freezeRecord({ log, duration: 10.04, ms: 1234.6, now: 0 });
  assert.equal(rec.frozen, true);
  assert.equal(rec.count, 2);
  assert.equal(rec.ms, 1235);
  assert.equal(rec.filter, P.FREEZE_FILTER);
  assert.equal(P.freezeRecord({ log: "", duration: 5, ms: 1 }).frozen, false);

  // only a checked, frozen record counts; an old asset (no record) and an unchecked one never do -> flow unchanged
  assert.equal(P.isFrozen(rec), true);
  assert.equal(P.isFrozen(undefined), false);
  assert.equal(P.isFrozen(null), false);
  assert.equal(P.isFrozen({ kind: "pexels", sourceRef: "x" }.freeze), false);
  assert.equal(P.isFrozen(P.unchecked("boom", 5)), false);

  // what to ask for next: a picture never checks; video asks again, skipping the frozen ones, until 3 -> picture + reason
  assert.deepEqual(P.nextAction({ kind: "image", tried: [] }), { do: "photo" });
  assert.deepEqual(P.nextAction({ kind: "video", tried: [] }), { do: "video", exclude: [] });
  assert.deepEqual(P.nextAction({ kind: "video", tried: ["a", "b"] }), { do: "video", exclude: ["a", "b"] });
  assert.deepEqual(P.nextAction({ kind: "video", tried: ["a", "b", "c"] }), { do: "photo" });
  // the dialog's sentence follows what LANDED, not what was asked: the search answers a picture on its own once no other
  // clip is left (codex review: 1 frozen clip, then a photo from the search = "改放圖片", never only "已略過 1 支")
  assert.equal(P.resultNote({ kind: "video", tried: [], importedKind: "video" }), "");
  assert.equal(P.resultNote({ kind: "video", tried: ["a"], importedKind: "video" }), "已略過 1 支有靜止片段的影片");
  assert.match(P.resultNote({ kind: "video", tried: ["a"], importedKind: "image" }), /已略過 1 支.*改放圖片/);
  assert.match(P.resultNote({ kind: "video", tried: ["a", "b", "c"], importedKind: "image" }), /已略過 3 支.*改放圖片/);
  assert.equal(P.resultNote({ kind: "video", tried: [], importedKind: "image" }), "找不到影片，改放圖片");
  assert.equal(P.resultNote({ kind: "image", tried: [], importedKind: "image" }), "", "a picture asked for is not a swap");
  // a source that keeps answering frozen clips ends after MAX_CANDIDATES requests (the loop in projects-0.js stockShot)
  const tried = [];
  let asks = 0;
  for (let s = P.nextAction({ kind: "video", tried }); s.do === "video"; s = P.nextAction({ kind: "video", tried })) { asks++; tried.push("clip" + asks); }
  assert.equal(asks, P.MAX_CANDIDATES);

  // measure with a fake ffmpeg: frozen log -> frozen; a decode failure or a throw -> unchecked (never blocks the clip); temp file removed
  const seen = [];
  const run = (log, code = 0) => async (file) => { seen.push(file); assert.ok(fs.existsSync(file)); return { code, log }; };
  assert.equal((await measure(Buffer.from("x"), { run: run(log) })).frozen, true);
  assert.equal((await measure(Buffer.from("x"), { run: run("Duration: 00:00:05.00\n") })).frozen, false);
  const bad = await measure(Buffer.from("x"), { run: run("", 1) });
  assert.equal(bad.checked, false);
  assert.equal(P.isFrozen(bad), false);
  const thrown = await measure(Buffer.from("x"), { run: async () => { throw Error("檢查逾時"); } });
  assert.equal(thrown.checked, false);
  assert.match(thrown.reason, /逾時/);
  assert.ok(seen.every((f) => !fs.existsSync(f)), "temp file left behind");

  // one real ffmpeg pass: a moving clip passes, a still one is frozen (the log format the parser reads)
  const ffmpeg = require("ffmpeg-static");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b25-"));
  const make = (name, src) => {
    const file = path.join(dir, name);
    const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", src, "-t", "3", "-pix_fmt", "yuv420p", "-y", file]);
    assert.equal(r.status, 0, String(r.stderr));
    return fs.readFileSync(file);
  };
  try {
    const moving = await measure(make("m.mp4", "testsrc2=size=320x240:rate=25"));
    const still = await measure(make("s.mp4", "color=c=blue:size=320x240:rate=25"));
    assert.equal(moving.checked, true);
    assert.equal(moving.frozen, false, JSON.stringify(moving));
    assert.equal(still.checked, true);
    assert.equal(still.frozen, true, JSON.stringify(still));
    assert.ok(still.spans[0][0] <= 0.1 && still.spans[0][1] >= 2.9, "a whole-clip freeze spans the clip: " + JSON.stringify(still.spans));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log("PASS B25 stock clip frozen check: review's filter, candidate order, picture after 3, unchecked never blocks");
})().catch((e) => { console.error(e); process.exit(1); });
