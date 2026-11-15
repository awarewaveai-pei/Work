// Card VD.4: the paid AI cover. The model gets the best frame WITHOUT its title and a whole-frame mask in each vendor's
// form, is told to write no text, and the title is drawn by ffmpeg on what comes back; the cover is the video's size,
// <= 2 MB, and nothing temporary is left. Network-free: the image-edit row is a stub (the vendor calls are image-edit.cjs's).
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { run, regionMasks } = require("../backend/media.cjs"),
  { fontDir } = require("../backend/editor-export.cjs"),
  { makeAiCover, exportFor, PROMPT } = require("../backend/cover-ai.cjs"),
  { MAX_BYTES } = require("../backend/cover.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-cover-ai-"));
const video = path.join(dir, "v.mp4");
assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "smptebars=size=640x360:rate=10", "-t", "4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", video], { windowsHide: true }).status, 0);
const size = (file) => /(\d{2,5})x(\d{2,5})/.exec(spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8", windowsHide: true }).stderr).slice(1).map(Number);
const exportJob = (title) => ({ id: "e1", status: "succeeded", input: { operation: "editor-export", settings: { project: { title } } }, result: { url: "/media/x/original.mp4", width: 640, height: 360, covers: [{ url: "/generated/a.jpg", kind: "auto", at: 2 }] } });

(async () => {
  // exportFor: only a finished export with its free covers can get an AI cover
  assert.throws(() => exportFor([], "nope"), /找不到可以做封面的成片/);
  assert.throws(() => exportFor([{ ...exportJob(""), status: "running" }], "e1"), /找不到/);
  assert.throws(() => exportFor([{ ...exportJob(""), result: { ...exportJob("").result, covers: [] } }], "e1"), /找不到/);
  assert.equal(exportFor([exportJob("")], "e1").id, "e1");
  assert.match(PROMPT, /Do not add any text/);

  const seen = [];
  const imageEdit = { run: async (model, args) => {
    seen.push({ model, args });
    // the vendor answers with a plain picture of its own size (here a blue 1024x576 PNG)
    const out = path.join(dir, "vendor.png");
    assert.equal(spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", "color=c=0x3050a0:s=1024x576", "-frames:v", "1", out], { windowsHide: true }).status, 0);
    return { image: fs.readFileSync(out), costUsd: 0.057 };
  } };
  const made = await makeAiCover({ exportJob: exportJob("封面標題"), model: { value: "nano-banana-2" }, size: "1K", env: {}, dir, videoFile: video }, { imageEdit, run, regionMasks, fontDir });
  assert.equal(made.costUsd, 0.057);
  assert.deepEqual(size(made.file), [640, 360], "the cover is the video's own size");
  assert.ok(fs.statSync(made.file).size <= MAX_BYTES);
  const sent = seen[0].args;
  assert.equal(sent.prompt, PROMPT);
  assert.equal(sent.image.subarray(1, 4).toString(), "PNG");
  assert.ok(sent.masks.alpha && sent.masks.black && sent.masks.white, "the whole-frame mask in all three vendor forms");
  assert.ok(Math.abs(sent.ratio - 16 / 9) < 0.01);

  // the title is drawn on the AI picture (same vendor picture without a title differs)
  const plain = await makeAiCover({ exportJob: exportJob(""), model: { value: "nano-banana-2" }, size: "1K", env: {}, dir, videoFile: video }, { imageEdit, run, regionMasks, fontDir });
  assert.notEqual(fs.readFileSync(made.file).toString("base64"), fs.readFileSync(plain.file).toString("base64"), "title drawn");

  // Codex ccdf770d F1: the vendor answered (billed), then the local title step fails -> the cost was reported first, so
  // the caller can still charge it once; nothing is left behind.
  const vendorDone = [];
  const failingRun = async (args, signal) => { if (/cover\.jpg$/.test(args[args.length - 1])) throw Error("媒體處理失敗：title"); return run(args, signal); };
  await assert.rejects(makeAiCover({ exportJob: exportJob("t"), model: { value: "nano-banana-2" }, size: "1K", env: {}, dir, videoFile: video, onVendorDone: (usd) => vendorDone.push(usd) },
    { imageEdit, run: failingRun, regionMasks, fontDir }), /title/);
  assert.deepEqual(vendorDone, [0.057]);

  // a vendor failure leaves nothing behind (and reports no vendor completion)
  const failing = { run: async () => { throw Error("圖片編輯失敗：Google 500"); } };
  for (const f of [made.file, plain.file, path.join(dir, "vendor.png")]) fs.rmSync(f, { force: true });
  const none = [];
  await assert.rejects(makeAiCover({ exportJob: exportJob("t"), model: { value: "x" }, size: "1K", env: {}, dir, videoFile: video, onVendorDone: (u) => none.push(u) }, { imageEdit: failing, run, regionMasks, fontDir }), /Google 500/);
  assert.deepEqual(none, []);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith("cover-ai-")), []);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("cover-ai: ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
