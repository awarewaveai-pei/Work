// Card P4 (handoff §4.6 + S1): the 角色綁定 workspace (#rig) and the compositor's "rig" layer.
// Rig data = character.rigs[] (versioned, last 20 kept), under the character in the server ledger; parts are
// library images (originals untouched). Animation is not here: a composition layer of kind "rig" keyframes the
// controls (bone rotations, IK targets, pin offsets), so P3 curves/expressions/output/timeline apply unchanged.
// Drawing = Rig.draw (shared/rig.js), the same call in this workspace, the compositor preview and its output.
// Poses live under the character (character.poses[]); 匯出姿勢圖 adds a PNG to the character's references.
// Visible buttons only, no <select>. Loaded before tools-compositor.js (whose cpLoad calls rgLoad); everything
// here that touches the compositor (cp, cpMediaEntry, cpB ...) runs only after both files are in.
const rg = {
  ready: false,
  loading: null,
  chars: [],
  charId: null,
  rig: null,
  dirty: false,
  mode: "move",
  part: null,
  bone: null,
  pin: null,
  weightBone: null,
  brush: { radius: 40, strength: 0.5, mode: "add" },
  heat: false,
  skeleton: true,
  cpSkeleton: false,
  status: "",
  demoComp: null,
  drag: null,
};
const RG_MODES = [
  ["move", "移動部件", "拖動部件改變位置（相對骨骼的偏移）。"],
  [
    "pivot",
    "設定樞紐",
    "拖到哪裡，選取的骨骼（或部件所屬骨骼）的旋轉中心就在哪裡。",
  ],
  [
    "bone",
    "建立骨骼",
    "按下＝骨頭起點，放開＝骨頭終點；新骨骼的父骨＝目前選取的骨骼。",
  ],
  [
    "pin",
    "控制釘",
    "在選取部件的網格上點一下新增控制釘；拖動已有的控制釘改變它的位置。",
  ],
  [
    "weight",
    "權重筆刷",
    "在選取部件的網格上拖動，依筆刷設定修改「筆刷骨骼」的影響程度。",
  ],
];
const rgEsc = (v) => cpEsc(v);
const rgB = (
  label,
  action,
  { disabled = false, pressed, primary = false } = {},
) =>
  `<button type="button" class="btn small${primary ? " primary" : ""}${pressed ? " selected" : ""}" data-rg-action="${rgEsc(action)}"${pressed === undefined ? "" : ` aria-pressed="${!!pressed}"`}${disabled ? " disabled" : ""}>${rgEsc(label)}</button>`;
const rgId = (p) => p + Math.random().toString(36).slice(2, 10);
const rgChar = () => rg.chars.find((c) => c.id === rg.charId) || null;
const rgPart = () => rg.rig?.parts.find((p) => p.id === rg.part) || null;
const rgBone = () => rg.rig?.bones.find((b) => b.id === rg.bone) || null;
const rgMeshOf = (part) =>
  part ? rg.rig.meshes.find((m) => m.partId === part.id) || null : null;
const rgStrip = (r) => {
  const { history, ...rest } = structuredClone(r);
  return rest;
};
function rgNormalize(r) {
  const x = structuredClone(r || {});
  x.id ||= rgId("R");
  x.name = String(x.name || "綁定").slice(0, 60);
  x.version = Number.isInteger(x.version) ? x.version : 0;
  x.history = Array.isArray(x.history) ? x.history.slice(0, 20) : [];
  x.canvas = {
    width: Math.max(16, Math.min(4096, Math.round(x.canvas?.width || 800))),
    height: Math.max(16, Math.min(4096, Math.round(x.canvas?.height || 900))),
  };
  for (const k of ["parts", "bones", "meshes", "chains"])
    x[k] = Array.isArray(x[k]) ? x[k] : [];
  // Meshes saved in part pixels (before review 2026-11-03 #2) become part-normalised; stored so on the next save.
  x.meshes = x.meshes.map((m) => {
    const part = x.parts.find((p) => p.id === m.partId);
    return part ? Rig.unitMesh(m, part) : m;
  });
  x.testPose =
    x.testPose && typeof x.testPose === "object" ? x.testPose : { rot: {} };
  x.testPose.rot ||= {};
  return x;
}

// ---- data -------------------------------------------------------------------------------------------------
async function rgLoad() {
  rg.chars = await VideoWorkbench.characters.list();
  rg.ready = true;
}
function rgBoot() {
  if (rg.ready || rg.loading) return rg.loading;
  rg.loading = rgLoad()
    .then(() => tool === "rig" && render())
    .catch(VideoWorkbench.reportError)
    .finally(() => (rg.loading = null));
  return rg.loading;
}
async function rgSaveChar(c) {
  await VideoWorkbench.characters.save(c);
  rg.chars = [...rg.chars.filter((x) => x.id !== c.id), structuredClone(c)];
}
// Saving = a new version; the saved copy it replaces goes to the front of history (last 20 kept).
async function rgSave() {
  const c = structuredClone(rgChar()),
    saved = (c.rigs || []).find((r) => r.id === rg.rig.id);
  const next = {
    ...rgStrip(rg.rig),
    version: (saved?.version || 0) + 1,
    history: saved
      ? [rgStrip(saved), ...(saved.history || [])].slice(0, 20)
      : [],
    updatedAt: new Date().toISOString(),
  };
  c.rigs = [...(c.rigs || []).filter((r) => r.id !== next.id), next];
  await rgSaveChar(c);
  rg.rig = rgNormalize(next);
  rg.dirty = false;
  return rg.rig;
}
function rgTouch() {
  rg.dirty = true;
}

// ---- images -----------------------------------------------------------------------------------------------
// Parts load through the compositor's media cache (same decoded element for the workspace, preview and output).
const rgAsLayer = (part) => ({
  kind: "image",
  url: part.url,
  previewUrl: part.previewUrl || part.url,
});
async function rgImages(rig, mode = "preview") {
  for (const part of rig.parts) {
    const e = cpMediaEntry(rgAsLayer(part), mode);
    if (e) await e.ready;
  }
}
function rgImageFn(mode = "preview") {
  return (part) => {
    const e = cp.media.get("image:" + cpSrc(rgAsLayer(part), mode));
    return e?.ok ? e.el : null;
  };
}
// Alpha of a part's image at its rig size: opaque(x0, y0, x1, y1) for Rig.buildMesh.
async function rgAlpha(part) {
  const e = cpMediaEntry(rgAsLayer(part), "output");
  if (!(await e.ready)) throw Error("部件圖片無法載入：" + part.name);
  const w = Math.max(1, Math.round(part.width)),
    h = Math.max(1, Math.round(part.height)),
    c = Object.assign(document.createElement("canvas"), {
      width: w,
      height: h,
    }),
    x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(e.el, 0, 0, w, h);
  const data = x.getImageData(0, 0, w, h).data;
  return (x0, y0, x1, y1) => {
    for (let y = Math.floor(y0); y < Math.min(h, Math.ceil(y1)); y++)
      for (let xx = Math.floor(x0); xx < Math.min(w, Math.ceil(x1)); xx++)
        if (data[(y * w + xx) * 4 + 3] > 8) return true;
    return false;
  };
}

