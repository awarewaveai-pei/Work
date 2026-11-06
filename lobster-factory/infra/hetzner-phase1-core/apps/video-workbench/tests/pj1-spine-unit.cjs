// Card PJ.1 (docs/pj-project-spine-spec-20261106.md §2 PJ.1 tests, §3.3): old edit files become projects, the edit
// files themselves are never changed, and a child's stale copy cannot drop the spine fields. Node only.
const assert = require("node:assert/strict");
const Spine = require("../shared/episode-spine.js");
const Envelope = require("../shared/project-envelope.js");

const bare = { id: "bare-1", title: "舊裸專案", ratio: "9:16", clips: [{ id: "c1", start: 0, duration: 3, asset: { url: "/generated/a.mp4" } }] },
  wrapped = Envelope.wrap({ id: "env-2", title: "P2 專案", ratio: "4:5", timebase: { num: 30, den: 1 }, clips: [], tracks: [] }, { revision: 4 }),
  film = { ...Envelope.wrap({ name: "FilmCraft 文件" }, { engine: "filmcraft", engineVersion: "1" }), id: "film-3", title: "專業剪輯片", savedAt: "2026-11-06T00:00:00Z" },
  fx = { ...Envelope.wrap({}, { engine: "effectcraft", engineVersion: "1" }), id: "fx-4", title: "特效合成" },
  existing = { id: "project_1", title: "既有專案", ratio: "16:9", assets: [], episodes: [{ id: "ep1_1", name: "第 1 集", outline: "", shots: [] }] };
const editorRows = [bare, wrapped],
  engineRows = [film, fx],
  before = structuredClone({ editorRows, engineRows });

const first = Spine.adopt([existing], editorRows, engineRows);
assert.equal(first.added, 3);
assert.equal(first.projects.length, 4);
const made = first.projects.slice(1);
assert.deepEqual(
  made.map((p) => [p.title, p.ratio, p.episodes.length, p.episodes[0].edit]),
  [
    ["舊裸專案", "9:16", 1, { engine: "workbench-editor", projectId: "bare-1" }],
    ["P2 專案", "4:5", 1, { engine: "workbench-editor", projectId: "env-2" }],
    ["專業剪輯片", "16:9", 1, { engine: "filmcraft", projectId: "film-3" }],
  ],
);
assert.equal(first.projects[0], existing);
console.log("PASS 1 三筆舊內容（裸物件、P2 envelope、FilmCraft 列）各成一個專案一集，edit.projectId＝原 id；特效合成不收");

assert.equal(Spine.adopt(first.projects, editorRows, engineRows).added, 0);
console.log("PASS 2 再跑一次 added===0");

assert.deepEqual({ editorRows, engineRows }, before);
console.log("PASS 3 傳入的內容列與搬之前完全相同（原檔不改）");

const prev = structuredClone(first.projects);
prev[1].episodes[0].steps = [{ id: "j-1" }];
const stale = structuredClone(first.projects); // a child's copy from before the step was recorded
stale[1].episodes[0].outline = "子頁新打的字";
const kept = Spine.keepSpine(prev, stale);
assert.deepEqual(kept[1].episodes[0].steps, [{ id: "j-1" }]);
assert.equal(kept[1].episodes[0].outline, "子頁新打的字");
console.log("PASS 4 keepSpine：舊副本沒有的 steps 保留，子頁其他欄位照子頁");

const dropped = structuredClone(prev);
dropped[0].episodes = [];
assert.deepEqual(Spine.keepSpine(prev, dropped)[0].episodes, []);
console.log("PASS 5 keepSpine：子頁刪掉的集不復活");
