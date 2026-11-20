// Card R2 item 11: transitions are one module (next-admin public/editor-shared/transitions.js). (1) No other source file
// writes a transition name -- the workbench's pages and server and, where the repo is present, the main system's app
// and lib (tests excepted). (2) The six choices, the old names read as the new ones, and what video-service gets (the
// FFmpeg xfade name). (3) Old data: an episode intro saved as crossfade / fade-black reads as 溶解 / 黑場 and still renders.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.join(__dirname, "..");
const { Transitions, bookendTransition } = require("../backend/transitions.cjs");
const EpisodeSpine = require("../shared/episode-spine.js");

// (1) one list
// every name the module knows -- its ids and labels (card R4: built from the catalogue, so a new kind is guarded too), the
// old names and video-service's old names
const known = [...new Set([...Transitions.CATALOG.flatMap((t) => [t.id, t.label]), ...Object.keys(Transitions.LEGACY), "fade-black"])]
  // words that also mean something else here: 無／none (nothing), 淡入淡出 (a text animation), distance (a compositor field)
  .filter((n) => !["無", "none", "淡入淡出", "distance"].includes(n))
  .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const NAMES = new RegExp("[\"'`](" + known + ")[\"'`]"),
  KEYS = new RegExp("(^|[{,\\s])(" + known + ")\\s*:"); // an object key is a list too
const walk = (dir, exts) => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const f = path.join(dir, e.name);
  if (e.isDirectory()) return /^(node_modules|__tests__|tests|\.next)$/.test(e.name) ? [] : walk(f, exts);
  return exts.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name) ? [f] : [];
});
const na = path.join(root, "../next-admin");
const files = [
  path.join(root, "server.cjs"),
  ...["scripts", "shared", "backend", "pages"].flatMap((d) => walk(path.join(root, d), /\.(c?js|html)$/)),
  // the main system's video and content code (its design tools use words like "radial" for their own things)
  ...["lib/content", "lib/social", "app/video", "app/api/internal/video", "app/api/content", "app/api/video", "app/(shell)/tools/content", "app/(shell)/tools/video", "components/tools"]
    .flatMap((d) => walk(path.join(na, d), /\.(ts|tsx|js)$/)),
];
assert.ok(files.length > 50, "scanned " + files.length);
const found = [];
for (const f of files)
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (NAMES.test(line) || KEYS.test(line)) found.push(path.relative(root, f) + ":" + (i + 1) + "  " + line.trim().slice(0, 120));
  });
assert.deepEqual(found, [], "transition names written outside public/editor-shared/transitions.js:\n" + found.join("\n"));

// (2) the module
assert.deepEqual(Transitions.LIST.map((t) => t.id).slice(0, 3), ["無", "溶解", "黑場"]);
assert.ok(["向左擦除", "向右擦除", "圓形展開"].every((id) => Transitions.LIST.some((t) => t.id === id)), "the six before card R4 are still offered");
assert.deepEqual(Transitions.LIST.map((t) => t.note).slice(1, 3), ["＝交叉淡化", "＝淡黑"]);
for (const [old, now] of [["crossfade", "溶解"], ["fade-black", "黑場"], ["none", "無"], ["融接", "溶解"], ["淡入淡出", "黑場"], ["圓形裁切", "圓形展開"], [undefined, "無"], ["向左推移", "向左推移"], ["nope", null]])
  assert.equal(Transitions.name(old), now, String(old));
assert.deepEqual(["無", "溶解", "黑場", "向左擦除", "向右擦除", "圓形展開", "pixelize"].map((id) => Transitions.wire(id)), ["none", "fade", "fadeblack", "wipeleft", "wiperight", "circleopen", "pixelize"]);
assert.deepEqual(Transitions.PICKER.map(([, id]) => id), Transitions.LIST.slice(1).map((t) => t.id));
const esc = (s) => String(s);
const html = Transitions.buttons({ label: "轉場", value: "crossfade", esc });
assert.match(html, /aria-pressed="true"[^>]*>溶解<small> ＝交叉淡化/);
assert.doesNotMatch(html, / disabled/, "every transition can be chosen everywhere");

// (3) old data and the output
const ep = { intro: { kind: "title", fields: { title: "片頭" }, seconds: 3, transition: "fade-black", transitionSeconds: 0.5 } };
assert.equal(EpisodeSpine.normalizeBookend(ep.intro).transition, "黑場");
assert.equal(EpisodeSpine.normalizeBookend({ ...ep.intro, transition: "crossfade" }).transition, "溶解");
assert.equal(EpisodeSpine.normalizeBookend({ ...ep.intro, transition: undefined }).transition, Transitions.AUTO.id);
assert.equal(bookendTransition("fade-black"), "fadeblack");
assert.equal(bookendTransition("溶解"), "fade");
assert.equal(bookendTransition(undefined), "none");
assert.equal(bookendTransition("fade"), "fade", "a wire name reads back as itself");
assert.throws(() => bookendTransition("nope"), /轉場設定無效/);
const quick = require("../backend/quick-render.cjs");
const main = { assetOf: () => "11111111-1111-4111-8111-111111111111" };
const body = (transition) => quick.request({ link: { projectId: "p1" }, settings: { ratio: "16:9", title: "t", scenes: [{ narration: "a", url: "/generated/a.png" }],
  bookends: { intro: { kind: "title", title: "片頭", seconds: 3 }, transition, transitionSeconds: 0.5 } } }, main, () => 1);
assert.equal(body("crossfade").transition, "fade", "an old saved name still renders");
assert.equal(body("黑場").transition, "fadeblack");
assert.equal(body("圓形展開").transition, "circleopen");
// (5) an outro with 無 does not need the main track to end flush (critic M1: "無" was compared to "none")
global.EditorModel = require("../shared/editor-model.js");
global.Timebase = require("../shared/timebase.js");
global.Transitions = Transitions;
const { edAddBookends } = require("../scripts/editor-export-dialog.js");
const gap = { ratio: "16:9", timebase: { num: 30, den: 1 }, tracks: [{ id: "V1", kind: "video" }, { id: "A1", kind: "audio" }],
  clips: [{ id: "main", kind: "video", track: "V1", asset: { url: "/m.mp4" }, startFrame: 0, durationFrames: 60, sourceStartFrame: 0, transition: "無" },
    { id: "music", kind: "audio", track: "A1", asset: { url: "/a.wav" }, startFrame: 0, durationFrames: 90, sourceStartFrame: 0 }] };
assert.doesNotThrow(() => edAddBookends(structuredClone(gap), { outro: { transition: "無", transitionSeconds: 0.5 } }, { outro: { url: "/o.mp4", duration: 2 } }));
assert.throws(() => edAddBookends(structuredClone(gap), { outro: { transition: "黑場", transitionSeconds: 0.5 } }, { outro: { url: "/o.mp4", duration: 2 } }), /結尾有空隙/);
console.log("PASS R2 transitions: one list (" + files.length + " files scanned), old names read, video-service gets the FFmpeg names");
