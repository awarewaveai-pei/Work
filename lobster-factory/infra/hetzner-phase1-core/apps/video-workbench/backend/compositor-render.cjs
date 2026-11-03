// Card P3: the server half of a compositor render. The page draws every frame with shared/compositor.js (the same
// function as its preview) and streams PNG frames here in order; finish assembles a MOV with the PNG codec
// (lossless, keeps alpha), ingests it into the media store and verifies it (duration, fps, size, alpha).
// Sessions live in memory and in <dataDir>/compositor/<id>/; a restart drops them (the page must stay open).
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { run } = require("./media.cjs"),
  { verifyOutput, inspectMedia } = require("./media-inspect.cjs");

const MAX_FRAMES = 36000,
  MAX_SIDE = 3840,
  RATES = new Set(["24/1", "25/1", "30/1", "60/1", "24000/1001", "30000/1001", "60000/1001"]);
const PNG = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const bad = (message) => Object.assign(Error(message), { status: 400 });

function png(data) {
  const m = PNG.exec(String(data || ""));
  const buffer = m && Buffer.from(m[1], "base64");
  if (!buffer || buffer.length < 33 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw bad("影格必須是 PNG");
  return buffer;
}
// Origin sent by the page; only these fields, only these types (plan invariant 2).
function origin(input, extra = {}) {
  const ids = Array.isArray(input?.sourceAssetIds) ? input.sourceAssetIds.filter((v) => typeof v === "string" && v).slice(0, 200) : [];
  if (typeof input?.compositionId !== "string" || !input.compositionId) throw bad("缺少合成 id");
  if (!Number.isInteger(input.compositionRevision) || input.compositionRevision < 0) throw bad("缺少合成版本");
  return {
    kind: "render",
    engine: "workbench-compositor",
    compositionId: input.compositionId.slice(0, 100),
    compositionRevision: input.compositionRevision,
    ...(typeof input.parentAssetId === "string" && input.parentAssetId ? { parentAssetId: input.parentAssetId } : {}),
    sourceAssetIds: [...new Set(ids)],
    ...extra,
  };
}

// Size limits (bytes): one /frames request (the page batches by this; api.cjs caps a body at 80 MB), one decoded
// PNG frame, and everything one session may store. idleMs: a session with no frames/finish for this long is dropped
// (an abandoned page must not hold one of the slots forever). Overridable for tests and small hosts.
const LIMITS = { requestBytes: 24 * 1024 * 1024, frameBytes: 48 * 1024 * 1024, sessionBytes: 20 * 1024 * 1024 * 1024, idleMs: 120000, slots: 4 };
function createCompositorRenders({ dataDir, mediaStore, output, limits = {}, now = Date.now }) {
  const L = { ...LIMITS, ...Object.fromEntries(Object.entries(limits).filter(([, v]) => Number.isFinite(v) && v > 0)) };
  const root = path.join(dataDir, "compositor");
  fs.rmSync(root, { recursive: true, force: true }); // sessions never survive a restart
  fs.mkdirSync(root, { recursive: true });
  const sessions = new Map();
  function sweep() {
    for (const s of [...sessions.values()]) if (!s.finishing && now() - s.touched > L.idleMs) drop(s);
  }
  setInterval(sweep, Math.min(L.idleMs, 30000)).unref();
  const get = (id) => {
    sweep();
    const s = sessions.get(id);
    if (!s) throw Object.assign(Error("找不到輸出工作，可能已取消、閒置逾時或服務已重啟"), { status: 404 });
    s.touched = now();
    return s;
  };
  const drop = (s) => {
    sessions.delete(s.id);
    fs.rmSync(s.dir, { recursive: true, force: true });
  };
  function create(input) {
    const width = Number(input?.width), height = Number(input?.height), frames = Number(input?.frames);
    const rate = `${input?.fps?.num}/${input?.fps?.den}`;
    if (![width, height].every((n) => Number.isInteger(n) && n >= 16 && n <= MAX_SIDE)) throw bad("畫面尺寸無效");
    if (width % 2 || height % 2) throw bad("畫面寬高需為偶數");
    if (!Number.isInteger(frames) || frames < 1 || frames > MAX_FRAMES) throw bad("影格數無效");
    if (!RATES.has(rate)) throw bad("不支援的影格率");
    sweep();
    if (sessions.size >= L.slots) throw Object.assign(Error("同時輸出的合成太多，請稍後再試"), { status: 429 });
    const id = crypto.randomUUID(), dir = path.join(root, id);
    fs.mkdirSync(dir);
    sessions.set(id, { id, dir, width, height, frames, fps: { num: input.fps.num, den: input.fps.den }, received: 0, bytes: 0, touched: now(), finishing: false });
    return { id, limits: { requestBytes: L.requestBytes, frameBytes: L.frameBytes, idleMs: L.idleMs } };
  }
  // Frames arrive in order: start must equal the count already stored, so a resent chunk cannot skip or double.
  function frames(id, input) {
    const s = get(id), list = Array.isArray(input?.frames) ? input.frames : [];
    if (input?.start !== s.received) throw Object.assign(Error(`影格順序不符：應從第 ${s.received} 格開始`), { status: 409 });
    if (!list.length || s.received + list.length > s.frames) throw bad("影格數超出範圍");
    const buffers = list.map((data, i) => {
      const buffer = png(data);
      if (buffer.length > L.frameBytes) throw Object.assign(Error(`第 ${s.received + i} 格 PNG 為 ${(buffer.length / 1048576).toFixed(1)} MB，超過單格上限 ${(L.frameBytes / 1048576).toFixed(0)} MB`), { status: 413 });
      return buffer;
    });
    const added = buffers.reduce((n, b) => n + b.length, 0);
    if (s.bytes + added > L.sessionBytes) {
      drop(s);
      throw Object.assign(Error(`輸出總量超過上限 ${(L.sessionBytes / 1073741824).toFixed(0)} GB，已停止`), { status: 413 });
    }
    buffers.forEach((buffer, i) => fs.writeFileSync(path.join(s.dir, String(s.received + i).padStart(6, "0") + ".png"), buffer));
    s.received += list.length;
    s.bytes += added;
    return { received: s.received };
  }
  async function finish(id, input) {
    const s = get(id);
    if (s.received !== s.frames) throw bad(`尚缺影格：已收 ${s.received}／${s.frames}`);
    const made = origin(input);
    s.finishing = true;
    sessions.delete(id);
    const mov = path.join(s.dir, "render.mov");
    try {
      await run(["-y", "-hide_banner", "-framerate", `${s.fps.num}/${s.fps.den}`, "-i", path.join(s.dir, "%06d.png"), "-c:v", "png", "-pix_fmt", "rgba", "-r", `${s.fps.num}/${s.fps.den}`, mov]);
      const expect = { duration: (s.frames * s.fps.den) / s.fps.num, fps: s.fps, width: s.width, height: s.height, audio: false };
      const stored = await mediaStore.ingest({ file: mov, ext: "mov" }),
        file = mediaStore.fileFor(stored.url),
        verification = await verifyOutput(file, expect);
      const probe = await inspectMedia(file);
      // Alpha must survive: a MOV without an alpha pixel format would come back to the timeline as a black box.
      if (!/^(rgba|bgra|argb|abgr|yuva|gbrap|ya)/.test(probe.probe.pixFmt || ""))
        verification.findings.push({ code: "video.no_alpha", message: "輸出沒有透明通道（" + probe.probe.pixFmt + "）", evidence: { pixFmt: probe.probe.pixFmt } });
      verification.ok = verification.findings.length === 0;
      delete verification.info;
      if (!verification.ok) throw Object.assign(Error("輸出驗證失敗：" + verification.findings.map((f) => f.message).join("；")), { status: 500 });
      return {
        ...stored,
        kind: "video",
        type: "video/quicktime",
        width: s.width,
        height: s.height,
        duration: expect.duration,
        frames: s.frames,
        verification,
        origin: made,
      };
    } finally {
      fs.rmSync(s.dir, { recursive: true, force: true });
    }
  }
  function cancel(id) {
    const s = sessions.get(id);
    if (s) drop(s);
    return { cancelled: true };
  }
  // S3b: one frame as a PNG reference image (the generation pages pick it like any library image).
  function still(input) {
    const buffer = png(input?.data);
    if (!Number.isInteger(input?.frame) || input.frame < 0) throw bad("缺少影格編號");
    return {
      id: crypto.randomUUID(),
      kind: "image",
      type: "image/png",
      url: output(buffer, "png"),
      size: buffer.length,
      origin: origin(input, { frame: input.frame }),
    };
  }
  // Card P4: a character pose drawn by shared/rig.js as a PNG (pose image -> the character's generation references).
  function poseStill(input) {
    const buffer = png(input?.data), id = (k) => (typeof input?.[k] === "string" && input[k] ? input[k].slice(0, 100) : null);
    for (const k of ["characterId", "rigId", "poseId"]) if (!id(k)) throw bad("缺少 " + k);
    if (!Number.isInteger(input.rigVersion) || input.rigVersion < 1) throw bad("缺少綁定版本");
    return {
      id: crypto.randomUUID(),
      kind: "image",
      type: "image/png",
      url: output(buffer, "png"),
      size: buffer.length,
      origin: { kind: "render", engine: "workbench-rig", characterId: id("characterId"), rigId: id("rigId"), rigVersion: input.rigVersion, poseId: id("poseId") },
    };
  }
  return { create, frames, finish, cancel, still, poseStill, sweep, sessions: () => sessions.size };
}
module.exports = { createCompositorRenders, LIMITS };