// ---- compositor side ----------------------------------------------------------------------------------------
// The rig a layer draws: its character's rig at the layer's pinned version (history keeps the last 20).
function rgRigForLayer(layer) {
  const c = rg.chars.find((x) => x.id === layer.characterId),
    rig = c?.rigs?.find((r) => r.id === layer.rigId);
  return {
    char: c || null,
    latest: rig || null,
    rig: rig ? Rig.atVersion(rig, layer.rigVersion) : null,
  };
}
function rgResource(layer, mode) {
  const { rig } = rgRigForLayer(layer);
  return rig ? { rig, image: rgImageFn(mode) } : null;
}
async function rgPrepare(layer, mode) {
  const { rig } = rgRigForLayer(layer);
  if (rig) await rgImages(rig, mode);
}
async function rgOutputMedia(doc) {
  for (const l of doc.layers.filter((x) => x.kind === "rig" && x.visible)) {
    const { rig } = rgRigForLayer(l);
    if (!rig)
      throw Error(`圖層「${l.name}」找不到角色綁定（角色或該版本已刪除）`);
    for (const part of rig.parts)
      if (
        !part.hidden &&
        !(await cpMediaEntry(rgAsLayer(part), "output").ready)
      )
        throw Error("缺少素材：" + l.name + "・" + part.name);
  }
}
function rgSourceIds(doc) {
  return doc.layers
    .filter((l) => l.kind === "rig")
    .flatMap((l) => rgRigForLayer(l).rig?.parts.map((p) => p.assetId) || [])
    .filter((v) => typeof v === "string" && v);
}
function rgLabel(name) {
  for (const l of cp.doc?.layers || []) {
    if (l.kind !== "rig") continue;
    const { rig } = rgRigForLayer(l),
      c = rig && Rig.controls(rig).find((x) => x.name === name);
    if (c) return c.label;
  }
  return "";
}
// A new rig layer: choose a character and one of its rigs (buttons), controls start at their defaults.
function rgNewLayer(d, c, rig) {
  const layer = Compositor.newLayer("rig", {
    id: "L" + cpRid(),
    name: c.name || "角色",
    outFrame: d.durationFrames,
    characterId: c.id,
    rigId: rig.id,
    rigVersion: rig.version,
  });
  layer.props.x = { value: Math.round(d.width / 2) };
  layer.props.y = { value: Math.round(d.height / 2) };
  layer.props.anchorX = { value: Math.round(rig.canvas.width / 2) };
  layer.props.anchorY = { value: Math.round(rig.canvas.height / 2) };
  for (const ctl of Rig.controls(rig))
    layer.props[ctl.name] = { value: ctl.def };
  return layer;
}
async function rgAddLayer(d) {
  await rgLoad();
  const choices = rg.chars.flatMap((c) =>
    (c.rigs || []).filter((r) => r.version > 0).map((r) => ({ c, r })),
  );
  if (!choices.length)
    throw Error("還沒有已儲存的角色綁定，請先到「角色綁定」建立");
  const dlg = edDialog(
    `<h3>加入哪個角色綁定？</h3><div class="flow-choices">${choices.map(({ c, r }, i) => `<button type="button" class="btn small" data-rg-pick="${i}">${rgEsc((c.name || "未命名角色") + "・" + r.name + "・第 " + r.version + " 版")}</button>`).join("")}</div>`,
  );
  const i = await new Promise((resolve) => {
    dlg.addEventListener("close", () => resolve(null));
    dlg
      .querySelectorAll("[data-rg-pick]")
      .forEach(
        (b) =>
          (b.onclick = () => (resolve(Number(b.dataset.rgPick)), dlg.close())),
      );
  });
  if (i === null) return;
  const { c, r } = choices[i],
    layer = rgNewLayer(d, c, rgNormalize(r));
  d.layers.unshift(layer);
  cp.layer = layer.id;
  cp.prop = "x";
  cp.key = null;
  cpTouch();
  render();
}
const rgPoses = (layer) =>
  (rgRigForLayer(layer).char?.poses || []).filter(
    (p) => p.rigId === layer.rigId,
  );
