const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
global.EditorModel = require("../shared/editor-model.js");
global.Timebase = require("../shared/timebase.js");
global.Transitions = require("../backend/transitions.cjs").Transitions; // the page loads it before the editor scripts
const { edAddBookends } = require("../scripts/editor-export-dialog.js");
const { validateProject, exportEditor } = require("../backend/editor-export.cjs");
const { run } = require("../backend/media.cjs");

(async () => {
  const original = { ratio: "16:9", timebase: { num: 30, den: 1 }, tracks: [{ id: "V1", kind: "video" }, { id: "A1", kind: "audio" }],
    clips: [{ id: "main", kind: "video", track: "V1", asset: { url: "/main.mp4" }, startFrame: 0, durationFrames: 60, sourceStartFrame: 0 },
      { id: "voice", kind: "audio", track: "A1", asset: { url: "/voice.wav" }, startFrame: 0, durationFrames: 60, sourceStartFrame: 0 }] };
  const before = JSON.stringify(original), ends = { intro: { transition: "crossfade", transitionSeconds: 0.5 }, outro: { transition: "fade-black", transitionSeconds: 0.5 } };
  const prepared = edAddBookends(structuredClone(original), ends, { intro: { url: "/intro.mp4", duration: 3 }, outro: { url: "/outro.mp4", duration: 2 } });
  assert.equal(JSON.stringify(original), before, "原剪輯檔必須原樣保留");
  assert.equal(prepared.clips.find((c) => c.id === "voice").startFrame, 90, "配音與主片同步後移");
  assert.equal(prepared.clips.find((c) => c.id === "main").transition, "溶解");
  assert.equal(prepared.clips.find((c) => c.bookend === "outro").transition, "黑場");
  assert.equal(validateProject(prepared).totalFrames, 210, "沿用剪輯器置中轉場的時間軸規則");
  edAddBookends(prepared, ends, { intro: { url: "/intro.mp4", duration: 3 }, outro: { url: "/outro.mp4", duration: 2 } });
  assert.equal(prepared.clips.length, 4, "已放入片頭片尾時不重複添加");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-u54-editor-title-"));
  let n = 0;
  const title = await exportEditor({ ratio: "16:9", timebase: { num: 30, den: 1 }, tracks: [{ id: "V1", kind: "video" }, { id: "T1", kind: "text" }],
    clips: [{ id: "title", kind: "text", track: "T1", text: "片頭實測", font: "思源黑體", fontSize: 64, startFrame: 0, durationFrames: 30, sourceStartFrame: 0, x: 50, y: 50, animation: "淡入淡出" }] },
    { file: (u) => path.join(dir, u), output: (ext) => { const name = `title-${++n}.${ext}`; return { file: path.join(dir, name), url: name }; }, run }, "720p");
  assert.ok(fs.statSync(path.join(dir, title.url)).size > 0);
  console.log("PASS 剪輯輸出共用片頭片尾設定、保留原專案、配音同步、既有轉場；純標題卡真實渲染成功");
})().catch((e) => { console.error(e); process.exitCode = 1; });
