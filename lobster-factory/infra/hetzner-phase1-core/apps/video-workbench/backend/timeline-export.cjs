// Card M3 (plan §3 invariant 5): editor project -> MediaTimelineV1, the main system's interchange contract. The
// contract is imported from next-admin (plan §0: import it, never copy it); Node strips its types on import.
// The mapping is lossy by design: every value V1 cannot hold becomes one entry in losses[], nothing is dropped silently.
const path = require("node:path"),
  { pathToFileURL } = require("node:url"),
  Timebase = require("../shared/timebase.js"),
  ProjectEnvelope = require("../shared/project-envelope.js");
const contractFile = path.join(__dirname, "../../next-admin/lib/content/video/timeline-v1.ts");
let contract = null;
const loadContract = () => (contract ||= import(pathToFileURL(contractFile).href));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const profiles = { "16:9": "landscape_16_9", "9:16": "vertical_9_16", "1:1": "square_1_1", "4:5": "square_4_5" };
const transitions = { 融接: "fade", 淡入淡出: "fade", 向左擦除: "slide_left", 向右擦除: "slide_right" };
// Clip fields with no V1 equivalent: [field, default, applies to].
const unsupported = [
  ["speed", 1, ["video", "image", "audio"]],
  ["volume", 1, ["video", "audio"]],
  ["fadeIn", 0, ["video", "audio"]],
  ["fadeOut", 0, ["video", "audio"]],
  ["opacity", 1, ["video", "image", "text"]],
  ["scale", 1, ["video", "image", "text"]],
  ["rotation", 0, ["video", "image", "text"]],
  ["filter", "原始", ["video", "image"]],
  ["mask", "無", ["video", "image"]],
  ["grain", 0, ["video", "image"]],
  ["background", undefined, ["video", "image"]],
  ["transitionDuration", undefined, ["video", "image"]],
  ["transitionCurve", undefined, ["video", "image"]],
  ["font", "思源黑體", ["text"]],
  ["fontSize", undefined, ["text"]],
  ["color", "#ffffff", ["text"]],
  ["backgroundColor", null, ["text"]],
  ["bold", false, ["text"]],
  ["italic", false, ["text"]],
  ["align", "置中", ["text"]],
  ["animation", "無", ["text"]],
];
const itemId = (prefix, id) => (prefix + String(id)).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 128);

