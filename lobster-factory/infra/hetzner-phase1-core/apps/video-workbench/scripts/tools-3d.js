// Card P5 (handoff 3D scope: models, skeleton, camera, lights, retargeting): the 「3D」 workspace (#3d).
// Library (GLB in the media store) | viewer (scripts/viewer3d.mjs, three.js WebGL) | inspector. Scenes live in the
// server ledger (VideoWorkbench.scenes3d) with a revision and the last 20 previous revisions, like P3 compositions.
// Blender jobs (retarget, render) and Meshy image -> 3D go through the /generations queue (cancel/retry/history).
// The render is an alpha MOV that 放到剪輯時間軸 places like a composition (cpPlaceAsset). The viewer is a preview
// (預覽近似: lights, IK); the Blender render is the output. Visible buttons/inputs only, no <select>.
const t3 = {
  ready: false,
  loading: null,
  list: [],
  doc: null,
  dirty: false,
  obj: null,
  bone: null,
  frame: 0,
  status: "",
  job: null,
  viewer: null,
  canvas: null,
  loaded: new Map(),
  bones: new Map(),
  motion: null,
  boneMapText: "",
  meshyImage: null,
  meshyTexture: true,
  skeleton: false,
  projects: [],
};
const T3_FPS = [
  { num: 24, den: 1 },
  { num: 25, den: 1 },
  { num: 30, den: 1 },
];
const t3Esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const t3B = (
  label,
  action,
  { disabled = false, pressed, primary = false } = {},
) =>
  `<button type="button" class="btn small${primary ? " primary" : ""}${pressed ? " selected" : ""}" data-t3-action="${t3Esc(action)}"${pressed === undefined ? "" : ` aria-pressed="${!!pressed}"`}${disabled ? " disabled" : ""}>${t3Esc(label)}</button>`;
const t3Num = (label, field, value, { step = 0.1, min, max } = {}) =>
  `<label class="t3-num">${t3Esc(label)}<input class="text-input" type="number" aria-label="${t3Esc(label)}" data-t3-field="${t3Esc(field)}" step="${step}"${min !== undefined ? ` min="${min}"` : ""}${max !== undefined ? ` max="${max}"` : ""} value="${t3Esc(value)}"></label>`;
const t3Obj = () => t3.doc?.objects.find((o) => o.id === t3.obj) || null;
const t3Rid = () => Math.random().toString(36).slice(2, 10);
const t3Engine = () =>
  VideoWorkbench.capabilities?.blender || {
    available: false,
    install: "node scripts/vendor-blender.cjs",
  };

function t3New() {
  return {
    id: crypto.randomUUID(),
    title: "3D 場景",
    revision: 0,
    history: [],
    objects: [],
    camera: { fov: 40, keys: [] },
    lights: [
      {
        id: t3Rid(),
        type: "sun",
        position: [2, 4, 3],
        intensity: 2,
        color: "#ffffff",
      },
    ],
    ground: false,
    output: { width: 1280, height: 720, frames: 48, fps: { num: 24, den: 1 } },
  };
}
const t3Strip = (d) => {
  const { history, ...rest } = structuredClone(d);
  return rest;
};

// ---- data -------------------------------------------------------------------------------------------------
async function t3Load() {
  t3.list = await VideoWorkbench.scenes3d.list();
  t3.ready = true;
}
function t3Boot() {
  if (t3.ready || t3.loading) return t3.loading;
  t3.loading = t3Load()
    .then(() => tool === "3d" && render())
    .catch(VideoWorkbench.reportError)
    .finally(() => (t3.loading = null));
  return t3.loading;
}
function t3Open(id) {
  const found = t3.list.find((s) => s.id === id);
  if (!found) throw Error("找不到場景");
  t3.doc = structuredClone(found);
  t3.dirty = false;
  t3.obj = t3.doc.objects[0]?.id || null;
  t3.bone = null;
  t3.frame = 0;
}
// Saving = new revision; the saved copy it replaces goes to the front of history (last 20 kept).
async function t3Save() {
  const doc = t3.doc,
    saved = t3.list.find((s) => s.id === doc.id);
  const next = {
    ...t3Strip(doc),
    revision: (saved?.revision || 0) + 1,
    history: saved ? [t3Strip(saved), ...saved.history].slice(0, 20) : [],
    updatedAt: new Date().toISOString(),
  };
  await VideoWorkbench.scenes3d.save(next);
  t3.list = [...t3.list.filter((s) => s.id !== doc.id), next];
  t3.doc = structuredClone(next);
  t3.dirty = false;
  return t3.doc;
}
async function t3Restore() {
  const saved = t3.list.find((s) => s.id === t3.doc.id);
  if (!saved?.history.length) throw Error("沒有上一版");
  const [previous, ...rest] = saved.history;
  const next = {
    ...previous,
    id: saved.id,
    revision: saved.revision + 1,
    history: [t3Strip(saved), ...rest].slice(0, 20),
    updatedAt: new Date().toISOString(),
  };
  await VideoWorkbench.scenes3d.save(next);
  t3.list = [...t3.list.filter((s) => s.id !== saved.id), next];
  t3Open(saved.id);
}
const t3Touch = () => (t3.dirty = true);
async function t3Models() {
  return (await VideoWorkbench.assets.list()).filter(
    (a) => a.kind === "model" || /\.glb$/.test(a.url || ""),
  );
}

