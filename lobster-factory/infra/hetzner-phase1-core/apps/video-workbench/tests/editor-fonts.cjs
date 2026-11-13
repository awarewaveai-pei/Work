// The export's text reads the pinned font files in vendor/fonts/ (shared/editor-model.js FONTS, scripts/vendor-fonts.cjs),
// never the machine's own fonts: every font in the menu, regular and bold, with 中文 + Latin, is exported, and every face
// libass picked (its "fontselect" log lines name the face by PostScript name) must be one of the vendor/fonts files,
// which its "Loading font file" lines show it read from vendor/fonts. 中文 in Arial / Georgia goes to 思源黑體's file.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  EditorModel = require("../shared/editor-model.js"),
  { exportEditor } = require("../backend/editor-export.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-editor-fonts-")),
  fonts = path.resolve(__dirname, "..", EditorModel.FONT_DIR),
  ff = (args) => spawnSync(ffmpeg, args, { windowsHide: true, encoding: "utf8", timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
// A font file's PostScript name (OpenType name table, nameID 6; Windows UTF-16BE or Mac Roman record).
function postscriptName(file) {
  const b = fs.readFileSync(file),
    tables = b.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const at = 12 + 16 * i;
    if (b.toString("latin1", at, at + 4) !== "name") continue;
    const name = b.readUInt32BE(at + 8),
      count = b.readUInt16BE(name + 2),
      strings = name + b.readUInt16BE(name + 4);
    for (let r = 0; r < count; r++) {
      const rec = name + 6 + 12 * r,
        [platform, , , id, length, offset] = [0, 2, 4, 6, 8, 10].map((k) => b.readUInt16BE(rec + k));
      if (id !== 6) continue;
      const raw = b.subarray(strings + offset, strings + offset + length);
      return platform === 3 ? Buffer.from(raw).swap16().toString("utf16le") : raw.toString("latin1");
    }
  }
  throw Error("沒有 PostScript 名稱：" + file);
}
const faceFile = new Map(
  Object.values(EditorModel.FONTS)
    .flatMap((f) => [f.regular, f.bold])
    .map((file) => [postscriptName(path.join(fonts, file)), file]),
);
assert.equal(ff(["-y", "-hide_banner", "-f", "lavfi", "-i", "color=c=0x203060:s=640x360:r=30:d=4", "-c:v", "libx264", "-preset", "ultrafast", path.join(dir, "bg.mp4")]).status, 0);

const names = Object.keys(EditorModel.FONTS),
  faces = names.flatMap((font) => [false, true].map((bold) => ({ font, bold }))),
  project = {
    ratio: "16:9",
    timebase: { num: 30, den: 1 },
    clips: [
      { id: "v", kind: "video", track: "V1", asset: { url: "bg.mp4" }, startFrame: 0, durationFrames: 120 },
      ...faces.map(({ font, bold }, i) => ({ id: "t" + i, kind: "text", track: "T", text: "中文字幕 Aa 09", font, bold, fontSize: 48, startFrame: i * 12, durationFrames: 12 })),
    ],
  };

(async () => {
  const logs = [];
  let count = 0;
  const result = await exportEditor(
    project,
    {
      file: (url) => path.join(dir, url),
      output: (ext) => ({ file: path.join(dir, `out-${++count}.${ext}`), url: `out-${count}.${ext}` }),
      signal: undefined,
      run: async (args) => {
        const r = ff(args);
        if (r.status !== 0) throw Error(r.stderr.slice(-1500));
        logs.push(r.stderr);
        return r.stderr;
      },
    },
    "720p",
  );
  assert.ok(fs.statSync(path.join(dir, result.url)).size > 0);
  const log = logs.join("\n"),
    loaded = new Set([...log.matchAll(/Loading font file '([^']+)'/g)].map((m) => path.resolve(m[1]))),
    picks = [...log.matchAll(/fontselect: \((.+?), (\d+), \d+\) -> [^,]+, \d+, (\S+)/g)].map((m) => ({ family: m[1], weight: Number(m[2]), ps: m[3] }));
  for (const file of faceFile.values()) assert.ok(loaded.has(path.join(fonts, file)), "libass 沒有從 vendor/fonts 讀 " + file);
  assert.ok(picks.length >= faces.length, "libass 沒有 fontselect 記錄：\n" + log.slice(-2000));
  const outside = picks.filter((p) => !faceFile.has(p.ps));
  assert.deepEqual(outside, [], "輸出用了 vendor/fonts 以外的字型");
  for (const { font, bold } of faces) {
    const f = EditorModel.FONTS[font],
      hit = picks.find((p) => p.family === f.family && p.weight >= 700 === bold);
    assert.equal(hit && faceFile.get(hit.ps), bold ? f.bold : f.regular, `${font}${bold ? " 粗體" : ""}：libass 選的是 ${hit?.ps}`);
  }
  const fallbacks = picks.filter((p) => p.family === EditorModel.FONTS.思源黑體.family).length;
  console.log(`PASS 輸出的 ${faces.length} 種字面（${names.join("、")} × 一般／粗體）＋ Arial／Georgia 裡的中文，libass 全部從 vendor/fonts 讀取（${picks.length} 筆 fontselect，其中 ${fallbacks} 筆為思源黑體），沒有用到機器上的字型`);
  console.log("EVIDENCE " + dir);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
