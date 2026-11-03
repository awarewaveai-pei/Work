// Card P2, Codex 2026-11-02: (1) an uploaded .cube LUT url must be downloadable; (2) the editor's track cap must
// not exceed MediaTimelineV1's, so a full project still exports to V1.
const assert = require("node:assert/strict"), path = require("node:path"), { pathToFileURL } = require("node:url");
const { isolatedServer } = require("./isolated-server.cjs");
const EditorModel = require("../shared/editor-model.js");

const cube = ["LUT_3D_SIZE 2", ...[0, 1].flatMap((b) => [0, 1].flatMap((g) => [0, 1].map((r) => `${1 - r} ${g} ${b}`)))].join("\n") + "\n";

(async () => {
  const { base } = await isolatedServer("vw-p2-fixes-");
  const up = await fetch(base + "/api/vw/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "反紅.cube", data: "data:application/x-cube;base64," + Buffer.from(cube).toString("base64") }),
  });
  assert.equal(up.status, 201);
  const asset = await up.json(),
    got = await fetch(base + asset.url);
  assert.equal(got.status, 200, asset.url);
  assert.equal(await got.text(), cube);
  console.log("PASS LUT 上傳後網址可下載，內容一致");

  const { MEDIA_TIMELINE_V1_MAX_TRACKS } = await import(
    pathToFileURL(path.join(require("../backend/appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "lib/content/video/timeline-v1.ts")).href
  );
  assert.equal(EditorModel.TOTAL, MEDIA_TIMELINE_V1_MAX_TRACKS);
  let tracks = EditorModel.normalizeTracks([]);
  for (const kind of ["video", "audio", "text", "video", "audio", "video", "audio", "video", "audio", "text", "video", "audio", "text", "video", "audio", "video", "audio"])
    if (EditorModel.canAdd(tracks, kind)) tracks = [...tracks, { id: EditorModel.nextId(tracks, kind) }].map((t) => ({ ...t, id: t.id }));
  tracks = EditorModel.normalizeTracks(tracks);
  assert.equal(tracks.length, MEDIA_TIMELINE_V1_MAX_TRACKS);
  for (const kind of ["video", "audio", "text"]) assert.equal(EditorModel.canAdd(tracks, kind), false, kind);
  assert.throws(() => EditorModel.normalizeTracks([...tracks, { id: "A9" }], { strict: true }), /合計最多 16/);
  assert.equal(EditorModel.normalizeTracks([...tracks, { id: "A9" }]).length, MEDIA_TIMELINE_V1_MAX_TRACKS);
  console.log("PASS 軌道合計上限 = MediaTimelineV1 上限 16：滿了不能再加，超過的嚴格模式拒絕、寬鬆模式截斷");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