// ---- viewer -----------------------------------------------------------------------------------------------
async function t3Viewer() {
  if (t3.viewer) return t3.viewer;
  const { createViewer } = await import(
    new URL("../scripts/viewer3d.mjs", location.href).href
  );
  t3.canvas = document.createElement("canvas");
  t3.canvas.width = 960;
  t3.canvas.height = 540;
  t3.canvas.setAttribute("aria-label", "3D 檢視器");
  t3.canvas.dataset.t3Canvas = "";
  t3.viewer = createViewer(t3.canvas);
  return t3.viewer;
}
// Brings the viewer in line with the doc: models (loaded once per object+url), transforms, poses, IK, lights, ground.
async function t3Sync() {
  const v = await t3Viewer(),
    d = t3.doc;
  if (!d) return;
  for (const id of [...t3.loaded.keys()])
    if (
      !d.objects.some((o) => o.id === id && o.asset.url === t3.loaded.get(id))
    ) {
      v.remove(id);
      t3.loaded.delete(id);
    }
  let added = false;
  for (const o of d.objects) {
    if (t3.loaded.get(o.id) !== o.asset.url) {
      const info = await v.load(o.id, o.asset.url, o);
      t3.loaded.set(o.id, o.asset.url);
      t3.bones.set(o.id, info);
      added = true;
    }
    v.setTransform(o.id, o);
    if (Object.keys(o.pose || {}).length || o.ik?.length) {
      v.setPose(o.id, o.pose || {});
      v.setIk(o.id, o.ik || []);
    }
  }
  v.setLights(d.lights);
  v.setGround(d.ground);
  v.showSkeleton(t3.skeleton);
  v.setTime(t3.frame / (d.output.fps.num / d.output.fps.den));
  const cam = t3CameraAt(t3.frame);
  if (cam) v.setCamera(cam);
  else v.setCamera({ fov: d.camera.fov });
  if (added && tool === "3d") return render(); // the inspector lists the bones of the model just loaded
  document.querySelector("[data-t3-ready]")?.setAttribute("data-t3-ready", "1");
}
// Camera keys interpolate linearly (render.py keys the Blender camera the same way).
function t3CameraAt(frame) {
  const keys = [...(t3.doc?.camera.keys || [])].sort(
    (a, b) => a.frame - b.frame,
  );
  if (!keys.length) return null;
  const after = keys.findIndex((k) => k.frame >= frame);
  if (after <= 0)
    return { ...(after === 0 ? keys[0] : keys.at(-1)), fov: t3.doc.camera.fov };
  const a = keys[after - 1],
    b = keys[after],
    t = (frame - a.frame) / (b.frame - a.frame);
  const mix = (p, q) => p.map((x, i) => x + (q[i] - x) * t);
  return {
    position: mix(a.position, b.position),
    target: mix(a.target, b.target),
    fov: t3.doc.camera.fov,
  };
}