async function exportTimelineV1(raw, { organizationId, styleRef } = {}) {
  const { validateMediaTimelineV1, MEDIA_TIMELINE_V1_FRAME_RATES } = await loadContract();
  const project = ProjectEnvelope.unwrap(raw).native;
  if (!project || !Array.isArray(project.clips)) throw Object.assign(Error("剪輯專案格式無效"), { status: 400 });
  if (project.clips.some((c) => !Number.isSafeInteger(c?.startFrame) || !Number.isSafeInteger(c?.durationFrames)))
    throw Object.assign(Error("剪輯專案缺少影格時間"), { status: 400 });
  if (!Timebase.find(project.timebase)) throw Object.assign(Error("剪輯專案影格率無效"), { status: 400 });
  const tb = Timebase.check(project.timebase),
    losses = [],
    loss = (field, value, message, clipId) => losses.push({ ...(clipId ? { clipId } : {}), field, value, message });
  const exact = tb.den === 1 && MEDIA_TIMELINE_V1_FRAME_RATES.includes(tb.num),
    frameRate = exact
      ? tb.num
      : MEDIA_TIMELINE_V1_FRAME_RATES.reduce((best, rate) =>
          Math.abs(rate - Timebase.fps(tb)) < Math.abs(best - Timebase.fps(tb)) ? rate : best,
        );
  if (!exact) loss("frameRate", Timebase.ffRate(tb), `Timeline v1 只收 ${MEDIA_TIMELINE_V1_FRAME_RATES.join("／")} fps，改用 ${frameRate}`);
  // V1 times are integer ms on its frame grid ((ms*fps)%1000===0, timeline-v1.ts:52): step = 1000/gcd(1000,fps).
  const gcd = (a, b) => (b ? gcd(b, a % b) : a),
    step = 1000 / gcd(1000, frameRate),
    ms = (frames) => Math.round((Timebase.toSeconds(frames, tb) * 1000) / step) * step;
  const outputProfile = profiles[project.ratio];
  if (!outputProfile) loss("ratio", project.ratio, "Timeline v1 沒有此比例，改用 landscape_16_9");
  if (project.filter && project.filter !== "原始") loss("filter", project.filter, "Timeline v1 沒有專案濾鏡");
  for (const [id, track] of Object.entries(project.tracks || {})) {
    if (track?.muted) loss("track.muted", id, "Timeline v1 沒有軌道靜音");
    if (track?.normalize) loss("track.normalize", id, "Timeline v1 沒有音量均衡");
    if (track?.volume !== undefined && Number(track.volume) !== 1) loss("track.volume", track.volume, "Timeline v1 沒有軌道音量");
  }
  const artifacts = [],
    tracks = { V1: [], V2: [], A1: [], A2: [], T: [] },
    sorted = [...project.clips].sort((a, b) => a.startFrame - b.startFrame);
  for (const clip of sorted) {
    const kind = clip.kind;
    if (clip.hidden || project.tracks?.[clip.track]?.hidden) {
      loss("hidden", true, "隱藏的片段不輸出", clip.id);
      continue;
    }
    for (const [field, fallback, kinds] of unsupported)
      if (kinds.includes(kind) && clip[field] !== undefined && clip[field] !== fallback && !(field === "background" && clip[field] === "黑色"))
        loss(field, clip[field], "Timeline v1 沒有此欄位", clip.id);
    if (kind !== "text" && clip.muted) loss("muted", true, "Timeline v1 沒有片段靜音", clip.id);
    const startMs = ms(clip.startFrame),
      endMs = ms(clip.startFrame + clip.durationFrames),
      sourceStartMs = ms(clip.sourceStartFrame || 0);
    if (Math.abs(startMs - Timebase.toSeconds(clip.startFrame, tb) * 1000) > 0.5 || Math.abs(endMs - Timebase.toSeconds(clip.startFrame + clip.durationFrames, tb) * 1000) > 0.5)
      loss("time", { startFrame: clip.startFrame, durationFrames: clip.durationFrames }, `時間量化到 ${step} ms 格線：${startMs}–${endMs} ms`, clip.id);
    if (kind === "video" && Math.abs(sourceStartMs - Timebase.toSeconds(clip.sourceStartFrame || 0, tb) * 1000) > 0.5)
      loss("sourceStart", clip.sourceStartFrame || 0, `來源起點量化到 ${step} ms 格線：${sourceStartMs} ms`, clip.id);
    if (endMs <= startMs) {
      loss("duration", clip.durationFrames, "片段短於 Timeline v1 一格，不輸出", clip.id);
      continue;
    }
    if (kind === "text") {
      if (clip.track === "T" && (clip.x !== undefined && clip.x !== 50 || clip.y !== undefined && clip.y !== 80))
        loss("position", { x: clip.x, y: clip.y }, "Timeline v1 字幕沒有位置", clip.id);
      tracks.T.push({ id: itemId("c_", clip.id), startMs, endMs, text: String(clip.text || ""), sourceTranscriptSegmentIds: [itemId("seg_", clip.id)] });
      continue;
    }
    const assetId = clip.asset?.id;
    if (typeof assetId !== "string" || !UUID.test(assetId)) {
      loss("asset", assetId ?? clip.asset?.url ?? null, "素材不是 media_assets uuid，Timeline v1 無法引用，片段不輸出", clip.id);
      continue;
    }
    if (!artifacts.includes(assetId)) artifacts.push(assetId);
    if (clip.track === "V2" && (clip.x !== 80 || clip.y !== 80 || clip.width !== 25))
      loss("position", { x: clip.x, y: clip.y, width: clip.width }, "Timeline v1 沒有疊加位置與大小", clip.id);
    else if (clip.track === "V1" && ((clip.x || 0) !== 0 || (clip.y || 0) !== 0))
      loss("position", { x: clip.x, y: clip.y }, "Timeline v1 沒有畫面位移", clip.id);
    if (clip.track === "A1" || clip.track === "A2") {
      if (clip.sourceStartFrame) loss("sourceStart", clip.sourceStartFrame, "Timeline v1 音訊沒有來源起點", clip.id);
      tracks[clip.track].push({ id: itemId("c_", clip.id), startMs, durationMs: endMs - startMs, sourceArtifactId: assetId });
      continue;
    }
    const origin = clip.asset?.origin?.kind;
    tracks[clip.track].push({
      id: itemId("c_", clip.id),
      startMs,
      durationMs: endMs - startMs,
      sourceArtifactId: assetId,
      ...(kind === "video" ? { sourceStartMs } : {}),
      crop: clip.fit === "裁切" ? "cover" : "contain",
      transitionOut: "cut",
      provenance: origin === "ai_generated" || origin === "render" ? "generated" : "footage",
    });
  }
  // The editor stores a transition on the incoming V1 clip; V1 stores it as transitionOut on the outgoing item.
  const mainClips = sorted.filter((c) => c.track === "V1" && !c.hidden);
  for (const clip of mainClips) {
    if (!clip.transition || clip.transition === "無") continue;
    const previous = tracks.V1[tracks.V1.findIndex((item) => item.id === itemId("c_", clip.id)) - 1];
    if (!previous || !transitions[clip.transition]) loss("transition", clip.transition, "Timeline v1 沒有此轉場", clip.id);
    else previous.transitionOut = transitions[clip.transition];
  }
  if (tracks.T.length) loss("captions.transcript", tracks.T.length, "文字片段沒有轉錄來源，sourceTranscriptSegmentIds 以片段 ID 代填");
  if (!styleRef) {
    styleRef = artifacts[0];
    loss("styleRef", null, "工作台沒有風格資產，以第一個來源素材代填");
  }
  const timeline = {
    schemaVersion: "1.0.0",
    timelineId: "tl_" + (UUID.test(project.id || "") ? project.id : require("node:crypto").randomUUID()),
    organizationId,
    purpose: "footage_edit",
    frameRate,
    outputProfiles: [outputProfile || "landscape_16_9"],
    tracks: Object.entries(tracks)
      .filter(([, items]) => items.length)
      .map(([id, items]) => ({ id, kind: id === "T" ? "caption" : id.startsWith("A") ? "audio" : "video", items })),
    styleRef,
    provenance: { capabilityVersions: { "workbench.editor": ProjectEnvelope.ENGINE_VERSION }, sourceArtifacts: artifacts },
  };
  // Workbench asset ids are local uuids, not media_assets rows yet: the timeline validates but the main system
  // cannot resolve them until card P6 maps local assets to media_assets (Codex 2026-11-02).
  if (artifacts.length) loss("sourceArtifactId", artifacts, "素材 ID 是工作台本機 ID，主系統要等 P6 對應到 media_assets 才能渲染");
  return { timeline, validation: validateMediaTimelineV1(timeline), losses };
}
module.exports = { exportTimelineV1 };
