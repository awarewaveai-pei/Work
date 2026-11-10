// Card P5: the two Blender operations of the /generations queue (history, cancel, retry, idempotencyKey as any job).
//   blender-retarget: { references: { character: {url,id}, motion: {url,id} }, settings: { boneMap, sceneId?, sceneRevision? } }
//     -> character GLB with the motion baked in, as a model asset.
//   blender-autorig (card S4b): { references: { character: {url,id} }, settings: { motion?: <library id>, turn?, landmarks?, sceneId?, sceneRevision? } }
//     -> the model with an automatic humanoid skeleton (Rigify metarig) and, with a motion, that motion baked in; result.rig
//     = { sourceAssetId, turn, landmarks, motion } so the page can correct the joints and run it again from the same mesh.
//   blender-render: { settings: { scene: <scenes3d doc>, width, height, frames, fps } }
//     -> RGBA PNG sequence (Eevee, or Cycles on a CPU-only host) -> alpha MOV through the compositor's assembleAlphaMov -> video asset.
// Inputs are copied into a per-job directory (<dataDir>/blender/<jobId>/) that is removed afterwards; the Python
// scripts only see that directory. Results carry origin {kind:"render", engine:"blender-<pin>", sceneId,
// sceneRevision, parentAssetId, sourceAssetIds} (plan invariant 2).
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const blender = require("./blender.cjs"),
  { assembleAlphaMov } = require("./compositor-render.cjs");
const { vwEnv } = require("./env-compat.cjs");

const RATES = new Set(["24/1", "25/1", "30/1", "60/1", "24000/1001", "30000/1001", "60000/1001"]);
const bad = (message) => Object.assign(Error(message), { status: 400 });
const num = (v, max = 1000) => Number.isFinite(v) && Math.abs(v) <= max;
const vec = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => num(x));
const id = (v) => (typeof v === "string" && v ? v.slice(0, 100) : undefined);

// Render time is bounded before the job starts (P6 H5: CPU-only host, Cycles ~12 s per 1080p frame at 12 cores). Budget =
// 30 s per 1080p-frame-equivalent (2.5x measured) + 2 min start; over MAX_RENDER_MS is refused, never cut off midway.
const FRAME_1080P_MS = 30000, MAX_RENDER_MS = 3 * 3600000;
const renderBudgetMs = (st) => 120000 + Math.ceil(st.frames * (st.width * st.height / (1920 * 1080)) * FRAME_1080P_MS);
const RETARGET_MS = 1800000;
// Card S4b motion library (backend/blender/motions/index.json): CMU BVH files, one bone map onto the Rigify metarig.
const MOTION_DIR = path.join(__dirname, "blender", "motions");
const library = JSON.parse(fs.readFileSync(path.join(MOTION_DIR, "index.json"), "utf8"));
const motions = library.motions.map(({ id, label }) => ({ id, label }));
const TURNS = [0, 90, 180, 270];
function motionFile(id) {
  const m = library.motions.find((x) => x.id === id);
  if (!m) throw bad("動作庫沒有這個動作");
  const file = path.join(MOTION_DIR, m.file);
  if (crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== m.sha256) throw Error("動作庫檔案與登記不符：" + m.file);
  return file;
}
function rigSettings(st = {}) {
  if (st.motion != null) motionFile(st.motion);
  if (st.turn != null && !TURNS.includes(st.turn)) throw bad("轉向只能是 0、90、180、270 度");
  const marks = st.landmarks == null ? [] : Object.entries(st.landmarks);
  if (st.landmarks != null && (typeof st.landmarks !== "object" || !marks.length || marks.length > 20 || !marks.every(([k, v]) => k.length <= 20 && vec(v)))) throw bad("關節點無效");
}