// ---- jobs -------------------------------------------------------------------------------------------------
async function t3Wait(job, label) {
  t3.job = { id: job.id, label, progress: 0 };
  render();
  for (;;) {
    const j = await VideoWorkbench.generations.get(job.id);
    if (t3.job?.id === job.id) t3.job.progress = j.progress || 0;
    const el = document.querySelector("[data-t3-progress]");
    if (el) el.textContent = `${label}：${j.progress || 0}%`;
    if (j.status === "succeeded") {
      t3.job = null;
      return await VideoWorkbench.assets.save({
        ...j.result,
        id: "job-" + j.id,
        name:
          j.result.name || `${label} · ${new Date().toLocaleString("zh-TW")}`,
        createdAt: new Date().toISOString(),
      });
    }
    if (["failed", "cancelled", "blocked"].includes(j.status)) {
      t3.job = null;
      throw Error(
        j.status === "cancelled"
          ? `${label}已取消`
          : `${label}失敗：${j.error || j.status}`,
      );
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}
async function t3Ensure() {
  if (t3.dirty || !t3.doc.revision) await t3Save();
  return t3.doc;
}
function t3ParseMap(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([^=]+?)\s*=\s*(.+?)\s*$/.exec(line);
    if (m) map[m[1]] = m[2];
  }
  return map;
}
// First guess: same name, or the same name without case/punctuation/side words (user edits the text anyway).
function t3GuessMap(sourceNames, targetNames) {
  const norm = (n) =>
    n
      .toLowerCase()
      .replace(/^mixamorig:/, "")
      .replace(/[^a-z0-9]/g, "")
      .replace(/^left(.+)/, "$1l")
      .replace(/^right(.+)/, "$1r");
  return sourceNames
    .map(
      (s) =>
        `${s}=${targetNames.find((t) => t === s) || targetNames.find((t) => norm(t) === norm(s)) || ""}`,
    )
    .join("\n");
}
async function t3MotionBones(asset) {
  if (/\.bvh$/.test(asset.url))
    return [
      ...(await (await fetch(asset.url)).text()).matchAll(
        /(?:ROOT|JOINT)\s+(\S+)/g,
      ),
    ].map((m) => m[1]);
  const v = await t3Viewer(),
    info = await v.load("__motion", asset.url, { position: [100, 0, 0] });
  v.remove("__motion");
  return info.bones.map((b) => b.name);
}
// The working copy of the scene a job was made from (opened if the user moved to another scene meanwhile).
function t3JobObject(sceneId, sceneRevision, objectId) {
  if (t3.doc?.id !== sceneId) {
    const saved = t3.list.find((s) => s.id === sceneId);
    if (!saved || saved.revision < sceneRevision)
      throw Error("找不到任務所屬的場景");
    t3Open(sceneId);
  }
  if (t3.doc.revision < sceneRevision) throw Error("場景版本早於任務");
  const found = t3.doc.objects.find((x) => x.id === objectId);
  if (!found) throw Error("場景中已沒有這個角色");
  return found;
}
async function t3Retarget() {
  const o = t3Obj();
  if (!o || !t3.motion) throw Error("先選角色與動作");
  const doc = await t3Ensure();
  const boneMap = t3ParseMap(t3.boneMapText);
  for (const k of Object.keys(boneMap)) if (!boneMap[k]) delete boneMap[k];
  const job = await VideoWorkbench.generations.create({
    type: "model",
    operation: "blender-retarget",
    prompt: "3D 動作重定向",
    references: {
      character: { url: o.asset.url, id: o.asset.id },
      motion: { url: t3.motion.url, id: t3.motion.id },
    },
    settings: { boneMap, sceneId: doc.id, sceneRevision: doc.revision },
  });
  const asset = await t3Wait(job, "動作重定向");
  // t3Ensure() may have saved and replaced t3.doc, so `o` can be a stale copy: resolve the scene and object from
  // the job's own input (sceneId + sceneRevision), never from objects captured before the job.
  const target = t3JobObject(
    job.input.settings.sceneId,
    job.input.settings.sceneRevision,
    o.id,
  );
  target.sourceAssetId ||= target.asset.id;
  target.asset = { id: asset.id, url: asset.url, name: asset.name };
  target.pose = {};
  target.ik = [];
  t3Touch();
  await t3Save();
  t3.status = `已套用動作（${asset.retarget?.bones?.length || 0} 根骨骼），場景第 ${t3.doc.revision} 版`;
}
async function t3Render() {
  const doc = await t3Ensure();
  if (!doc.camera.keys.length) throw Error("先記錄至少一個鏡頭關鍵影格");
  await t3Sync();
  // FK only (IK off) for the deltas: Blender solves the IK itself at render time.
  const deltas = (o) => {
    if (!Object.keys(o.pose || {}).length) return {};
    t3.viewer.setIk(o.id, []);
    t3.viewer.setPose(o.id, o.pose);
    return t3.viewer.poseDeltas(o.id);
  };
  const scene = {
    ...t3Strip(doc),
    objects: doc.objects.map((o) => ({ ...o, poseDeltas: deltas(o) })),
  };
  await t3Sync();
  const { width, height, frames, fps } = doc.output;
  const job = await VideoWorkbench.generations.create({
    type: "video",
    operation: "blender-render",
    prompt: "3D 渲染",
    settings: { scene, width, height, frames, fps },
  });
  const asset = await t3Wait(job, "Blender 渲染");
  t3.status = `已渲染「${asset.name}」（透明 MOV，${frames} 格）`;
  return asset;
}
async function t3Rendered(doc) {
  return (
    (await VideoWorkbench.assets.list())
      .filter(
        (a) =>
          a.origin?.engine?.startsWith("blender-") &&
          a.origin.sceneId === doc.id &&
          a.origin.sceneRevision === doc.revision &&
          a.kind === "video",
      )
      .at(-1) || null
  );
}
async function t3Place(projectId) {
  const doc = await t3Ensure();
  const asset = (await t3Rendered(doc)) || (await t3Render());
  const { p, track, startFrame } = await cpPlaceAsset(
    projectId,
    asset,
    (doc.output.frames * doc.output.fps.den) / doc.output.fps.num,
  );
  t3.status = `已放到「${p.title}」的 ${track} 軌（第 ${startFrame} 格起）`;
}
async function t3Shot() {
  const o = t3Obj();
  await t3Sync();
  const stored = await VideoWorkbench.request("/3d/stills", {
    data: t3.viewer.screenshot(),
    sceneId: t3.doc?.revision ? t3.doc.id : undefined,
    sceneRevision: t3.doc?.revision || undefined,
    parentAssetId: o?.asset.id,
  });
  const asset = await VideoWorkbench.assets.save({
    ...stored,
    name: `${o?.asset.name || "3D"} 指定角度`,
    createdAt: new Date().toISOString(),
  });
  t3.status = `已存成參考圖「${asset.name}」，可在生成頁的參考圖選用`;
}
async function t3Meshy() {
  if (!t3.meshyImage) throw Error("先選一張圖片");
  const job = await VideoWorkbench.generations.create({
    type: "model",
    operation: "meshy-image-to-3d",
    prompt: "圖片轉 3D",
    references: { image: { url: t3.meshyImage.url, id: t3.meshyImage.id } },
    settings: { texture: t3.meshyTexture },
  });
  const asset = await t3Wait(job, "Meshy 圖片轉 3D");
  if (!t3.doc) t3.doc = t3New();
  t3AddObject(asset);
  t3.status = `已產生 3D 模型「${asset.name}」並放進場景${asset.origin?.credits != null ? `（用掉 ${asset.origin.credits} 點 Meshy 額度）` : ""}`;
}
function t3AddObject(asset) {
  const o = {
    id: t3Rid(),
    asset: { id: asset.id, url: asset.url, name: asset.name },
    position: [0, 0, 0],
    rotationY: 0,
    scale: 1,
    pose: {},
    ik: [],
  };
  t3.doc.objects.push(o);
  t3.obj = o.id;
  t3Touch();
}
async function t3Upload(kind) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = kind === "motion" ? ".bvh,.glb" : ".glb";
  const file = await new Promise((resolve) => {
    input.onchange = () => resolve(input.files[0]);
    input.click();
  });
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  const mime = /\.bvh$/i.test(file.name)
    ? "application/x-bvh"
    : "model/gltf-binary";
  const stored = await VideoWorkbench.request("/uploads", {
    name: file.name,
    data: `data:${mime};base64,${btoa(binary)}`,
    rightsConfirmed: VideoWorkbench.rightsConfirmed === true,
  });
  const asset = await VideoWorkbench.assets.save({
    ...stored,
    createdAt: new Date().toISOString(),
  });
  if (kind === "motion") await t3PickMotion(asset);
  else {
    if (!t3.doc) t3.doc = t3New();
    t3AddObject(asset);
  }
  t3.status = `已匯入「${asset.name}」`;
}
async function t3PickMotion(asset) {
  t3.motion = asset;
  const o = t3Obj();
  const targets = o ? (t3.bones.get(o.id)?.bones || []).map((b) => b.name) : [];
  t3.boneMapText = t3GuessMap(await t3MotionBones(asset), targets);
}