function rgInspector(l) {
  const { char, latest, rig } = rgRigForLayer(l);
  if (!rig)
    return `<p class="note cp-error" role="alert">找不到角色綁定（角色或第 ${rgEsc(l.rigVersion)} 版已刪除）</p>`;
  const outdated = latest && latest.version > l.rigVersion,
    rows = Rig.controls(rig)
      .map((c) => cpPropRow(l, c.name, c.label))
      .join("");
  const poses = rgPoses(l);
  return `<div class="rg-layer" data-rg-layer><p class="note">角色：<b>${rgEsc(char?.name || "")}</b>・${rgEsc(rig.name)}・綁定第 ${rgEsc(l.rigVersion)} 版</p>${outdated ? cpB("綁定有新版本：更新", "rig-update", { primary: true }) : ""}<div class="row">${cpB(rg.cpSkeleton ? "隱藏骨架" : "顯示骨架", "rig-skeleton", { pressed: rg.cpSkeleton })}<span class="note">骨架只在預覽上方顯示，不會輸出；顯示時可拖動 IK 目標（圓點）。</span></div><h4>控制器（可加關鍵影格、曲線、表達式）</h4>${rows}<h4>姿勢（存在角色下）</h4><div class="row"><label>姿勢名稱<input class="text-input" aria-label="姿勢名稱" data-rg-pose-name maxlength="40" value="姿勢 ${poses.length + 1}"></label>${cpB("把目前影格存成姿勢", "rig-pose-save")}</div>${poses
    .map(
      (p) =>
        `<div class="rg-pose" data-rg-pose="${rgEsc(p.id)}"><b>${rgEsc(p.name)}</b><span class="note">（綁定第 ${rgEsc(p.rigVersion)} 版）</span><span class="row">${cpB("套用姿勢", "rig-pose-apply:" + p.id)}${cpB("匯出姿勢圖", "rig-pose-export:" + p.id)}${cpB("刪除", "rig-pose-delete:" + p.id)}</span></div>`,
    )
    .join(
      "",
    )}<p class="note">套用姿勢＝在播放頭為每個控制器加關鍵影格。匯出姿勢圖＝把此姿勢畫成透明 PNG，存進素材庫並加入角色參考圖（最多 8 張），生成頁引用角色時一起送出。</p></div>`;
}
// Pose values at a frame: every control of the layer's rig, resolved like the renderer resolves it.
function rgValuesAt(l, frame) {
  const { rig } = rgRigForLayer(l),
    env = Compositor.makeEnv(cp.doc),
    out = {};
  for (const c of Rig.controls(rig))
    out[c.name] = Number(Compositor.propValue(l, c.name, frame, env)) || 0;
  return out;
}
// Sets a control at the playhead: a keyed property gets a key there, an unkeyed one its value.
function rgSetControl(l, name, value) {
  const p = (l.props[name] ||= { value });
  if (p.keys?.length) Compositor.setKey(p, cp.frame, value);
  else p.value = value;
}
// The programmatic half of dragging an IK target (rig space); the overlay pointer handler calls the same.
function rgDragIk(chainId, x, y) {
  const l = cpLayer();
  if (l?.kind !== "rig") throw Error("請先選取角色圖層");
  rgSetControl(l, Rig.ikProp(chainId, "x"), Math.round(x * 1000) / 1000);
  rgSetControl(l, Rig.ikProp(chainId, "y"), Math.round(y * 1000) / 1000);
  cpTouch();
}
// Posed joints of a rig layer at a frame in comp coordinates (overlay, tests).
function rgPosedAt(l, frame) {
  const { rig } = rgRigForLayer(l),
    env = Compositor.makeEnv(cp.doc),
    m = Compositor.worldMatrix(l, frame, env),
    solved = Rig.solve(
      rig,
      Rig.valuesFrom(rig, (n) => Compositor.propValue(l, n, frame, env)),
    );
  return { rig, m, solved, comp: (p) => Rig.apply(m, p) };
}
function rgToken(name, fallback) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}
function rgCpOverlay(doc, frame) {
  const canvas = document.querySelector("[data-cp-overlay]");
  if (!canvas) return;
  const l = cpLayer(),
    on = rg.cpSkeleton && l?.kind === "rig" && rgRigForLayer(l).rig;
  canvas.classList.toggle("on", !!on);
  const c = canvas.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  if (!on) return;
  const { rig, m, solved } = rgPosedAt(l, frame);
  c.setTransform(...m);
  rgDrawBones(c, rig, solved, {
    scale: Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1,
  });
  const v = Rig.valuesFrom(rig, (n) =>
    Compositor.propValue(l, n, frame, Compositor.makeEnv(doc)),
  );
  for (const ch of rig.chains) {
    const t = v.ik[ch.id];
    c.beginPath();
    c.arc(
      t[0],
      t[1],
      12 / (Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1),
      0,
      Math.PI * 2,
    );
    c.fillStyle = rgToken("--accent", "#4f7cff");
    c.globalAlpha = 0.8;
    c.fill();
    c.globalAlpha = 1;
  }
}
function rgDrawBones(c, rig, solved, { scale = 1, selected = null } = {}) {
  const accent = rgToken("--accent", "#4f7cff"),
    text = rgToken("--text-primary", "#ffffff");
  c.lineWidth = 3 / scale;
  for (const b of rig.bones) {
    const p = solved.posed.get(b.id);
    if (!p) continue;
    c.strokeStyle = b.id === selected ? accent : text;
    c.globalAlpha = 0.9;
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(p.tail[0], p.tail[1]);
    c.stroke();
    c.beginPath();
    c.arc(p.x, p.y, 6 / scale, 0, Math.PI * 2);
    c.fillStyle = b.id === selected ? accent : text;
    c.fill();
  }
  c.globalAlpha = 1;
}
async function rgCpAction(name, arg, d, l) {
  if (!l || l.kind !== "rig") return;
  if (name === "rig-skeleton") {
    rg.cpSkeleton = !rg.cpSkeleton;
    return render();
  }
  const { char, latest } = rgRigForLayer(l);
  if (name === "rig-update") {
    if (!latest) return;
    l.rigVersion = latest.version;
    for (const c of Rig.controls(latest)) l.props[c.name] ||= { value: c.def };
    cp.status = "角色圖層已改用綁定第 " + latest.version + " 版";
  } else if (name === "rig-pose-save") {
    const input = document.querySelector("[data-rg-pose-name]"),
      c = structuredClone(char),
      pose = {
        id: rgId("P"),
        name:
          String(input?.value || "")
            .trim()
            .slice(0, 40) || "姿勢",
        rigId: l.rigId,
        rigVersion: l.rigVersion,
        values: rgValuesAt(l, cp.frame),
        createdAt: new Date().toISOString(),
      };
    c.poses = [...(c.poses || []), pose];
    await rgSaveChar(c);
    cp.status = `已把第 ${cp.frame} 格存成姿勢「${pose.name}」`;
    return render();
  } else if (name === "rig-pose-apply") {
    const pose = rgPoses(l).find((p) => p.id === arg);
    if (!pose) return;
    for (const [k, v] of Object.entries(pose.values)) {
      const p = (l.props[k] ||= { value: v });
      Compositor.setKey(p, cp.frame, v);
    }
    cp.status = `已在第 ${cp.frame} 格套用姿勢「${pose.name}」`;
  } else if (name === "rig-pose-delete") {
    const c = structuredClone(char);
    c.poses = (c.poses || []).filter((p) => p.id !== arg);
    await rgSaveChar(c);
    return render();
  } else if (name === "rig-pose-export") {
    const pose = rgPoses(l).find((p) => p.id === arg);
    if (!pose) return;
    const asset = await rgExportPose(char, pose);
    cp.status = asset
      ? `已匯出姿勢圖「${asset.name}」並加入角色參考圖`
      : "已取消";
    return render();
  } else return;
  cpTouch();
  render();
}
// Pose -> transparent PNG at the rig's canvas size -> library asset (origin render/workbench-rig) -> the
// character's references (max 8: full = ask which one to replace; cancel = asset stays in the library only).
async function rgExportPose(char, pose) {
  const src = char.rigs.find((r) => r.id === pose.rigId),
    rig = src && Rig.atVersion(src, pose.rigVersion);
  if (!rig) throw Error("找不到此姿勢的綁定版本");
  await rgImages(rig, "output");
  const canvas = Object.assign(document.createElement("canvas"), {
      width: rig.canvas.width,
      height: rig.canvas.height,
    }),
    out = Rig.draw(
      canvas.getContext("2d"),
      rig,
      Rig.valuesFrom(rig, (n) => pose.values[n]),
      rgImageFn("output"),
    );
  if (out.missing.length) throw Error("缺少素材：" + out.missing.join("、"));
  const stored = await VideoWorkbench.request("/rig/pose-stills", {
    data: canvas.toDataURL("image/png"),
    characterId: char.id,
    rigId: rig.id,
    rigVersion: rig.version,
    poseId: pose.id,
  });
  const asset = await VideoWorkbench.assets.save({
    ...stored,
    name: `${char.name || "角色"} 姿勢「${pose.name}」`,
    createdAt: new Date().toISOString(),
  });
  const c = structuredClone(rg.chars.find((x) => x.id === char.id));
  let refs = [...(c.references || [])];
  // Right after the main reference: generation sends only the first MAX_SENT_REFERENCES (review 2026-11-03 #1).
  if (refs.length < 8) refs = Rig.poseReferences(refs, asset.url);
  else {
    const dlg = edDialog(
      `<h3>角色參考圖已滿 8 張</h3><p class="note">選一張要被姿勢圖取代的參考圖；關閉＝不加入（姿勢圖仍在素材庫）。</p><div class="flow-choices">${refs.map((u, i) => `<button type="button" class="btn small" data-rg-replace="${i}">取代第 ${i + 1} 張<img src="${rgEsc(u)}" alt="" class="rg-thumb"></button>`).join("")}</div>`,
    );
    const i = await new Promise((resolve) => {
      dlg.addEventListener("close", () => resolve(null));
      dlg
        .querySelectorAll("[data-rg-replace]")
        .forEach(
          (b) =>
            (b.onclick = () => (
              resolve(Number(b.dataset.rgReplace)),
              dlg.close()
            )),
        );
    });
    if (i === null) return null;
    refs = Rig.poseReferences(refs, asset.url, { replace: i });
  }
  c.references = refs;
  if (!c.image) c.image = refs[0];
  await rgSaveChar(c);
  return asset;
}
// Overlay: drag an IK target handle (comp -> rig space through the layer's world matrix).
document.addEventListener("pointerdown", (e) => {
  const canvas = e.target.closest?.("[data-cp-overlay].on");
  if (!canvas || !cp.doc) return;
  const l = cpLayer();
  if (l?.kind !== "rig") return;
  const { rig, m } = rgPosedAt(l, cp.frame),
    toComp = (ev) => {
      const r = canvas.getBoundingClientRect();
      return [
        ((ev.clientX - r.left) * canvas.width) / r.width,
        ((ev.clientY - r.top) * canvas.height) / r.height,
      ];
    },
    inv = Rig.invert(m),
    at = Rig.apply(inv, toComp(e)),
    values = rgValuesAt(l, cp.frame),
    scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const chain = rig.chains.find(
    (ch) =>
      Math.hypot(
        values[Rig.ikProp(ch.id, "x")] - at[0],
        values[Rig.ikProp(ch.id, "y")] - at[1],
      ) <
      20 / scale,
  );
  if (!chain) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  canvas.onpointermove = (ev) => {
    const p = Rig.apply(inv, toComp(ev));
    rgDragIk(chain.id, p[0], p[1]);
    cpPaint().catch(VideoWorkbench.reportError);
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null;
    render();
  };
});

