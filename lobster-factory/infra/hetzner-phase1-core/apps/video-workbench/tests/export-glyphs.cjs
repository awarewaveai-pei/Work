// Card EXP.2: a character the chosen font has no glyph for never ships as a box. libass says so at the default log
// level ("Glyph 0x… not found" = the style's font lacks it; "failed to find any fallback" = drawn as a box); the one
// ffmpeg runner (backend/media.cjs run) fails the run on either, for both burn paths: the editor export (text clips)
// and 燒錄字幕 (subtitle-burn). P6.10: 中文 in the export was boxes on the server while all four QA checks passed.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { media, run } = require("../backend/media.cjs"),
  { exportEditor } = require("../backend/editor-export.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-export-glyphs-"));
assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "color=c=0x203060:s=320x180:r=30:d=2", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:d=2",
  "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(dir, "bg.mp4")], { windowsHide: true }).status, 0);
let count = 0;
const output = (ext) => ({ file: path.join(dir, `out-${++count}.${ext}`), url: `out-${count}.${ext}` }),
  outputs = () => fs.readdirSync(dir).filter((f) => f.startsWith("out-") && f.endsWith(".mp4"));
const exportText = (text, font) =>
  exportEditor(
    {
      ratio: "16:9",
      timebase: { num: 30, den: 1 },
      clips: [
        { id: "v", kind: "video", track: "V1", asset: { url: "bg.mp4" }, startFrame: 0, durationFrames: 60 },
        { id: "t", kind: "text", track: "T", text, font, fontSize: 48, startFrame: 0, durationFrames: 60 },
      ],
    },
    { file: (url) => path.join(dir, url), output, signal: undefined, run },
    "720p",
  );

(async () => {
  // English in a Latin font: exported as before.
  const ok = await exportText("AwareWave QA", "Arial");
  assert.ok(fs.statSync(path.join(dir, ok.url)).size > 0);
  console.log("PASS 英文（Arial）照常匯出");

  // 中文 in a font without Han glyphs (Arial; on the server every font, since the image has none): refused, named.
  const before = outputs().length;
  await assert.rejects(exportText("AwareWave 全程實測", "Arial"), (e) => {
    assert.match(e.message, /沒有字形/);
    assert.match(e.message, /全/);
    return true;
  });
  assert.equal(outputs().length, before, "失敗的匯出不留下成品檔");
  console.log("PASS 中文在缺字形的字型裡：匯出失敗，訊息列出缺的字，沒有留下成品");

  // A character no font has (private use area): refused with every font and on every machine.
  await assert.rejects(exportText("測試 ", "思源黑體"), /沒有字形.*U\+E000/s);
  console.log("PASS 任何字型都沒有的字：匯出失敗");

  // 燒錄字幕 goes through the same runner.
  const src = path.join(dir, "bg.mp4");
  await assert.rejects(
    media({ operation: "subtitle-burn", references: { src: { url: "bg.mp4" } }, settings: { cues: [{ start: 0, end: 1, text: "字幕 " }] } }, { file: () => src, output, signal: undefined }),
    /沒有字形/,
  );
  console.log("PASS 燒錄字幕走同一條檢查");
  console.log("EVIDENCE " + dir);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