// ---- screen -----------------------------------------------------------------------------------------------
function toolThreeDScreen(t) {
  t3Boot();
  const engine = t3Engine(),
    meshy = VideoWorkbench.capabilities?.meshy || { available: false },
    d = t3.doc;
  const banner = engine.available
    ? ""
    : `<div class="t3-banner" role="status"><b>尚未安裝 3D 引擎</b>：檢視器可用，Blender 渲染與動作重定向需要先安裝。在工作台資料夾執行 <code>${t3Esc(engine.install || "node scripts/vendor-blender.cjs")}</code>（約 400 MB），其他平台設定 <code>BLENDER_PATH</code>。</div>`;
  // Shared tools-0.js header(): the back button (data-act=home) every tool screen has. No "tool-flow" class:
  // its block-label rules would break the 3D rows.
  const header = `<div class="wrap" data-tool-flow="3d">${window.header(t, "3D", "模型、骨架、攝影機、燈光、動作重定向；輸出為 Blender 渲染的透明影片")}${banner}`;
  if (!t3.ready) return header + `<p class="note">載入中…</p></div>`;
  if (!d)
    return (
      header +
      `<div class="row">${t3B("新增場景", "new", { primary: true })}${t3B("匯入 GLB 模型", "upload-model")}${VideoWorkbench.rightsCheckbox()}</div><h3>所有場景</h3><div class="flow-choices">${t3.list.map((s) => t3B(`${s.title} · 第 ${s.revision} 版`, "open:" + s.id)).join("") || '<p class="note">還沒有 3D 場景。</p>'}</div>${t3MeshyPanel(meshy)}</div>`
    );
  const o = t3Obj(),
    info = o ? t3.bones.get(o.id) : null,
    out = d.output,
    busy = !!t3.job;
  const saved = t3.list.find((s) => s.id === d.id);
  const top = `<div class="row">${t3B("所有場景", "list")}<label>場景名稱<input class="text-input" aria-label="場景名稱" data-t3-field="title" maxlength="100" value="${t3Esc(d.title)}"></label>${t3B(t3.dirty ? "儲存（有未儲存的修改）" : "儲存", "save", { primary: t3.dirty })}<span class="note" data-t3-revision>第 ${saved?.revision || 0} 版${t3.dirty ? "・未儲存" : ""}</span>${t3B("還原上一版", "restore", { disabled: !saved?.history.length })}</div>`;
  const library = `<aside class="t3-col"><h3>場景物件</h3><div class="flow-choices">${d.objects.map((x) => t3B(x.asset.name || "模型", "obj:" + x.id, { pressed: x.id === t3.obj })).join("") || '<p class="note">場景是空的。</p>'}</div><div class="row">${t3B("匯入 GLB 模型", "upload-model")}</div>${VideoWorkbench.rightsCheckbox()}<h3>3D 素材庫</h3><div class="flow-choices" data-t3-library></div>${t3MeshyPanel(meshy)}</aside>`;
  const keys = [...d.camera.keys].sort((a, b) => a.frame - b.frame);
  const stage = `<section class="t3-stage"><div class="t3-canvas" data-t3-stage data-t3-ready="0"></div><p class="note">拖曳旋轉鏡頭、滾輪縮放、右鍵平移。燈光與 IK 為預覽近似，輸出以 Blender 渲染為準。</p><div class="row">${t3Num("目前影格", "frame", t3.frame, { step: 1, min: 0, max: out.frames - 1 })}${t3Num("視角（度）", "fov", d.camera.fov, { step: 1, min: 5, max: 120 })}${t3B("記錄鏡頭關鍵影格", "cam-key")}${t3B(t3.skeleton ? "隱藏骨架" : "顯示骨架", "skeleton", { pressed: t3.skeleton })}${t3B("地面陰影", "ground", { pressed: d.ground })}${t3B("指定角度截圖", "shot")}</div><div class="flow-choices" aria-label="鏡頭關鍵影格">${keys.map((k) => `<span class="chip">第 ${k.frame} 格 ${t3B("刪除", "cam-del:" + k.frame)}</span>`).join("") || '<span class="note">還沒有鏡頭關鍵影格：轉好鏡頭後按「記錄鏡頭關鍵影格」。</span>'}</div>
    <h3>輸出</h3><div class="row">${t3Num("寬", "out-width", out.width, { step: 2, min: 16, max: 1920 })}${t3Num("高", "out-height", out.height, { step: 2, min: 16, max: 1920 })}${t3Num("長度（格）", "out-frames", out.frames, { step: 1, min: 1, max: 1200 })}<div class="flow-choices" role="group" aria-label="影格率">${T3_FPS.map((f) => t3B(f.num + " fps", "fps:" + f.num, { pressed: f.num === out.fps.num })).join("")}</div></div>
    <div class="row">${t3B("Blender 渲染（透明 MOV）", "render", { disabled: busy || !engine.available, primary: true })}${busy ? t3B("取消", "cancel-job") : ""}<span data-t3-progress role="status">${busy ? `${t3Esc(t3.job.label)}：${t3.job.progress}%` : ""}</span></div>
    <div class="row"><span class="note">放到剪輯時間軸：</span><span data-t3-projects class="flow-choices"></span></div><p class="cp-status" role="status" data-t3-status>${t3Esc(t3.status)}</p></section>`;
  const lights = d.lights
    .map(
      (l, i) =>
        `<div class="t3-light"><div class="flow-choices" role="group" aria-label="燈光 ${i + 1} 類型">${[
          ["point", "點光"],
          ["sun", "平行光"],
          ["spot", "聚光"],
        ]
          .map(([k, n]) =>
            t3B(n, `light-type:${i}:${k}`, { pressed: l.type === k }),
          )
          .join(
            "",
          )}${t3B("移除", "light-del:" + i)}</div><div class="row">${t3Num(`燈光 ${i + 1} 強度`, `light-intensity:${i}`, l.intensity, { step: 0.5, min: 0, max: 100 })}<label>顏色<input class="text-input" type="color" aria-label="燈光 ${i + 1} 顏色" data-t3-field="light-color:${i}" value="${t3Esc(l.color)}"></label></div><div class="row">${["x", "y", "z"].map((a, j) => t3Num(`燈光 ${i + 1} ${a}`, `light-pos:${i}:${j}`, l.position[j])).join("")}</div></div>`,
    )
    .join("");
  const pose =
    o && info?.bones.length
      ? `<h3>骨架（${info.bones.length} 根）</h3><div class="flow-choices">${info.bones.map((b) => t3B(b.name, "bone:" + b.name, { pressed: b.name === t3.bone })).join("")}</div>${t3.bone ? `<p class="note">FK 旋轉「${t3Esc(t3.bone)}」：${t3Esc((o.pose?.[t3.bone] || [0, 0, 0]).join("°, "))}°</p><div class="flow-choices">${["X", "Y", "Z"].flatMap((a, j) => [t3B(`${a} −15°`, `rot:${j}:-15`), t3B(`${a} +15°`, `rot:${j}:15`)]).join("")}${t3B("重設此骨", "rot-reset")}</div><p class="note">IK（預覽近似；渲染時由 Blender 計算）：此骨頭起點移到目標，往上轉幾根父骨。</p><div class="row">${["x", "y", "z"].map((a, j) => t3Num(`IK 目標 ${a}`, `ik:${j}`, (o.ik?.find((k) => k.bone === t3.bone)?.target || info.ikDefault || [0, 1, 0])[j])).join("")}${t3Num("IK 父骨數", "ik-chain", o.ik?.find((k) => k.bone === t3.bone)?.chain || 2, { step: 1, min: 1, max: 8 })}</div><div class="row">${t3B("套用 IK", "ik-apply")}${t3B("移除 IK", "ik-del", { disabled: !o.ik?.some((k) => k.bone === t3.bone) })}</div>` : ""}
    <h3>動作重定向</h3><div class="flow-choices" data-t3-motions></div><div class="row">${t3B("匯入動作（BVH／GLB）", "upload-motion")}</div>${VideoWorkbench.rightsCheckbox()}${t3.motion ? `<p class="note">動作：${t3Esc(t3.motion.name)}</p><label>骨骼對照（每行：動作骨骼=角色骨骼）<textarea class="text-input" rows="6" aria-label="骨骼對照" data-t3-field="bonemap">${t3Esc(t3.boneMapText)}</textarea></label>${t3B("套用動作（Blender 重定向）", "retarget", { disabled: busy || !engine.available })}` : ""}`
      : o
        ? '<p class="note">此模型沒有骨架。</p>'
        : "";
  const inspector = `<aside class="t3-col"><h3>燈光（最多 3 盞）</h3>${lights}${t3B("新增燈光", "light-add", { disabled: d.lights.length >= 3 })}${o ? `<h3>模型「${t3Esc(o.asset.name)}」</h3><div class="row">${["x", "y", "z"].map((a, j) => t3Num(`位置 ${a}`, `pos:${j}`, o.position[j])).join("")}</div><div class="row">${t3Num("旋轉（度）", "rotY", o.rotationY, { step: 5 })}${t3Num("縮放", "scale", o.scale, { step: 0.1, min: 0.01, max: 100 })}${t3B("從場景移除", "obj-del")}</div>${pose}` : ""}</aside>`;
  return (
    header +
    top +
    `<div class="t3-layout">${library}${stage}${inspector}</div></div>`
  );
}
function t3MeshyPanel(meshy) {
  const credits = t3.meshyTexture
    ? "約 30 點 Meshy 額度（含貼圖）"
    : "約 20 點 Meshy 額度（不含貼圖）";
  return `<h3>圖片轉 3D（Meshy）</h3><div class="flow-choices" data-t3-images></div><div class="row">${t3B("含貼圖", "meshy-texture", { pressed: t3.meshyTexture })}</div><p class="note" data-t3-credits>${credits}</p>${t3B(meshy.available ? "產生 3D 模型" : "Meshy 金鑰未設定", "meshy", { disabled: !meshy.available || !t3.meshyImage || !!t3.job })}`;
}
// Lists that need the asset library / editor projects are filled after render (both are async).
async function toolThreeDAfterRender() {
  if (!t3.ready) return;
  const assets = await VideoWorkbench.assets.list();
  const fill = (sel, html) =>
    document.querySelector(sel) &&
    (document.querySelector(sel).innerHTML = VideoWorkbench.sanitize(html));
  fill(
    "[data-t3-library]",
    assets
      .filter((a) => a.kind === "model")
      .slice(-24)
      .map((a) => t3B("加入：" + (a.name || "模型"), "add:" + a.id))
      .join("") || '<p class="note">素材庫還沒有 GLB 模型。</p>',
  );
  fill(
    "[data-t3-motions]",
    assets
      .filter((a) => a.kind === "motion" || a.kind === "model")
      .slice(-24)
      .map((a) =>
        t3B("動作：" + (a.name || "動作"), "motion:" + a.id, {
          pressed: t3.motion?.id === a.id,
        }),
      )
      .join(""),
  );
  fill(
    "[data-t3-images]",
    assets
      .filter((a) => a.kind === "image")
      .slice(-12)
      .map((a) =>
        t3B("圖片：" + (a.name || "圖片"), "meshy-image:" + a.id, {
          pressed: t3.meshyImage?.id === a.id,
        }),
      )
      .join("") || '<p class="note">素材庫還沒有圖片。</p>',
  );
  if (
    document.querySelector("[data-t3-projects]") &&
    typeof cpEditorReady === "function"
  ) {
    await cpEditorReady();
    fill(
      "[data-t3-projects]",
      ed.projects
        .map((p) =>
          t3B(`放到「${p.title}」`, "place:" + p.id, {
            disabled: !!t3.job || !t3Engine().available,
          }),
        )
        .join("") || '<span class="note">還沒有剪輯專案。</span>',
    );
  }
  const stage = document.querySelector("[data-t3-stage]");
  if (stage && t3.doc) {
    await t3Viewer();
    stage.append(t3.canvas);
    await t3Sync();
  }
}