function createBlenderJobs({ dataDir, mediaStore, env }) {
  const root = path.join(dataDir, "blender");
  fs.rmSync(root, { recursive: true, force: true }); // a job dir never survives a restart
  fs.mkdirSync(root, { recursive: true });
  const modelFile = (ref, exts, what) => {
    const file = mediaStore.fileFor(ref?.url, new RegExp(`^original\\.(${exts.join("|")})$`));
    if (!file) throw bad(`${what}必須是素材庫中的 ${exts.join("／").toUpperCase()} 檔`);
    return file;
  };
  function scene(input) {
    const s = input.settings?.scene;
    if (!s || typeof s !== "object" || !id(s.id) || !Number.isInteger(s.revision) || s.revision < 1) throw bad("請先儲存 3D 場景");
    const objects = Array.isArray(s.objects) ? s.objects : [];
    if (!objects.length || objects.length > 8) throw bad("場景需要 1 到 8 個模型");
    for (const o of objects) {
      modelFile(o?.asset, ["glb"], "場景模型");
      if (!vec(o.position || [0, 0, 0]) || !num(o.rotationY ?? 0, 3600) || !(o.scale > 0 && o.scale <= 100)) throw bad("模型位置、旋轉或縮放無效");
      // poseDeltas: bone -> world rotation change [w,x,y,z] (the viewer's poseDeltas); ik: Blender IK at render time.
      const pose = Object.entries(o.poseDeltas || {});
      if (pose.length > 300 || !pose.every(([k, q]) => k.length <= 64 && Array.isArray(q) && q.length === 4 && q.every((x) => num(x, 1.01)))) throw bad("骨架姿勢無效");
      const ik = o.ik || [];
      if (!Array.isArray(ik) || ik.length > 8 || !ik.every((k) => typeof k?.bone === "string" && k.bone.length <= 64 && Number.isInteger(k.chain) && k.chain >= 1 && k.chain <= 8 && vec(k.target))) throw bad("IK 設定無效");
    }
    const keys = s.camera?.keys;
    if (!Array.isArray(keys) || !keys.length || keys.length > 100 || !keys.every((k) => Number.isInteger(k.frame) && k.frame >= 0 && vec(k.position) && vec(k.target))) throw bad("攝影機關鍵影格無效");
    if (!(s.camera.fov >= 5 && s.camera.fov <= 120)) throw bad("攝影機視角無效");
    const lights = Array.isArray(s.lights) ? s.lights : [];
    if (lights.length > 3 || !lights.every((l) => ["point", "sun", "spot"].includes(l.type) && vec(l.position) && l.intensity >= 0 && l.intensity <= 100 && /^#[0-9a-f]{6}$/i.test(l.color))) throw bad("燈光設定無效（最多 3 盞）");
    return s;
  }
  // Validates before the job is recorded (api.cjs answers 202 only after this).
  function request(input) {
    if (!blender.capability(env).available) throw Object.assign(Error("尚未安裝 3D 引擎：請執行 node scripts/vendor-blender.cjs"), { status: 503 });
    if (input.operation === "blender-retarget") {
      modelFile(input.references?.character, ["glb"], "角色");
      modelFile(input.references?.motion, ["glb", "bvh"], "動作");
      const map = input.settings?.boneMap;
      const entries = map && typeof map === "object" ? Object.entries(map) : [];
      if (!entries.length || entries.length > 200 || !entries.every(([k, v]) => typeof v === "string" && k && v && k.length <= 64 && v.length <= 64)) throw bad("骨骼對照表無效");
      return { type: "model" };
    }
    if (input.operation === "blender-autorig") {
      modelFile(input.references?.character, ["glb"], "模型");
      rigSettings(input.settings);
      return { type: "model" };
    }
    scene(input);
    const st = input.settings, rate = `${st.fps?.num}/${st.fps?.den}`;
    if (![st.width, st.height].every((n) => Number.isInteger(n) && n >= 16 && n <= 1920 && n % 2 === 0)) throw bad("輸出尺寸無效（16–1920，偶數）");
    if (!Number.isInteger(st.frames) || st.frames < 1 || st.frames > 1200) throw bad("影格數無效（1–1200）");
    if (!RATES.has(rate)) throw bad("不支援的影格率");
    if (renderBudgetMs(st) > MAX_RENDER_MS) throw bad("此 3D 片太長：請縮短秒數或降低解析度");
    return { type: "video" };
  }
  async function run(job, { signal, onProgress, onSpawn }) {
    const input = job.input, dir = path.join(root, job.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const copy = (file, name) => {
      const target = path.join(dir, name);
      fs.copyFileSync(file, target);
      return target;
    };
    try {
      if (input.operation === "blender-retarget") {
        const character = input.references.character, motion = input.references.motion;
        const motionExt = path.extname(modelFile(motion, ["glb", "bvh"], "動作")).slice(1);
        const out = await blender.runBlender({
          script: "retarget.py", workdir: dir, env, signal, onSpawn,
          onProgress: (done, total) => onProgress(Math.round((done / total) * 90)),
          args: {
            characterPath: copy(modelFile(character, ["glb"], "角色"), "character.glb"),
            motionPath: copy(modelFile(motion, ["glb", "bvh"], "動作"), "motion." + motionExt),
            boneMap: input.settings.boneMap,
            outPath: path.join(dir, "out.glb"),
          },
        });
        const stored = await mediaStore.ingest({ file: path.join(dir, "out.glb"), ext: "glb", signal });
        const sources = [character.id, motion.id].filter((v) => typeof v === "string" && v);
        return {
          ...stored, kind: "model", type: "model/gltf-binary", retarget: { bones: out.bones, frames: out.frames },
          origin: { kind: "render", engine: blender.ENGINE, operation: "retarget", ...(id(input.settings.sceneId) ? { sceneId: id(input.settings.sceneId) } : {}), ...(Number.isInteger(input.settings.sceneRevision) ? { sceneRevision: input.settings.sceneRevision } : {}), ...(id(character.id) ? { parentAssetId: character.id } : {}), sourceAssetIds: sources },
        };
      }
      if (input.operation === "blender-autorig") {
        const character = input.references.character, st = input.settings || {};
        const out = await blender.runBlender({
          script: "autorig.py", workdir: dir, env, signal, onSpawn,
          onProgress: (done, total) => onProgress(Math.round((done / total) * 90)),
          args: {
            modelPath: copy(modelFile(character, ["glb"], "模型"), "model.glb"),
            outPath: path.join(dir, "out.glb"),
            ...(st.turn != null ? { turn: st.turn } : {}),
            ...(st.landmarks ? { landmarks: st.landmarks } : {}),
            ...(st.motion ? { motionPath: copy(motionFile(st.motion), "motion.bvh"), boneMap: library.boneMap } : {}),
          },
        });
        const stored = await mediaStore.ingest({ file: path.join(dir, "out.glb"), ext: "glb", signal });
        return {
          ...stored, kind: "model", type: "model/gltf-binary",
          rig: { ...(id(character.id) ? { sourceAssetId: character.id } : {}), sourceUrl: character.url, turn: out.turn, landmarks: out.landmarks, motion: st.motion || null, bones: out.bones, weighted: out.weighted, ...(out.frames ? { frames: out.frames } : {}) },
          origin: { kind: "render", engine: blender.ENGINE, operation: "autorig", ...(st.motion ? { motion: st.motion } : {}), ...(id(st.sceneId) ? { sceneId: id(st.sceneId) } : {}), ...(Number.isInteger(st.sceneRevision) ? { sceneRevision: st.sceneRevision } : {}), ...(id(character.id) ? { parentAssetId: character.id } : {}), sourceAssetIds: [character.id].filter((v) => typeof v === "string" && v) },
        };
      }
      const s = scene(input), st = input.settings, framesDir = path.join(dir, "frames");
      await blender.runBlender({
        script: "render.py", workdir: dir, env, signal, onSpawn, timeoutMs: renderBudgetMs(st),
        onProgress: (done, total) => onProgress(Math.round((done / total) * 90)),
        args: {
          framesDir, width: st.width, height: st.height, frameCount: st.frames, fps: st.fps,
          objects: s.objects.map((o, i) => ({ modelPath: copy(modelFile(o.asset, ["glb"], "場景模型"), `model-${i}.glb`), position: o.position || [0, 0, 0], rotationY: o.rotationY || 0, scale: o.scale || 1, pose: o.poseDeltas || {}, ik: (o.ik || []).map((k) => ({ bone: k.bone, chain: k.chain, target: k.target })) })),
          camera: { fov: s.camera.fov, keys: s.camera.keys.map((k) => ({ frame: k.frame, position: k.position, target: k.target })) },
          lights: (s.lights || []).map((l) => ({ type: l.type, position: l.position, intensity: l.intensity, color: l.color })),
          ground: !!s.ground,
          // eevee needs a GPU to be fast; a CPU-only host sets VW_BLENDER_ENGINE=cycles (render.py).
          engine: vwEnv(env, "BLENDER_ENGINE") === "cycles" ? "cycles" : "eevee",
        },
      });
      const asset = await assembleAlphaMov({ dir: framesDir, frames: st.frames, fps: st.fps, width: st.width, height: st.height, mediaStore, signal });
      const sources = [...new Set(s.objects.map((o) => o.asset.id).filter((v) => typeof v === "string" && v))];
      return {
        ...asset,
        origin: { kind: "render", engine: blender.ENGINE, sceneId: id(s.id), sceneRevision: s.revision, ...(sources[0] ? { parentAssetId: sources[0] } : {}), sourceAssetIds: sources },
      };
    } finally {
      // A killed Blender on Windows can hold a frame file for a moment.
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }
  // Whole-job limit (api.cjs): the Blender budget plus 10 min for copying inputs and assembling the MOV.
  const timeoutMs = (input) => (input?.operation === "blender-render" ? renderBudgetMs(input.settings) : RETARGET_MS) + 600000;
  return { request, run, timeoutMs, claim: blender.claim, motions, operations: ["blender-retarget", "blender-render", "blender-autorig"] };
}
module.exports = { createBlenderJobs };