// ---- demo starter -------------------------------------------------------------------------------------------
// 「建立示範角色」: simple part images drawn here (uploaded to the library), bones, an IK arm, a puppet-pinned hair
// mesh, a skinned cape and an editable wave composition. Nothing is baked: every motion is a keyframed control.
async function rgDemoImage(name, w, h, paint) {
  const c = Object.assign(document.createElement("canvas"), {
      width: w,
      height: h,
    }),
    x = c.getContext("2d");
  paint(x, w, h);
  const stored = await VideoWorkbench.request("/uploads", {
    data: c.toDataURL("image/png"),
    name,
  });
  const asset = await VideoWorkbench.assets.save({
    ...stored,
    name,
    createdAt: new Date().toISOString(),
  });
  return asset;
}
const rgRound = (x, X, Y, w, h, r) => {
  x.beginPath();
  x.roundRect(X, Y, w, h, r);
  x.fill();
};
async function rgDemo() {
  const tag = "示範角色",
    fill = (col) => (x) => (x.fillStyle = col);
  const specs = [
    {
      key: "hand",
      name: "手掌",
      x: 712,
      y: 358,
      w: 56,
      h: 44,
      bone: "hand",
      paint: (x, w, h) => (
        fill("#f1c40f")(x),
        x.beginPath(),
        x.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2),
        x.fill()
      ),
    },
    {
      key: "fore",
      name: "前臂",
      x: 595,
      y: 366,
      w: 130,
      h: 28,
      bone: "fore",
      paint: (x, w, h) => (fill("#27ae60")(x), rgRound(x, 0, 0, w, h, 12)),
    },
    {
      key: "upper",
      name: "上臂",
      x: 450,
      y: 362,
      w: 155,
      h: 36,
      bone: "upper",
      paint: (x, w, h) => (fill("#c0392b")(x), rgRound(x, 0, 0, w, h, 16)),
    },
    {
      key: "hair",
      name: "頭髮",
      x: 340,
      y: 220,
      w: 120,
      h: 150,
      bone: "body",
      paint: (x, w) => {
        fill("#7b4bc4")(x);
        x.beginPath();
        x.ellipse(w / 2, 45, w / 2 - 2, 43, 0, Math.PI, 0);
        x.lineTo(w - 4, 140);
        x.quadraticCurveTo(w - 20, 148, w - 34, 120);
        x.lineTo(w - 30, 60);
        x.lineTo(30, 60);
        x.lineTo(34, 120);
        x.quadraticCurveTo(20, 148, 4, 140);
        x.closePath();
        x.fill();
      },
    },
    {
      key: "head",
      name: "頭",
      x: 355,
      y: 245,
      w: 90,
      h: 90,
      bone: "body",
      paint: (x, w, h) => (
        fill("#f2c9a0")(x),
        x.beginPath(),
        x.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2),
        x.fill()
      ),
    },
    {
      key: "body",
      name: "身體",
      x: 340,
      y: 330,
      w: 120,
      h: 290,
      bone: "body",
      paint: (x, w, h) => (fill("#3a6ea5")(x), rgRound(x, 0, 0, w, h, 30)),
    },
    {
      key: "cape",
      name: "披風",
      x: 290,
      y: 340,
      w: 220,
      h: 330,
      bone: "body",
      paint: (x, w, h) => {
        fill("#8e2b4f")(x);
        x.beginPath();
        x.moveTo(50, 0);
        x.lineTo(w - 50, 0);
        x.lineTo(w - 2, h - 2);
        x.lineTo(2, h - 2);
        x.closePath();
        x.fill();
      },
    },
  ];
  const B = {
    body: rgId("B"),
    upper: rgId("B"),
    fore: rgId("B"),
    hand: rgId("B"),
  };
  const bones = [
    {
      id: B.body,
      name: "身體",
      parent: null,
      x: 400,
      y: 620,
      angle: -90,
      length: 290,
      min: -30,
      max: 30,
    },
    {
      id: B.upper,
      name: "上臂",
      parent: B.body,
      x: 460,
      y: 380,
      angle: 0,
      length: 140,
      min: null,
      max: null,
    },
    {
      id: B.fore,
      name: "前臂",
      parent: B.upper,
      x: 600,
      y: 380,
      angle: 0,
      length: 120,
      min: -160,
      max: 160,
    },
    {
      id: B.hand,
      name: "手掌",
      parent: B.fore,
      x: 720,
      y: 380,
      angle: 0,
      length: 45,
      min: -70,
      max: 70,
    },
  ];
  const parts = [];
  for (const s of specs) {
    const a = await rgDemoImage(`${tag}・${s.name}`, s.w, s.h, s.paint);
    parts.push({
      id: rgId("T"),
      name: s.name,
      assetId: a.id,
      url: a.url,
      previewUrl: a.previewUrl || a.url,
      x: s.x,
      y: s.y,
      width: s.w,
      height: s.h,
      bone: B[s.bone],
      key: s.key,
    });
  }
  const rig = rgNormalize({
    id: rgId("R"),
    name: "揮手綁定",
    version: 0,
    canvas: { width: 800, height: 900 },
    parts,
    bones,
    chains: [
      {
        id: rgId("K"),
        name: "手臂",
        bones: [B.upper, B.fore],
        bend: 1,
        enabled: true,
      },
    ],
    meshes: [],
    testPose: { rot: { [B.upper]: -60 } },
  });
  const hair = parts.find((p) => p.key === "hair"),
    cape = parts.find((p) => p.key === "cape");
  const hm = Rig.buildMesh(
      hair.width,
      hair.height,
      "medium",
      await rgAlpha(hair),
    ),
    cm = Rig.buildMesh(cape.width, cape.height, "medium", await rgAlpha(cape));
  const sway = rgId("N");
  rig.meshes.push(
    {
      id: rgId("M"),
      partId: hair.id,
      ...hm,
      skin: false,
      weights: null,
      pins: [
        { id: rgId("N"), x: 20 / hair.width, y: 30 / hair.height, bone: B.body },
        { id: rgId("N"), x: 100 / hair.width, y: 30 / hair.height, bone: B.body },
        { id: sway, x: 110 / hair.width, y: 138 / hair.height, bone: null },
      ],
    },
    {
      id: rgId("M"),
      partId: cape.id,
      ...cm,
      skin: true,
      weights: null,
      pins: [],
    },
  );
  for (const p of parts) delete p.key;
  const c = {
    id: crypto.randomUUID(),
    name: "示範角色（揮手）",
    description:
      "角色綁定示範：身體、上臂、前臂、手掌、頭髮（Puppet 網格）與披風（權重）。",
    tags: [tag],
    references: [],
    rigs: [],
    poses: [],
  };
  rg.chars.push(c);
  rg.charId = c.id;
  rg.rig = rig;
  await rgSave();
  // The wave: IK target raises the arm (緩入緩出), the hand rotates back and forth, the hair sways.
  const saved = rg.rig,
    comp = Compositor.normalize({
      id: "C" + cpRid(),
      title: "示範角色揮手",
      width: 1280,
      height: 720,
      timebase: { num: 30, den: 1 },
      durationFrames: 90,
      background: "transparent",
      layers: [],
      revision: 1,
      history: [],
    }),
    layer = rgNewLayer(comp, rgChar(), saved),
    chain = saved.chains[0],
    E = "ease-in-out";
  Object.assign(layer.props, {
    x: { value: 640 },
    y: { value: 380 },
    anchorX: { value: 400 },
    anchorY: { value: 450 },
    scale: { value: 0.75 },
  });
  layer.name = "示範角色";
  layer.props[Rig.ikProp(chain.id, "x")] = {
    value: 720,
    keys: [
      { frame: 0, value: 720, ease: E },
      { frame: 25, value: 640, ease: "linear" },
    ],
  };
  layer.props[Rig.ikProp(chain.id, "y")] = {
    value: 380,
    keys: [
      { frame: 0, value: 380, ease: E },
      { frame: 25, value: 200, ease: "linear" },
    ],
  };
  layer.props[Rig.boneProp(B.hand)] = {
    value: 0,
    keys: [25, 40, 55, 70, 85].map((frame, i) => ({
      frame,
      value: [0, 35, -35, 35, 0][i],
      ease: i < 4 ? E : "linear",
    })),
  };
  layer.props[Rig.pinProp(sway, "x")] = {
    value: 0,
    keys: [
      { frame: 0, value: 0, ease: E },
      { frame: 45, value: 18, ease: E },
      { frame: 89, value: 0, ease: "linear" },
    ],
  };
  comp.layers = [layer];
  await VideoWorkbench.compositions.save(comp);
  if (typeof cp === "object") cp.ready = false; // the compositor reloads its list next time it opens
  rg.demoComp = comp.id;
  rg.status =
    "已建立示範角色、揮手綁定（第 1 版）與可編輯的揮手動畫「示範角色揮手」";
  return { character: rgChar(), comp };
}