// ---- events -----------------------------------------------------------------------------------------------
async function t3Action(action) {
  const [name, ...rest] = action.split(":"),
    arg = rest.join(":"),
    d = t3.doc,
    o = t3Obj();
  const assets = () => VideoWorkbench.assets.list();
  if (name === "new") ((t3.doc = t3New()), (t3.obj = null), (t3.dirty = true));
  else if (name === "open") t3Open(arg);
  else if (name === "list") t3.doc = null;
  else if (name === "save") await t3Save();
  else if (name === "restore") await t3Restore();
  else if (name === "upload-model") await t3Upload("model");
  else if (name === "upload-motion") await t3Upload("motion");
  else if (name === "add")
    t3AddObject((await assets()).find((a) => a.id === arg));
  else if (name === "obj") ((t3.obj = arg), (t3.bone = null));
  else if (name === "obj-del")
    ((d.objects = d.objects.filter((x) => x.id !== t3.obj)),
      (t3.obj = d.objects[0]?.id || null),
      t3Touch());
  else if (name === "bone") t3.bone = arg;
  else if (name === "rot") {
    const [axis, deg] = arg.split(":").map(Number),
      e = [...(o.pose[t3.bone] || [0, 0, 0])];
    e[axis] = ((((e[axis] + deg + 180) % 360) + 360) % 360) - 180;
    o.pose = { ...o.pose, [t3.bone]: e };
    t3Touch();
  } else if (name === "rot-reset") {
    delete o.pose[t3.bone];
    t3Touch();
  } else if (name === "ik-apply") {
    const read = (f) =>
      Number(document.querySelector(`[data-t3-field="${f}"]`).value);
    o.ik = [
      ...(o.ik || []).filter((k) => k.bone !== t3.bone),
      {
        bone: t3.bone,
        chain: Math.max(1, Math.min(8, Math.round(read("ik-chain")))),
        target: [0, 1, 2].map((j) => read("ik:" + j)),
      },
    ];
    t3Touch();
  } else if (name === "ik-del")
    ((o.ik = o.ik.filter((k) => k.bone !== t3.bone)), t3Touch());
  else if (name === "cam-key") {
    const cam = (await t3Viewer()).getCamera();
    d.camera.keys = [
      ...d.camera.keys.filter((k) => k.frame !== t3.frame),
      { frame: t3.frame, position: cam.position, target: cam.target },
    ];
    t3Touch();
  } else if (name === "cam-del")
    ((d.camera.keys = d.camera.keys.filter((k) => k.frame !== Number(arg))),
      t3Touch());
  else if (name === "skeleton") t3.skeleton = !t3.skeleton;
  else if (name === "ground") ((d.ground = !d.ground), t3Touch());
  else if (name === "light-add")
    (d.lights.push({
      id: t3Rid(),
      type: "point",
      position: [-2, 2, 2],
      intensity: 3,
      color: "#ffffff",
    }),
      t3Touch());
  else if (name === "light-del") (d.lights.splice(Number(arg), 1), t3Touch());
  else if (name === "light-type") {
    const [i, type] = arg.split(":");
    d.lights[Number(i)].type = type;
    t3Touch();
  } else if (name === "fps")
    ((d.output.fps = T3_FPS.find((f) => f.num === Number(arg))), t3Touch());
  else if (name === "motion")
    await t3PickMotion((await assets()).find((a) => a.id === arg));
  else if (name === "retarget") await t3Retarget();
  else if (name === "render") await t3Render();
  else if (name === "cancel-job") {
    if (t3.job) await VideoWorkbench.generations.cancel(t3.job.id);
    return;
  } else if (name === "place") await t3Place(arg);
  else if (name === "shot") await t3Shot();
  else if (name === "meshy-image")
    t3.meshyImage = (await assets()).find((a) => a.id === arg);
  else if (name === "meshy-texture") t3.meshyTexture = !t3.meshyTexture;
  else if (name === "meshy") await t3Meshy();
  render();
}
function t3Field(el) {
  const f = el.dataset.t3Field,
    d = t3.doc,
    o = t3Obj(),
    n = Number(el.value);
  const [name, a, b] = f.split(":");
  if (f === "title") d.title = el.value.slice(0, 100);
  else if (f === "bonemap") return void (t3.boneMapText = el.value);
  else if (f === "frame")
    t3.frame = Math.max(0, Math.min(d.output.frames - 1, Math.round(n) || 0));
  else if (!Number.isFinite(n) && name !== "light-color") return;
  else if (f === "fov") d.camera.fov = Math.max(5, Math.min(120, n));
  else if (f === "out-width" || f === "out-height")
    d.output[f.slice(4)] = Math.max(16, Math.min(1920, Math.round(n / 2) * 2));
  else if (f === "out-frames")
    d.output.frames = Math.max(1, Math.min(1200, Math.round(n)));
  else if (name === "light-intensity")
    d.lights[Number(a)].intensity = Math.max(0, Math.min(100, n));
  else if (name === "light-color") d.lights[Number(a)].color = el.value;
  else if (name === "light-pos") d.lights[Number(a)].position[Number(b)] = n;
  else if (name === "pos") o.position[Number(a)] = n;
  else if (f === "rotY") o.rotationY = n;
  else if (f === "scale") o.scale = Math.max(0.01, Math.min(100, n));
  else return; // ik fields are read when 套用 IK is pressed
  if (f !== "frame") t3Touch();
  render();
}
document.addEventListener("click", (e) => {
  const el = e.target.closest?.("[data-t3-action]");
  if (!el || el.disabled || tool !== "3d") return;
  t3Action(el.dataset.t3Action).catch((error) => {
    t3.status = error.message;
    render();
    VideoWorkbench.reportError(error);
  });
});
document.addEventListener("change", (e) => {
  if (e.target.matches?.("[data-t3-field]") && tool === "3d" && t3.doc)
    t3Field(e.target);
});
if (tool === "3d") render();