// ---- workspace --------------------------------------------------------------------------------------------
function rgCaps() {
  return `<section class="rg-caps" data-rg-caps><h3>能力表</h3><p class="note">只列測試實際證明的項目（tests/p4-rig-unit.cjs、tests/p4-rig-ui.cjs）。</p><table><thead><tr><th>分類</th><th>項目</th><th>狀態</th><th>如何驗證</th></tr></thead><tbody>${Rig.CAPABILITIES.map((c) => `<tr><td>${rgEsc(c.group)}</td><td>${rgEsc(c.item)}</td><td>${c.done ? "已完成" : "未完成"}</td><td>${rgEsc(c.test)}</td></tr>`).join("")}</tbody></table></section>`;
}
function rgNum(label, field, value, extra = "") {
  return `<label>${rgEsc(label)}<input class="text-input" type="number" step="any" aria-label="${rgEsc(label)}" data-rg-field="${rgEsc(field)}" value="${rgEsc(value ?? "")}"${extra}></label>`;
}
function rgPartPanel(part) {
  const mesh = rgMeshOf(part),
    r = rg.rig;
  let html = `<h4>部件：${rgEsc(part.name)}</h4><label>部件名稱<input class="text-input" aria-label="部件名稱" data-rg-field="part-name" maxlength="40" value="${rgEsc(part.name)}"></label><div class="row">${rgNum("部件 X", "part-x", part.x)}${rgNum("部件 Y", "part-y", part.y)}</div><div class="row">${rgNum("部件寬", "part-w", part.width)}${rgNum("部件高", "part-h", part.height)}</div><p class="note">所屬骨骼（部件跟著它轉動；樞紐＝骨骼起點）</p><div class="flow-choices" role="group" aria-label="所屬骨骼">${rgB("無", "part-bone:", { pressed: !part.bone })}${r.bones.map((b) => rgB(b.name, "part-bone:" + b.id, { pressed: part.bone === b.id })).join("")}</div><div class="row">${rgB("上移", "part-up")}${rgB("下移", "part-down")}${rgB(part.hidden ? "顯示" : "隱藏", "part-hide", { pressed: !!part.hidden })}${rgB("移除部件", "part-delete")}</div>`;
  html += `<h4>Puppet 網格</h4><p class="note">網格只覆蓋圖片不透明的範圍；控制釘拉動時畫面跟著變形。</p><div class="row">${Object.entries(
    Rig.DENSITY_LABEL,
  )
    .map(([k, t]) =>
      rgB((mesh ? "重建網格・" : "建立網格・") + t, "mesh:" + k, {
        pressed: mesh?.density === k,
      }),
    )
    .join("")}${mesh ? rgB("移除網格", "mesh-remove") : ""}</div>`;
  if (mesh) {
    html += `<p class="note" data-rg-mesh-info>網格：${mesh.vertices.length} 點、${mesh.triangles.length} 個三角形、控制釘 ${mesh.pins.length} 個</p>${rgB(mesh.skin ? "取消權重蒙皮" : "以權重綁到骨骼（蒙皮）", "skin", { pressed: !!mesh.skin })}`;
    html += mesh.pins
      .map(
        (p, i) =>
          `<div class="rg-pin${p.id === rg.pin ? " selected" : ""}"><b>控制釘 ${i + 1}</b>${rgB("選取", "pin:" + p.id, { pressed: p.id === rg.pin })}${rgB("刪除控制釘", "pin-delete:" + p.id)}<div class="flow-choices" role="group" aria-label="控制釘 ${i + 1} 跟隨骨骼">${rgB("不跟隨骨骼", "pin-bone:" + p.id + ":", { pressed: !p.bone })}${r.bones.map((b) => rgB("跟隨" + b.name, "pin-bone:" + p.id + ":" + b.id, { pressed: p.bone === b.id })).join("")}</div></div>`,
      )
      .join("");
    if (mesh.skin)
      html += `<h4>權重</h4><p class="note">筆刷骨骼</p><div class="flow-choices" role="group" aria-label="筆刷骨骼">${r.bones.map((b) => rgB(b.name, "weight-bone:" + b.id, { pressed: rg.weightBone === b.id })).join("")}</div><div class="row">${rgB("加", "brush:add", { pressed: rg.brush.mode === "add" })}${rgB("減", "brush:subtract", { pressed: rg.brush.mode === "subtract" })}${rgB("平滑", "brush:smooth", { pressed: rg.brush.mode === "smooth" })}</div><div class="row">${rgNum("筆刷強度（0–1）", "brush-strength", rg.brush.strength)}${rgNum("筆刷半徑（px）", "brush-radius", rg.brush.radius)}</div><div class="row">${rgB(rg.heat ? "隱藏熱度圖" : "顯示熱度圖", "heat", { pressed: rg.heat })}${rgB("重設自動權重", "weights-reset")}</div><p class="note">${mesh.weightsEdited ? "已手動修改權重" : "目前為自動權重（依到骨骼的距離，最近兩根）"}</p><div class="rg-compare"><figure><canvas data-rg-compare="auto" width="${r.canvas.width}" height="${r.canvas.height}" aria-label="自動權重"></canvas><figcaption>自動權重</figcaption></figure><figure><canvas data-rg-compare="edited" width="${r.canvas.width}" height="${r.canvas.height}" aria-label="編輯後權重"></canvas><figcaption>編輯後權重</figcaption></figure></div><p class="note">兩張都是下方「測試姿勢」。</p>`;
  }
  return html;
}
function rgBonePanel(b) {
  const r = rg.rig,
    chainOf = (n) => {
      const ids = [b.id];
      let cur = b;
      while (ids.length < n && cur.parent) {
        cur = r.bones.find((x) => x.id === cur.parent);
        if (!cur) return null;
        ids.unshift(cur.id);
      }
      return ids.length === n ? ids : null;
    };
  return `<h4>骨骼：${rgEsc(b.name)}</h4><label>骨骼名稱<input class="text-input" aria-label="骨骼名稱" data-rg-field="bone-name" maxlength="40" value="${rgEsc(b.name)}"></label><div class="row">${rgNum("起點 X", "bone-x", b.x)}${rgNum("起點 Y", "bone-y", b.y)}</div><div class="row">${rgNum("骨長", "bone-length", b.length)}${rgNum("靜止角度（度）", "bone-angle", b.angle)}</div><div class="row">${rgNum("關節下限（度，空白＝不限）", "bone-min", b.min ?? "")}${rgNum("關節上限（度，空白＝不限）", "bone-max", b.max ?? "")}</div><p class="note">父骨</p><div class="flow-choices" role="group" aria-label="父骨">${rgB("無", "bone-parent:", { pressed: !b.parent })}${r.bones
    .filter((x) => x.id !== b.id)
    .map((x) =>
      rgB(x.name, "bone-parent:" + x.id, { pressed: b.parent === x.id }),
    )
    .join(
      "",
    )}</div><div class="row">${[2, 3, 4].map((n) => rgB(`以此骨為末端建立 ${n} 節 IK 鏈`, "chain-add:" + n, { disabled: !chainOf(n) })).join("")}${rgB("刪除骨骼", "bone-delete")}</div>`;
}
function rgChainsPanel() {
  const r = rg.rig;
  if (!r.chains.length)
    return '<p class="note">還沒有 IK 鏈：選一根末端骨骼後建立。</p>';
  return r.chains
    .map(
      (ch) =>
        `<div class="rg-chain"><b>${rgEsc(ch.name)}</b><span class="note">（${ch.bones.map((id) => rgEsc(r.bones.find((b) => b.id === id)?.name || "?")).join(" → ")}；${ch.bones.length === 2 ? "兩節解析解" : ch.bones.length > 2 ? "FABRIK" : "單節指向"}）</span><div class="row">${ch.bones.length === 2 ? rgB("手肘向內", "bend:" + ch.id + ":-1", { pressed: ch.bend === -1 }) + rgB("手肘向外", "bend:" + ch.id + ":1", { pressed: ch.bend !== -1 }) : ""}${rgB(ch.enabled === false ? "啟用 IK" : "停用 IK", "chain-toggle:" + ch.id, { pressed: ch.enabled === false })}${rgB("刪除 IK 鏈", "chain-delete:" + ch.id)}</div></div>`,
    )
    .join("");
}
function toolRigScreen(t) {
  if (!rg.ready) {
    rgBoot();
    return wfWrap(t, "<p>讀取角色…</p>");
  }
  const status = `<p class="cp-status" role="status" data-rg-status>${rgEsc(rg.status)}</p>`,
    c = rgChar();
  if (!c)
    return wfWrap(
      t,
      `<h3>角色綁定</h3><p class="note">用分層素材（頭、身體、上臂、前臂、手掌…）組成角色：樞紐、骨骼階層、IK、Puppet 網格與權重。動畫在「動畫合成」用角色圖層做關鍵影格與曲線，輸出透明影片回剪輯。</p><div class="row">${rgB("建立示範角色", "demo", { primary: true })}${rg.demoComp ? rgB("開啟示範動畫", "open-comp:" + rg.demoComp) : ""}</div>${status}<p class="note">選擇角色</p><div class="flow-choices">${rg.chars.map((x) => rgB(`${x.name || "未命名角色"}（綁定 ${(x.rigs || []).length} 個）`, "char:" + x.id)).join("") || '<span class="note">還沒有角色：到「角色」頁建立，或按「建立示範角色」。</span>'}</div>${rgCaps()}`,
    );
  if (!rg.rig)
    return wfWrap(
      t,
      `<div class="row">${rgB("所有角色", "chars")}<h3>${rgEsc(c.name || "未命名角色")}：綁定</h3></div><div class="row">${rgB("新增綁定", "rig-new", { primary: true })}${rg.demoComp ? rgB("開啟示範動畫", "open-comp:" + rg.demoComp) : ""}</div><div class="flow-choices">${(c.rigs || []).map((r) => rgB(`${r.name}・第 ${r.version} 版`, "rig-open:" + r.id)).join("")}</div>${status}${rgCaps()}`,
    );
  const r = rg.rig,
    part = rgPart(),
    bone = rgBone(),
    mode = RG_MODES.find((m) => m[0] === rg.mode);
  const heading = `<div class="row">${rgB("所有角色", "chars")}${rgB("此角色的綁定", "rigs")}<label>綁定名稱<input class="text-input" aria-label="綁定名稱" data-rg-field="rig-name" maxlength="60" value="${rgEsc(r.name)}"></label>${rgB(rg.dirty ? `儲存綁定（存成第 ${r.version + 1} 版）` : "儲存綁定", "save", { primary: rg.dirty })}<span class="note" data-rg-version>目前第 ${r.version} 版${rg.dirty ? "・未儲存" : ""}</span>${rg.demoComp ? rgB("開啟示範動畫", "open-comp:" + rg.demoComp) : ""}</div><div class="row"><div class="flow-choices" role="group" aria-label="編輯模式">${RG_MODES.map(([k, label]) => rgB(label, "mode:" + k, { pressed: rg.mode === k })).join("")}</div>${rgB(rg.skeleton ? "隱藏骨架" : "顯示骨架", "skeleton", { pressed: rg.skeleton })}</div><p class="note" data-rg-mode-note>${rgEsc(mode[2])}　畫布顯示靜止姿勢；骨架與網格線不會輸出。</p>${status}`;
  const left = `<aside class="cp-layers"><h3>部件</h3>${rgB("從素材庫匯入部件", "import")}<p class="note">清單最上面＝最上層。</p>${r.parts.map((p) => `<div class="cp-layer${p.id === rg.part ? " selected" : ""}">${rgB(p.name + (rgMeshOf(p) ? " ▦" : ""), "part:" + p.id, { pressed: p.id === rg.part })}</div>`).join("")}<h3>骨骼</h3>${r.bones.map((b) => `<div class="cp-layer${b.id === rg.bone ? " selected" : ""}">${rgB(b.name + (b.parent ? " ↳" : ""), "bone:" + b.id, { pressed: b.id === rg.bone })}</div>`).join("") || '<p class="note">用「建立骨骼」模式在畫布上拖出骨骼。</p>'}<h3>IK 鏈</h3>${rgChainsPanel()}</aside>`;
  const stage = `<section class="cp-stage"><div class="cp-canvas-wrap rg-canvas-wrap" style="aspect-ratio:${r.canvas.width}/${r.canvas.height}"><canvas data-rg-canvas width="${r.canvas.width}" height="${r.canvas.height}" aria-label="角色靜止姿勢"></canvas><canvas data-rg-overlay class="cp-overlay on" width="${r.canvas.width}" height="${r.canvas.height}" aria-label="骨架與網格（不會輸出）"></canvas></div><div class="row">${rgNum("畫布寬", "canvas-w", r.canvas.width)}${rgNum("畫布高", "canvas-h", r.canvas.height)}</div></section>`;
  const test = `<h4>測試姿勢（只用來檢查綁定，動畫請到動畫合成）</h4>${r.bones.map((b) => rgNum(`測試・${b.name} 旋轉（度）`, "test:" + b.id, r.testPose.rot[b.id] ?? 0)).join("")}`;
  const inspector = `<aside class="cp-inspector">${part ? rgPartPanel(part) : ""}${bone ? rgBonePanel(bone) : ""}${!part && !bone ? '<p class="note">在左側選一個部件或骨骼。</p>' : ""}${test}</aside>`;
  return wfWrap(
    t,
    `${heading}<div class="cp-workspace">${left}${stage}${inspector}</div>${rgCaps()}`,
  );
}
function toolRigAfterRender() {
  rgPaint().catch(VideoWorkbench.reportError);
}
const rgTestValues = (r) => ({ rot: { ...r.testPose.rot }, ik: {}, pins: {} });
async function rgPaint() {
  const r = rg.rig,
    canvas = document.querySelector("[data-rg-canvas]");
  if (!r || !canvas || typeof cpMediaEntry !== "function") return;
  await rgImages(r);
  if (rg.rig !== r || !canvas.isConnected) return;
  const c = canvas.getContext("2d");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  const rest = { rot: {}, ik: {}, pins: {} },
    out = Rig.draw(c, r, rest, rgImageFn());
  canvas.dataset.rgVersion = String(r.version) + (rg.dirty ? "*" : "");
  rgPaintOverlay(out.solved);
  for (const el of document.querySelectorAll("[data-rg-compare]")) {
    const x = el.getContext("2d"),
      mesh = rgMeshOf(rgPart());
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, el.width, el.height);
    const auto = mesh && Rig.autoWeights(Rig.restVerts(mesh, rgPart()), r);
    Rig.draw(x, r, rgTestValues(r), rgImageFn(), {
      weights: (m) =>
        el.dataset.rgCompare === "auto" && m === mesh ? auto : undefined,
    });
  }
}
function rgPaintOverlay(solved) {
  const canvas = document.querySelector("[data-rg-overlay]"),
    r = rg.rig;
  if (!canvas) return;
  const c = canvas.getContext("2d"),
    accent = rgToken("--accent", "#4f7cff"),
    text = rgToken("--text-primary", "#ffffff");
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  const part = rgPart(),
    mesh = rgMeshOf(part);
  if (part) {
    c.strokeStyle = accent;
    c.setLineDash([6, 4]);
    c.lineWidth = 2;
    c.strokeRect(part.x, part.y, part.width, part.height);
    c.setLineDash([]);
  }
  if (mesh) {
    const v = Rig.restVerts(mesh, part);
    if (rg.heat && mesh.skin && rg.weightBone) {
      const W =
        Array.isArray(mesh.weights) && mesh.weights.length === v.length
          ? mesh.weights
          : Rig.autoWeights(v, r);
      c.fillStyle = accent;
      for (const [a, b, d] of mesh.triangles) {
        c.globalAlpha = Math.min(
          0.85,
          (((W[a][rg.weightBone] || 0) +
            (W[b][rg.weightBone] || 0) +
            (W[d][rg.weightBone] || 0)) /
            3) *
            0.85,
        );
        c.beginPath();
        c.moveTo(...v[a]);
        c.lineTo(...v[b]);
        c.lineTo(...v[d]);
        c.closePath();
        c.fill();
      }
      c.globalAlpha = 1;
    }
    c.strokeStyle = text;
    c.globalAlpha = 0.35;
    c.lineWidth = 1;
    c.beginPath();
    for (const [a, b, d] of mesh.triangles) {
      c.moveTo(...v[a]);
      c.lineTo(...v[b]);
      c.lineTo(...v[d]);
      c.closePath();
    }
    c.stroke();
    c.globalAlpha = 1;
    for (const p of mesh.pins) {
      c.beginPath();
      c.arc(
        part.x + p.x * part.width,
        part.y + p.y * part.height,
        p.id === rg.pin ? 9 : 7,
        0,
        Math.PI * 2,
      );
      c.fillStyle = p.id === rg.pin ? accent : text;
      c.fill();
    }
  }
  if (rg.skeleton) rgDrawBones(c, r, solved, { selected: rg.bone });
}
// Weight brush at a rig-space point (pointer drag and tests call the same).
function rgPaintAt(x, y) {
  const part = rgPart(),
    mesh = rgMeshOf(part);
  if (!mesh?.skin) throw Error("請先選取已蒙皮的網格部件");
  if (!rg.weightBone) throw Error("請先選筆刷骨骼");
  const n = Rig.paintWeights(mesh, Rig.restVerts(mesh, part), rg.rig, {
    x,
    y,
    radius: rg.brush.radius,
    bone: rg.weightBone,
    strength: rg.brush.strength,
    mode: rg.brush.mode,
  });
  if (n) rgTouch();
  return n;
}
async function rgImport() {
  const rows = await VideoWorkbench.pickAssets({
    kind: "image",
    multiple: true,
    limit: 20,
  });
  for (const a of rows || []) {
    if (!VideoWorkbench.safeUrl(a.url)) continue;
    const part = {
      id: rgId("T"),
      name: String(a.name || "部件").slice(0, 40),
      assetId: a.id,
      url: a.url,
      previewUrl: a.previewUrl || a.url,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      bone: null,
    };
    const e = cpMediaEntry(rgAsLayer(part), "output");
    if (await e.ready) {
      const fit = Math.min(
        1,
        (rg.rig.canvas.width * 0.8) / (e.el.naturalWidth || 100),
        (rg.rig.canvas.height * 0.8) / (e.el.naturalHeight || 100),
      );
      part.width = Math.round((e.el.naturalWidth || 100) * fit);
      part.height = Math.round((e.el.naturalHeight || 100) * fit);
      part.x = Math.round((rg.rig.canvas.width - part.width) / 2);
      part.y = Math.round((rg.rig.canvas.height - part.height) / 2);
    }
    rg.rig.parts.unshift(part);
    rg.part = part.id;
  }
  if (rows?.length) rgTouch();
}
async function rgAction(action) {
  const [name, ...rest] = action.split(":"),
    arg = rest.join(":"),
    r = rg.rig;
  if (name === "demo") {
    rg.status = "建立中…";
    render();
    await rgDemo();
    return render();
  }
  if (name === "open-comp") {
    await cpLoad();
    cpOpen(arg);
    cp.layer = cp.doc.layers.find((l) => l.kind === "rig")?.id || cp.layer;
    tool = "compose";
    setToolHash("#compose");
    return render();
  }
  if (name === "chars") {
    if (rg.dirty && !confirm("有未儲存的綁定修改，確定離開？")) return;
    rg.charId = null;
    rg.rig = null;
    rg.dirty = false;
    return render();
  }
  if (name === "char") {
    rg.charId = arg;
    rg.rig = null;
    return render();
  }
  if (name === "rigs") {
    if (rg.dirty && !confirm("有未儲存的綁定修改，確定離開？")) return;
    rg.rig = null;
    rg.dirty = false;
    return render();
  }
  if (name === "rig-new" || name === "rig-open") {
    const found = rgChar().rigs?.find((x) => x.id === arg);
    rg.rig = rgNormalize(
      found || { name: "綁定 " + ((rgChar().rigs || []).length + 1) },
    );
    rg.dirty = !found;
    rg.part = rg.rig.parts[0]?.id || null;
    rg.bone = null;
    rg.pin = null;
    rg.weightBone = rg.rig.bones[0]?.id || null;
    return render();
  }
  if (!r) return;
  if (name === "save") {
    await rgSave();
    rg.status = "已儲存綁定第 " + rg.rig.version + " 版";
    return render();
  }
  if (name === "import") await rgImport();
  else if (name === "mode") rg.mode = arg;
  else if (name === "skeleton") rg.skeleton = !rg.skeleton;
  else if (name === "heat") rg.heat = !rg.heat;
  else if (name === "part") {
    rg.part = arg;
    rg.pin = null;
  } else if (name === "bone") rg.bone = rg.bone === arg ? null : arg;
  else if (name === "brush") rg.brush.mode = arg;
  else if (name === "weight-bone") rg.weightBone = arg;
  else if (name === "pin") rg.pin = arg;
  else {
    const part = rgPart(),
      bone = rgBone(),
      mesh = rgMeshOf(part);
    if (name.startsWith("part-") && part) {
      const i = r.parts.indexOf(part);
      if (name === "part-bone") part.bone = arg || null;
      if (name === "part-up" && i > 0)
        [r.parts[i - 1], r.parts[i]] = [r.parts[i], r.parts[i - 1]];
      if (name === "part-down" && i < r.parts.length - 1)
        [r.parts[i + 1], r.parts[i]] = [r.parts[i], r.parts[i + 1]];
      if (name === "part-hide") part.hidden = !part.hidden;
      if (name === "part-delete") {
        r.parts.splice(i, 1);
        r.meshes = r.meshes.filter((m) => m.partId !== part.id);
        rg.part = null;
      }
    } else if (name === "mesh" && part) {
      const built = Rig.buildMesh(
        part.width,
        part.height,
        arg,
        await rgAlpha(part),
      );
      if (!built.triangles.length)
        throw Error("這張圖片沒有不透明的範圍，無法建立網格");
      const next = {
        id: mesh?.id || rgId("M"),
        partId: part.id,
        ...built,
        skin: !!mesh?.skin,
        weights: null,
        pins: (mesh?.pins || []).filter(
          (p) => p.x <= 1 && p.y <= 1,
        ),
      };
      r.meshes = [...r.meshes.filter((m) => m.partId !== part.id), next];
    } else if (name === "mesh-remove" && part)
      r.meshes = r.meshes.filter((m) => m.partId !== part.id);
    else if (name === "skin" && mesh) mesh.skin = !mesh.skin;
    else if (name === "weights-reset" && mesh) {
      mesh.weights = Rig.autoWeights(Rig.restVerts(mesh, part), r);
      mesh.weightsEdited = false;
    } else if (name === "pin-delete" && mesh) {
      mesh.pins = mesh.pins.filter((p) => p.id !== arg);
      if (rg.pin === arg) rg.pin = null;
    } else if (name === "pin-bone" && mesh) {
      const [pinId, boneId] = arg.split(":"),
        pin = mesh.pins.find((p) => p.id === pinId);
      if (pin) pin.bone = boneId || null;
    } else if (name.startsWith("bone-") && bone) {
      if (name === "bone-parent") {
        let cur = arg ? r.bones.find((b) => b.id === arg) : null;
        while (cur) {
          if (cur.id === bone.id) throw Error("不能設為父骨：會形成循環");
          cur = r.bones.find((b) => b.id === cur.parent);
        }
        bone.parent = arg || null;
      }
      if (name === "bone-delete") {
        r.bones = r.bones.filter((b) => b.id !== bone.id);
        for (const b of r.bones)
          if (b.parent === bone.id) b.parent = bone.parent;
        for (const p of r.parts) if (p.bone === bone.id) p.bone = bone.parent;
        r.chains = r.chains.filter((ch) => !ch.bones.includes(bone.id));
        for (const m of r.meshes) {
          for (const p of m.pins) if (p.bone === bone.id) p.bone = null;
          if (Array.isArray(m.weights)) m.weights = null;
        }
        delete r.testPose.rot[bone.id];
        rg.bone = null;
      }
    } else if (name === "chain-add" && bone) {
      const ids = [bone.id];
      let cur = bone;
      while (ids.length < Number(arg) && cur.parent) {
        cur = r.bones.find((b) => b.id === cur.parent);
        ids.unshift(cur.id);
      }
      if (ids.length !== Number(arg)) throw Error("父骨不足 " + arg + " 節");
      r.chains.push({
        id: rgId("K"),
        name: "IK 鏈 " + (r.chains.length + 1),
        bones: ids,
        bend: 1,
        enabled: true,
      });
    } else if (name === "bend") {
      const [id, v] = arg.split(":"),
        ch = r.chains.find((x) => x.id === id);
      if (ch) ch.bend = Number(v) < 0 ? -1 : 1;
    } else if (name === "chain-toggle") {
      const ch = r.chains.find((x) => x.id === arg);
      if (ch) ch.enabled = ch.enabled === false;
    } else if (name === "chain-delete")
      r.chains = r.chains.filter((x) => x.id !== arg);
    else return;
    rgTouch();
  }
  render();
}
function rgField(el) {
  const r = rg.rig,
    f = el.dataset.rgField,
    v = el.value,
    n = Number(v),
    numOk = v.trim() !== "" && Number.isFinite(n),
    part = rgPart(),
    bone = rgBone();
  if (!r) return;
  if (f === "rig-name") r.name = String(v).slice(0, 60) || "綁定";
  else if (f === "canvas-w" || f === "canvas-h") {
    if (numOk)
      r.canvas[f === "canvas-w" ? "width" : "height"] = Math.max(
        16,
        Math.min(4096, Math.round(n)),
      );
  } else if (f.startsWith("test:")) r.testPose.rot[f.slice(5)] = numOk ? n : 0;
  else if (f === "brush-strength")
    rg.brush.strength = numOk ? Math.max(0, Math.min(1, n)) : rg.brush.strength;
  else if (f === "brush-radius")
    rg.brush.radius = numOk ? Math.max(1, n) : rg.brush.radius;
  else if (f.startsWith("part-") && part) {
    if (f === "part-name") part.name = String(v).slice(0, 40) || "部件";
    else if (numOk)
      part[
        { "part-x": "x", "part-y": "y", "part-w": "width", "part-h": "height" }[
          f
        ]
      ] = f === "part-w" || f === "part-h" ? Math.max(1, n) : n;
  } else if (f.startsWith("bone-") && bone) {
    if (f === "bone-name") bone.name = String(v).slice(0, 40) || "骨骼";
    else if (f === "bone-min" || f === "bone-max")
      bone[f.slice(5)] = numOk ? n : null;
    else if (numOk)
      bone[
        {
          "bone-x": "x",
          "bone-y": "y",
          "bone-length": "length",
          "bone-angle": "angle",
        }[f]
      ] = f === "bone-length" ? Math.max(1, n) : n;
  } else return;
  if (!f.startsWith("brush-")) rgTouch();
  render();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-rg-action]");
  if (!b || b.disabled) return;
  e.preventDefault();
  rgAction(b.dataset.rgAction).catch((error) => {
    rg.status = error.message;
    const box = document.querySelector("[data-rg-status]");
    if (box) box.textContent = error.message;
    VideoWorkbench.reportError(error);
  });
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (!el.closest?.('[data-tool-flow="rig"]') || !el.dataset.rgField) return;
  try {
    rgField(el);
  } catch (error) {
    VideoWorkbench.reportError(error);
  }
});
// Canvas editing in rig space (rest pose). Each gesture changes the working copy; 儲存綁定 makes it a version.
function rgPointer(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  return [
    ((ev.clientX - rect.left) * canvas.width) / rect.width,
    ((ev.clientY - rect.top) * canvas.height) / rect.height,
  ];
}
function rgSetPivot(b, p) {
  const tail = Rig.tailOf(b);
  b.x = Math.round(p[0] * 10) / 10;
  b.y = Math.round(p[1] * 10) / 10;
  const len = Math.hypot(tail[0] - b.x, tail[1] - b.y);
  if (len > 1) {
    b.length = Math.round(len * 10) / 10;
    b.angle =
      Math.round((Math.atan2(tail[1] - b.y, tail[0] - b.x) / Rig.RAD) * 10) /
      10;
  }
}
function rgAddBone(from, to) {
  const r = rg.rig,
    len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (len < 5) return null;
  const b = {
    id: rgId("B"),
    name: "骨骼 " + (r.bones.length + 1),
    parent: rg.bone || null,
    x: Math.round(from[0] * 10) / 10,
    y: Math.round(from[1] * 10) / 10,
    angle:
      Math.round(
        (Math.atan2(to[1] - from[1], to[0] - from[0]) / Rig.RAD) * 10,
      ) / 10,
    length: Math.round(len * 10) / 10,
    min: null,
    max: null,
  };
  r.bones.push(b);
  rg.bone = b.id;
  rg.weightBone ||= b.id;
  rgTouch();
  return b;
}
function rgAddPin(p) {
  const part = rgPart(),
    mesh = rgMeshOf(part);
  if (!mesh) throw Error("請先選取部件並建立網格");
  const x = p[0] - part.x,
    y = p[1] - part.y;
  if (x < 0 || y < 0 || x > part.width || y > part.height) return null;
  const pin = {
    id: rgId("N"),
    x: Math.round((x / part.width) * 1e4) / 1e4,
    y: Math.round((y / part.height) * 1e4) / 1e4,
    bone: null,
  };
  mesh.pins.push(pin);
  rg.pin = pin.id;
  rgTouch();
  return pin;
}
document.addEventListener("pointerdown", (e) => {
  const canvas = e.target.closest?.("[data-rg-overlay]");
  if (!canvas || !rg.rig) return;
  e.preventDefault();
  const start = rgPointer(canvas, e),
    r = rg.rig;
  let last = start,
    part = rgPart(),
    pin = null;
  if (rg.mode === "move") {
    // the topmost part under the pointer (rest pose), else the selected one
    part =
      r.parts.find(
        (p) =>
          !p.hidden &&
          start[0] >= p.x &&
          start[0] <= p.x + p.width &&
          start[1] >= p.y &&
          start[1] <= p.y + p.height,
      ) || part;
    if (part) rg.part = part.id;
  }
  if (rg.mode === "pin") {
    const mesh = rgMeshOf(part);
    if (!mesh) return;
    pin =
      mesh.pins.find(
        (p) =>
          Math.hypot(
            part.x + p.x * part.width - start[0],
            part.y + p.y * part.height - start[1],
          ) < 12,
      ) || null;
    if (!pin) {
      rgAddPin(start);
      return render();
    }
    rg.pin = pin.id;
  }
  if (rg.mode === "weight") {
    try {
      rgPaintAt(...start);
    } catch (error) {
      rg.status = error.message;
      return render();
    }
  }
  canvas.setPointerCapture(e.pointerId);
  canvas.onpointermove = (ev) => {
    const p = rgPointer(canvas, ev);
    if (rg.mode === "move" && part) {
      part.x = Math.round((part.x + p[0] - last[0]) * 10) / 10;
      part.y = Math.round((part.y + p[1] - last[1]) * 10) / 10;
      rgTouch();
    } else if (rg.mode === "pivot") {
      const b = rgBone() || r.bones.find((x) => x.id === part?.bone);
      if (b) (rgSetPivot(b, p), rgTouch());
    } else if (rg.mode === "pin" && pin) {
      pin.x = Math.round(((p[0] - part.x) / part.width) * 1e4) / 1e4;
      pin.y = Math.round(((p[1] - part.y) / part.height) * 1e4) / 1e4;
      rgTouch();
    } else if (rg.mode === "weight") rgPaintAt(...p);
    last = p;
    if (rg.mode !== "bone") rgPaint().catch(VideoWorkbench.reportError);
  };
  canvas.onpointerup = canvas.onpointercancel = (ev) => {
    canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null;
    if (rg.mode === "bone") rgAddBone(start, rgPointer(canvas, ev));
    render();
  };
});
// A page opened at #rig is drawn again by tools-compositor.js (loaded next, the last tools script).
