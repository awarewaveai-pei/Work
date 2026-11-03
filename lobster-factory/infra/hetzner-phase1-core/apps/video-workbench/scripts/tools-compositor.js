// Card P3 (handoff §4.3 動態字幕／片頭動畫, §4.5): the 動畫合成 workspace. Layer list | canvas + transport + mini
// timeline | inspector. The canvas is drawn by Compositor.renderFrame (shared/compositor.js); output renders every
// frame with the same function on the same canvas and streams PNGs to backend/compositor-render.cjs, so the preview
// of frame N is the output's frame N. Compositions live in the server ledger (SeedStar.compositions), with a
// revision and the last 20 previous revisions. Visible buttons only, no <select>.
const cp = {
  ready: false,
  loading: null,
  list: [],
  doc: null,
  dirty: false,
  layer: null,
  prop: "x",
  key: null,
  frame: 0,
  playing: false,
  tab: "屬性",
  clipboard: null,
  linear: true,
  render: null,
  status: "",
  report: null,
  media: new Map(),
  fonts: new Map(),
  paintToken: 0,
};
const CP_FONTS = [
  ["Microsoft JhengHei", "微軟正黑體"],
  ["PMingLiU", "新細明體"],
  ["Arial", "Arial"],
  ["Georgia", "Georgia"],
  ["Consolas", "Consolas"],
];
const CP_LABEL = {
  x: "位置 X",
  y: "位置 Y",
  scale: "縮放",
  rotation: "旋轉（度）",
  anchorX: "錨點 X",
  anchorY: "錨點 Y",
  opacity: "不透明度",
  fontSize: "字級",
  color: "顏色",
  highlightColor: "高亮顏色",
  width: "寬",
  height: "高",
  fill: "填色",
  strokeWidth: "外框粗細",
  strokeColor: "外框顏色",
  maskX: "遮罩 X",
  maskY: "遮罩 Y",
  maskWidth: "遮罩寬",
  maskHeight: "遮罩高",
  feather: "羽化（px）",
  expansion: "擴張（px，負值收縮）",
  radius: "半徑（px）",
  strength: "強度（0–1）",
  brightness: "亮度",
  contrast: "對比",
  saturation: "飽和度",
  distance: "距離（px）",
  angle: "角度（度）",
  blur: "模糊（px）",
};
const CP_KIND = {
  video: "影片",
  image: "圖片",
  text: "文字",
  shape: "形狀",
  null: "控制器",
  rig: "角色",
};
const cpEsc = (v) =>
  typeof esc === "function"
    ? esc(v)
    : String(v ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const cpB = (
  label,
  action,
  { disabled = false, pressed, primary = false } = {},
) =>
  `<button type="button" class="btn small${primary ? " primary" : ""}${pressed ? " selected" : ""}" data-cp-action="${cpEsc(action)}"${pressed === undefined ? "" : ` aria-pressed="${!!pressed}"`}${disabled ? " disabled" : ""}>${cpEsc(label)}</button>`;
const cpFps = (doc) => doc.timebase.num / doc.timebase.den;
const cpLayer = () => cp.doc?.layers.find((l) => l.id === cp.layer) || null;
const cpRid = () => Math.random().toString(36).slice(2, 10);

// ---- data -------------------------------------------------------------------------------------------------
async function cpLoad() {
  cp.list = (await SeedStar.compositions.list()).map((c) =>
    Compositor.normalize(c),
  );
  // Card P4: rig layers draw from the characters' rigs (scripts/tools-rig.js).
  if (typeof rgLoad === "function") await rgLoad();
  cp.ready = true;
}
function cpBoot() {
  if (cp.ready || cp.loading) return cp.loading;
  cp.loading = cpLoad()
    .then(() => {
      if (tool === "compose" || tool === "edit") render();
    })
    .catch(SeedStar.reportError)
    .finally(() => (cp.loading = null));
  return cp.loading;
}
function cpOpen(id) {
  const found = cp.list.find((c) => c.id === id);
  if (!found) throw Error("找不到合成");
  cp.doc = Compositor.normalize(found);
  cp.dirty = false;
  cp.layer = cp.doc.layers[0]?.id || null;
  cp.prop = "x";
  cp.key = null;
  cp.frame = Math.min(cp.frame, cp.doc.durationFrames - 1);
}
const cpStrip = (c) => {
  const { history, ...rest } = structuredClone(c);
  return rest;
};
// Saving = new revision; the saved copy it replaces goes to the front of history (last 20 kept).
async function cpSave() {
  const doc = cp.doc,
    saved = cp.list.find((c) => c.id === doc.id);
  const next = {
    ...cpStrip(doc),
    revision: (saved?.revision || 0) + 1,
    history: saved ? [cpStrip(saved), ...saved.history].slice(0, 20) : [],
    updatedAt: new Date().toISOString(),
  };
  await SeedStar.compositions.save(next);
  const normal = Compositor.normalize(next);
  cp.list = [...cp.list.filter((c) => c.id !== doc.id), normal];
  cp.doc = Compositor.normalize(next);
  cp.dirty = false;
  return cp.doc;
}
// 還原上一版: the newest history entry becomes current (as a new revision); the current copy takes its place.
async function cpRestore() {
  const saved = cp.list.find((c) => c.id === cp.doc.id);
  if (!saved?.history.length) throw Error("沒有上一版");
  const [previous, ...rest] = saved.history;
  const next = {
    ...previous,
    id: saved.id,
    revision: saved.revision + 1,
    history: [cpStrip(saved), ...rest].slice(0, 20),
    updatedAt: new Date().toISOString(),
  };
  await SeedStar.compositions.save(next);
  cp.list = [
    ...cp.list.filter((c) => c.id !== saved.id),
    Compositor.normalize(next),
  ];
  cp.doc = Compositor.normalize(next);
  cp.dirty = false;
  if (!cp.doc.layers.some((l) => l.id === cp.layer))
    cp.layer = cp.doc.layers[0]?.id || null;
}
function cpTouch() {
  cp.dirty = true;
}
// Property address: "x" (layer), "mask.feather", "fx.<effectId>.radius".
function cpRef(layer, path) {
  if (path.startsWith("mask.")) {
    const name = path.slice(5);
    layer.mask.props ||= {};
    return { group: layer.mask.props, name, def: Compositor.MASK_PROPS[name] };
  }
  if (path.startsWith("fx.")) {
    const [, id, name] = path.split(".");
    const fx = layer.effects.find((f) => f.id === id);
    if (!fx) return null;
    fx.props ||= {};
    return {
      group: fx.props,
      name,
      def: Compositor.EFFECTS[fx.type].props[name],
    };
  }
  return {
    group: layer.props,
    name: path,
    def:
      Compositor.LAYER_PROPS[path] ?? Compositor.KIND_PROPS[layer.kind]?.[path],
  };
}
function cpP(layer, path) {
  const ref = layer && cpRef(layer, path);
  if (!ref) return null;
  return (ref.group[ref.name] ||= { value: ref.def });
}
const cpExists = (layer, path) =>
  !!layer &&
  (path.startsWith("mask.")
    ? !!layer.mask
    : path.startsWith("fx.")
      ? layer.effects.some((f) => f.id === path.split(".")[1])
      : true);

// ---- title template ---------------------------------------------------------------------------------------
// The acceptance case (handoff P3): editable title, background shape, mask wipe on the title, ease-in-out keys,
// a 濾色 (screen) glow shape and a wiggle() expression on a decorative shape.
function cpTemplate() {
  const L = Compositor.newLayer,
    P = (value) => ({ value }),
    id = "C" + cpRid();
  const glow = L("shape", {
    id: "L" + cpRid(),
    name: "光暈",
    shape: "ellipse",
    blend: "screen",
  });
  Object.assign(glow.props, {
    x: P(960),
    y: P(540),
    anchorX: P(450),
    anchorY: P(110),
    width: P(900),
    height: P(220),
    fill: P("#ff9f43"),
    opacity: P(0.55),
  });
  glow.effects = [
    {
      id: "fx" + cpRid(),
      type: "blur",
      bypass: false,
      props: { radius: P(40) },
    },
  ];
  const title = L("text", {
    id: "L" + cpRid(),
    name: "標題",
    text: "片頭標題",
    font: "Microsoft JhengHei",
    bold: true,
    align: "center",
  });
  Object.assign(title.props, {
    x: P(960),
    y: P(540),
    anchorY: P(60),
    fontSize: P(120),
    color: P("#ffffff"),
    opacity: {
      value: 1,
      keys: [
        { frame: 0, value: 0, ease: "ease-in-out" },
        { frame: 20, value: 1, ease: "linear" },
      ],
    },
    scale: {
      value: 1,
      keys: [
        { frame: 0, value: 0.85, ease: "bezier", bezier: [0.2, 0.8, 0.2, 1] },
        { frame: 30, value: 1, ease: "linear" },
      ],
    },
  });
  title.mask = {
    enabled: true,
    shape: "rect",
    inverted: false,
    props: {
      maskX: P(-760),
      maskY: P(-30),
      maskWidth: {
        value: 1520,
        keys: [
          { frame: 0, value: 0, ease: "ease-in-out" },
          { frame: 30, value: 1520, ease: "linear" },
        ],
      },
      maskHeight: P(200),
      feather: P(24),
      expansion: P(0),
    },
  };
  const deco = L("shape", { id: "L" + cpRid(), name: "裝飾", shape: "rect" });
  Object.assign(deco.props, {
    x: P(960),
    y: P(705),
    anchorX: P(200),
    anchorY: P(4),
    width: P(400),
    height: P(8),
    fill: P("#ffd166"),
    rotation: { value: 0, expr: "wiggle(2, 6)" },
  });
  const bg = L("shape", { id: "L" + cpRid(), name: "背景", shape: "rect" });
  Object.assign(bg.props, {
    x: P(960),
    y: P(540),
    anchorX: P(800),
    anchorY: P(150),
    width: P(1600),
    height: P(300),
    fill: P("#1d2a44"),
    opacity: P(0.85),
  });
  return Compositor.normalize({
    id,
    title: "片頭範本",
    width: 1920,
    height: 1080,
    timebase: { num: 30, den: 1 },
    durationFrames: 90,
    background: "transparent",
    layers: [glow, title, deco, bg],
    revision: 0,
    history: [],
  });
}

// ---- fonts and media ------------------------------------------------------------------------------------------
// A family counts as present only if text set in it measures differently from every generic fallback: canvas
// would otherwise draw a fallback silently, which output must not do.
function cpFontAvailable(family) {
  if (cp.fonts.has(family)) return cp.fonts.get(family);
  const c = document.createElement("canvas").getContext("2d"),
    sample = "mmmmmmmmmmlli WQ 永和體",
    safe = String(family).replace(/["\\]/g, "");
  let found = false;
  for (const base of ["monospace", "serif", "sans-serif"]) {
    c.font = "72px " + base;
    const w0 = c.measureText(sample).width;
    c.font = `72px "${safe}", ${base}`;
    if (c.measureText(sample).width !== w0) found = true;
  }
  cp.fonts.set(family, found);
  return found;
}
const cpFontList = () => [
  ...new Map([
    ...CP_FONTS,
    ...[...(document.fonts || [])].map((f) => [
      f.family.replace(/^"|"$/g, ""),
      f.family.replace(/^"|"$/g, ""),
    ]),
  ]).entries(),
];
// Awaits every used family + text (document.fonts.load), then returns the families that are still missing.
async function cpFonts(doc) {
  const missing = new Set();
  for (const l of doc.layers.filter((l) => l.kind === "text")) {
    const size = Number(Compositor.valueAt(l.props.fontSize, 0)) || 72,
      text = [l.text, ...(l.words || []).map((w) => w.text)].join("");
    try {
      await document.fonts.load(Compositor.fontString(l, size), text || "字");
    } catch (_) {}
    if (!cpFontAvailable(l.font || "")) missing.add(l.font || "（未指定）");
  }
  return [...missing];
}
// mode "preview" decodes the browser proxy (fast); "output" decodes the asset's original, so a 4K source renders
// at source detail (review 2026-11-03 #1). Layers store both: url = original, previewUrl = proxy.
const cpSrc = (layer, mode) =>
  (mode === "output" ? layer.url : layer.previewUrl || layer.url) || "";
function cpMediaEntry(layer, mode = "preview") {
  const url = cpSrc(layer, mode);
  if (!url) return null;
  const key = layer.kind + ":" + url;
  if (cp.media.has(key)) return cp.media.get(key);
  const el = document.createElement(layer.kind === "video" ? "video" : "img");
  const entry = { el, ready: null, ok: false };
  entry.ready = new Promise((resolve) => {
    const done = (ok) => {
      entry.ok = ok;
      resolve(ok);
    };
    if (layer.kind === "video") {
      el.muted = true;
      el.preload = "auto";
      el.playsInline = true;
      el.onloadeddata = () => done(true);
    } else el.onload = () => done(true);
    el.onerror = () => done(false);
    setTimeout(() => done(entry.ok), 20000);
  });
  el.src = url;
  cp.media.set(key, entry);
  return entry;
}
// Before a frame is drawn: media decoded and each video seeked to its exact source time (renderFrame is sync).
async function cpPrepare(doc, frame, mode = "preview") {
  for (const l of doc.layers) {
    if (l.kind === "rig" && typeof rgPrepare === "function") {
      await rgPrepare(l, mode);
      continue;
    }
    if (l.kind !== "image" && l.kind !== "video") continue;
    const entry = cpMediaEntry(l, mode);
    if (!entry || !(await entry.ready) || l.kind !== "video") continue;
    const v = entry.el,
      t = Math.max(
        0,
        (frame - (l.inFrame || 0)) / cpFps(doc) +
          (Number(l.sourceStart) || 0) +
          0.5 / cpFps(doc),
      ),
      target = Math.min(t, Math.max(0, (v.duration || t) - 0.001));
    if (Math.abs(v.currentTime - target) > 1e-4 || v.seeking)
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000);
        v.addEventListener("seeked", () => (clearTimeout(timer), resolve()), {
          once: true,
        });
        v.currentTime = target;
      });
  }
}
const cpResources = (mode = "preview") => ({
  createCanvas: (w, h) =>
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), {
          width: w,
          height: h,
        }),
  media: (layer) => {
    const e = cp.media.get(layer.kind + ":" + cpSrc(layer, mode));
    return e?.ok ? e.el : null;
  },
  rig: (layer) =>
    typeof rgResource === "function" ? rgResource(layer, mode) : null,
});
// Output/still drawing: originals only, and a frame that misses any layer's media is an error, not a gap (review #5).
async function cpDraw(canvas, doc, frame) {
  await cpPrepare(doc, frame, "output");
  const report = Compositor.renderFrame(
    canvas.getContext("2d"),
    doc,
    frame,
    cpResources("output"),
  );
  if (report.missingMedia.length)
    throw Error("缺少素材：" + report.missingMedia.join("、"));
  return report;
}
// Every media layer's original must decode in this browser before output starts (HEVC, ProRes ... do not).
async function cpOutputMedia(doc) {
  if (typeof rgOutputMedia === "function") await rgOutputMedia(doc);
  for (const l of doc.layers.filter(
    (x) => (x.kind === "image" || x.kind === "video") && x.visible && x.url,
  )) {
    const entry = cpMediaEntry(l, "output");
    if (await entry.ready) continue;
    const preview =
      l.previewUrl && l.previewUrl !== l.url
        ? await cpMediaEntry(l, "preview").ready
        : false;
    throw Error(
      preview
        ? `圖層「${l.name}」的原始素材無法在瀏覽器解碼（例如 HEVC、ProRes），不能用原畫質輸出；請先轉成 H.264／VP9 或 PNG 再放入`
        : "缺少素材：" + l.name,
    );
  }
}
// Preview: latest request wins; output owns the canvas while it runs.
async function cpPaint() {
  const canvas = document.querySelector("[data-cp-canvas]");
  if (!canvas || !cp.doc || cp.render) return;
  const token = ++cp.paintToken,
    doc = cp.doc,
    frame = cp.frame;
  await cpFonts(doc);
  if (token !== cp.paintToken) return;
  await cpPrepare(doc, frame, "preview");
  if (token !== cp.paintToken || !canvas.isConnected) return;
  cp.report = Compositor.renderFrame(
    canvas.getContext("2d"),
    doc,
    frame,
    cpResources(),
  );
  canvas.dataset.cpFrame = String(frame);
  canvas.dataset.cpRevision = String(doc.revision) + (cp.dirty ? "*" : "");
  cpShowErrors();
  // Card P4: the skeleton overlay is its own canvas above this one; it never reaches the output.
  if (typeof rgCpOverlay === "function") rgCpOverlay(doc, frame);
}
function cpShowErrors() {
  const errors = cp.report?.errors || new Map();
  document.querySelectorAll("[data-cp-err]").forEach((el) => {
    const compileError = el.dataset.cpCompile
        ? JSON.parse(el.dataset.cpCompile)
        : null,
      e = compileError || errors.get(el.dataset.cpErr);
    el.textContent = e
      ? `第 ${e.column} 字：${e.message}（此屬性改用關鍵影格的值）`
      : "";
  });
  const media = document.querySelector("[data-cp-missing-media]");
  if (media)
    media.textContent = cp.report?.missingMedia?.length
      ? "無法載入素材：" + cp.report.missingMedia.join("、")
      : "";
}

// ---- output ---------------------------------------------------------------------------------------------
const cpSources = (doc) => {
  const media = doc.layers.filter(
    (l) => (l.kind === "image" || l.kind === "video") && l.assetId,
  );
  const rigIds = typeof rgSourceIds === "function" ? rgSourceIds(doc) : [];
  return {
    parentAssetId: media[0]?.assetId || rigIds[0],
    sourceAssetIds: [...new Set([...media.map((l) => l.assetId), ...rigIds])],
  };
};
// Updated in place (a full render() would replace the canvas the output is drawing on): progress text, the
// 取消輸出 button while a render runs, and the output buttons disabled meanwhile (review 2026-11-03 #6).
function cpProgress() {
  const box = document.querySelector("[data-cp-progress]");
  if (!box) return;
  box.textContent = cp.render
    ? `輸出中 ${cp.render.done}／${cp.render.total} 格（輸出時請勿關閉此頁）`
    : "";
  const controls = document.querySelector("[data-cp-render-controls]");
  if (controls && !!controls.firstChild !== !!cp.render) {
    controls.replaceChildren();
    if (cp.render) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn small";
      b.dataset.cpAction = "cancel";
      b.textContent = "取消輸出";
      controls.append(b);
    }
  }
  for (const action of ["output", "place", "still"]) {
    const b = document.querySelector(`[data-cp-action="${action}"]`);
    if (b) b.disabled = !!cp.render;
  }
}
// Renders the saved composition to a PNG MOV asset. canvas: the visible preview canvas when the workspace is open.
async function cpRenderOutput(doc, canvas) {
  if (cp.render) throw Error("正在輸出另一個合成");
  const missing = await cpFonts(doc);
  if (missing.length) throw Error("缺少字型：" + missing.join("、"));
  if (doc.width % 2 || doc.height % 2) throw Error("輸出寬高需為偶數");
  canvas ||= Object.assign(document.createElement("canvas"), {
    width: doc.width,
    height: doc.height,
  });
  await cpOutputMedia(doc);
  const session = await SeedStar.request("/compositor/renders", {
    width: doc.width,
    height: doc.height,
    fps: doc.timebase,
    frames: doc.durationFrames,
  });
  cp.render = {
    id: session.id,
    done: 0,
    total: doc.durationFrames,
    cancelled: false,
  };
  cpProgress();
  // Batches are cut by size (the server's requestBytes, under the 80 MB body cap) and sent at least every 20 s, so
  // a slow render never looks idle to the server's 120 s timeout (review 2026-11-03 #2/#3).
  const limits = session.limits || {},
    requestChars = Math.floor(((limits.requestBytes || 24 * 1048576) * 4) / 3),
    frameChars = Math.ceil(((limits.frameBytes || 48 * 1048576) * 4) / 3) + 64;
  try {
    let batch = [],
      chars = 0,
      start = 0,
      sent = performance.now();
    const flush = async () => {
      if (!batch.length) return;
      await SeedStar.request("/compositor/renders/" + session.id + "/frames", {
        start,
        frames: batch,
      });
      start += batch.length;
      batch = [];
      chars = 0;
      sent = performance.now();
    };
    for (let f = 0; f < doc.durationFrames; f++) {
      if (cp.render.cancelled) throw Error("已取消輸出");
      await cpDraw(canvas, doc, f);
      const data = canvas.toDataURL("image/png");
      if (data.length > frameChars)
        throw Error(
          `第 ${f} 格 PNG 約 ${((data.length * 3) / 4 / 1048576).toFixed(1)} MB，超過單格上限 ${((limits.frameBytes || 48 * 1048576) / 1048576).toFixed(0)} MB`,
        );
      if (batch.length && chars + data.length > requestChars) await flush();
      batch.push(data);
      chars += data.length;
      if (f === doc.durationFrames - 1 || performance.now() - sent > 20000)
        await flush();
      cp.render.done = f + 1;
      cpProgress();
    }
    const stored = await SeedStar.request(
      "/compositor/renders/" + session.id + "/finish",
      {
        compositionId: doc.id,
        compositionRevision: doc.revision,
        ...cpSources(doc),
      },
    );
    return await SeedStar.assets.save({
      ...stored,
      name: `${doc.title} · 第 ${doc.revision} 版`,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    await SeedStar.request(
      "/compositor/renders/" + session.id + "/cancel",
      {},
    ).catch(() => {});
    throw e;
  } finally {
    cp.render = null;
    cpProgress();
  }
}
// The library asset already rendered from this exact revision, if any.
async function cpRendered(doc) {
  const rows = await SeedStar.assets.list();
  return (
    rows
      .filter(
        (a) =>
          a.origin?.engine === "workbench-compositor" &&
          a.origin.compositionId === doc.id &&
          a.origin.compositionRevision === doc.revision &&
          !Number.isInteger(a.origin.frame),
      )
      .at(-1) || null
  );
}
async function cpEnsureSaved() {
  if (cp.dirty || !cp.doc.revision) await cpSave();
  return cp.doc;
}
async function cpOutput() {
  const doc = await cpEnsureSaved();
  cp.status = "";
  const asset = await cpRenderOutput(
    doc,
    document.querySelector("[data-cp-canvas]"),
  );
  cp.status = `已輸出「${asset.name}」到素材庫（透明 MOV，${asset.frames} 格）`;
  return asset;
}
// S3b: the current frame as a PNG reference image for the generation pages.
async function cpStill() {
  const doc = await cpEnsureSaved(),
    canvas = document.querySelector("[data-cp-canvas]");
  const missing = await cpFonts(doc);
  if (missing.length) throw Error("缺少字型：" + missing.join("、"));
  await cpOutputMedia(doc);
  await cpDraw(canvas, doc, cp.frame);
  const stored = await SeedStar.request("/compositor/stills", {
    data: canvas.toDataURL("image/png"),
    compositionId: doc.id,
    compositionRevision: doc.revision,
    frame: cp.frame,
    ...cpSources(doc),
  });
  const asset = await SeedStar.assets.save({
    ...stored,
    name: `${doc.title} 構圖 · 第 ${cp.frame} 格`,
    createdAt: new Date().toISOString(),
  });
  cp.status = `已存成參考圖「${asset.name}」，可在生成頁的參考圖選用`;
  return asset;
}
async function cpEditorReady() {
  if (ed.loading) await ed.loading;
  if (!ed.ready) await edLoadProjects();
}
// 放到剪輯時間軸: full-frame clip on the project's first overlay video track (P2 rules), after that track's last clip.
async function cpPlace(projectId) {
  await cpEditorReady();
  if (!ed.projects.some((x) => x.id === projectId)) throw Error("找不到剪輯專案");
  const doc = await cpEnsureSaved();
  const asset =
    (await cpRendered(doc)) ||
    (await cpRenderOutput(doc, document.querySelector("[data-cp-canvas]")));
  const { p, track, startFrame, clip } = await cpPlaceAsset(projectId, asset, (doc.durationFrames * doc.timebase.den) / doc.timebase.num);
  cp.status = `已放到「${p.title}」的 ${track} 軌（第 ${startFrame} 格起）`;
  return clip;
}
// Shared with the 3D workspace (card P5, scripts/tools-3d.js): any alpha video asset -> full-frame clip on the
// project's first overlay video track, after that track's last clip.
async function cpPlaceAsset(projectId, asset, duration) {
  await cpEditorReady();
  const p = ed.projects.find((x) => x.id === projectId);
  if (!p) throw Error("找不到剪輯專案");
  const a = await edProbe(asset);
  ed.current = p.id;
  edCheckpoint();
  if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  const track = edTrackFor(p, "video"),
    startFrame = Math.max(
      0,
      ...p.clips
        .filter((c) => c.track === track)
        .map((c) => c.startFrame + c.durationFrames),
    );
  const clip = edTime(
    p,
    {
      id: crypto.randomUUID(),
      kind: "video",
      asset: a,
      track,
      speed: 1,
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      scale: 1,
      x: 50,
      y: 50,
      rotation: 0,
      width: 100,
    },
    {
      startFrame,
      duration,
      sourceStartFrame: 0,
    },
  );
  p.clips.push(clip);
  ed.selected = clip.id;
  await edSave();
  return { p, track, startFrame, clip };
}

// ---- editor side ----------------------------------------------------------------------------------------
const cpLatest = (id) => cp.list.find((c) => c.id === id) || null;
function cpEditorClip(p, c) {
  const o = c.asset?.origin;
  if (o?.engine !== "workbench-compositor" || Number.isInteger(o.frame))
    return "";
  const latest = cpLatest(o.compositionId);
  return `<div class="cp-source" data-cp-source><p class="note">來源：動畫合成${latest ? "「" + cpEsc(latest.title) + "」" : ""}第 ${o.compositionRevision} 版${c.previousAssetIds?.length ? `；先前版本 ${c.previousAssetIds.length} 個（可復原）` : ""}</p>${edButton("編輯來源合成", "comp-open")}${latest && latest.revision > o.compositionRevision ? edButton("有新版本：更新片段", "comp-update") : ""}</div>`;
}
function cpEditorAfterRender() {
  if (!cp.ready) cpBoot();
}
async function cpEditorAction(action, p, c) {
  const o = c?.asset?.origin;
  if (!o?.compositionId) return;
  if (action === "comp-open") {
    await cpLoad();
    cpOpen(o.compositionId);
    tool = "compose";
    setToolHash("#compose");
    render();
    return;
  }
  if (action === "comp-update") {
    // The clip that started the update is updated, whatever is selected when rendering ends (review #4).
    const clipId = c.id;
    await cpLoad();
    const latest = cpLatest(o.compositionId);
    if (!latest || latest.revision <= o.compositionRevision) return;
    const asset = (await cpRendered(latest)) || (await cpRenderOutput(latest));
    const a = await edProbe(asset);
    const clip = p.clips.find((x) => x.id === clipId);
    if (edProject() !== p || !clip) return;
    edCheckpoint();
    if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
    // The replaced asset stays referenced (previousAssetIds) and 復原 brings the old clip back whole.
    clip.previousAssetIds = [...(clip.previousAssetIds || []), clip.asset.id];
    clip.asset = a;
    edTime(p, clip, {
      duration:
        (latest.durationFrames * latest.timebase.den) / latest.timebase.num,
    });
    edRender();
    await edSave();
  }
}

// ---- screen ---------------------------------------------------------------------------------------------
function cpPropRow(layer, path, label) {
  if (!cpExists(layer, path)) return "";
  const p = cpP(layer, path),
    v = Compositor.valueAt(p, cp.frame),
    colour = Compositor.isColor(v) || Compositor.isColor(p.value),
    keyed = (p.keys || []).some((k) => k.frame === cp.frame),
    key = layer.id + ":" + path;
  const input = colour
    ? `<input class="text-input" type="${/^#[\da-f]{6}$/i.test(v) ? "color" : "text"}" aria-label="${cpEsc(label)}" data-cp-prop="${cpEsc(path)}" value="${cpEsc(v)}">`
    : `<input class="text-input" type="number" step="any" aria-label="${cpEsc(label)}" data-cp-prop="${cpEsc(path)}" value="${cpEsc(Math.round(Number(v) * 1000) / 1000)}">`;
  return `<div class="cp-prop${cp.prop === path ? " selected" : ""}"><label>${cpEsc(label)}${p.keys?.length ? " ◆" : ""}${p.expr ? " ƒ" : ""}${input}</label><span class="row">${cpB(keyed ? "刪除此關鍵影格" : "在播放頭加關鍵影格", "key-toggle:" + path, { pressed: keyed })}${cpB("動畫與表達式", "prop:" + path, { pressed: cp.prop === path })}</span><p class="note cp-error" role="alert" data-cp-err="${cpEsc(key)}"></p></div>`;
}
function cpPropsTab(l, d) {
  const i = d.layers.indexOf(l);
  let html = `<label>圖層名稱<input class="text-input" aria-label="圖層名稱" data-cp-field="layer-name" maxlength="60" value="${cpEsc(l.name)}"></label><div class="row"><label>開始格<input class="text-input" type="number" aria-label="圖層開始格" data-cp-field="in" value="${l.inFrame}"></label><label>結束格<input class="text-input" type="number" aria-label="圖層結束格" data-cp-field="out" value="${l.outFrame}"></label></div>`;
  html += `<p class="note">父層（子物件跟隨父層的位置、旋轉與縮放）</p><div class="flow-choices" role="group" aria-label="父層">${cpB("無", "parent:", { pressed: !l.parent })}${d.layers
    .filter((o) => o !== l)
    .map((o) => cpB(o.name, "parent:" + o.id, { pressed: l.parent === o.id }))
    .join("")}</div>`;
  if (l.kind !== "null")
    html += `<p class="note">混合模式</p><div class="flow-choices" role="group" aria-label="混合模式">${Object.entries(
      Compositor.BLEND_LABEL,
    )
      .map(([k, label]) => cpB(label, "blend:" + k, { pressed: l.blend === k }))
      .join("")}</div>`;
  html += Object.keys(Compositor.LAYER_PROPS)
    .map((k) => cpPropRow(l, k, CP_LABEL[k]))
    .join("");
  html += Object.keys(Compositor.KIND_PROPS[l.kind] || {})
    .filter(
      (k) =>
        !(
          l.kind === "text" &&
          k === "highlightColor" &&
          l.animator?.type !== "highlight"
        ),
    )
    .map((k) => cpPropRow(l, k, CP_LABEL[k]))
    .join("");
  if (l.kind === "shape")
    html += `<p class="note">形狀</p><div class="flow-choices" role="group" aria-label="形狀">${[
      ["rect", "矩形"],
      ["ellipse", "橢圓"],
      ["path", "路徑"],
    ]
      .map(([k, t]) => cpB(t, "shape:" + k, { pressed: l.shape === k }))
      .join(
        "",
      )}</div>${l.shape === "path" ? `<label>路徑點（x,y；每點以分號分隔，至少 3 點）<textarea aria-label="路徑點" data-cp-field="points">${cpEsc((l.points || []).map((p) => p.join(",")).join("; "))}</textarea></label>` : ""}`;
  if (l.kind === "rig" && typeof rgInspector === "function")
    html += rgInspector(l);
  if (l.kind === "image" || l.kind === "video")
    html += `${cpB(l.url ? "更換素材" : "選擇素材", "media-pick")}<p class="note">${l.url ? cpEsc(l.assetName || "已選素材") : "尚未選擇素材"}</p>`;
  if (i === 0 && d.layers[1]?.matte)
    html += `<p class="note">此圖層是下方圖層的合成遮罩，本身不會顯示。</p>`;
  return html;
}
function cpCurve(key) {
  return `<div class="cp-curve" data-cp-curve aria-label="動畫曲線" role="img"></div><div class="row">${cpB(cp.linear ? "隱藏線性對照" : "顯示線性對照", "linear-toggle", { pressed: cp.linear })}<span class="note">${key ? "拖動兩個控制點調整速度；曲線＝數值隨時間的變化" : ""}</span></div>`;
}
function cpAnimTab(l) {
  if (!cpExists(l, cp.prop)) cp.prop = "x";
  const p = cpP(l, cp.prop),
    keys = p.keys || [],
    key = keys[cp.key] || null;
  let html = `<p class="note">屬性：<b>${cpEsc(cpLabelOf(cp.prop))}</b>（在「屬性」「遮罩」「特效」分頁按「動畫與表達式」換屬性）</p>`;
  html += `<div class="row">${cpB("在播放頭加關鍵影格", "key-add")}${cpB("複製關鍵影格", "key-copy", { disabled: !key })}${cpB("貼上到播放頭", "key-paste", { disabled: !cp.clipboard })}</div>`;
  html += keys.length
    ? `<div class="cp-keys">${keys
        .map(
          (k, i) =>
            `<div class="cp-key-row${i === cp.key ? " selected" : ""}">${cpB("選取", "key-select:" + i, { pressed: i === cp.key })}<label>影格<input class="text-input" type="number" aria-label="關鍵影格 ${i + 1} 影格" data-cp-keyframe="${i}" value="${k.frame}"></label><label>值<input class="text-input" ${Compositor.isColor(k.value) ? 'type="text"' : 'type="number" step="any"'} aria-label="關鍵影格 ${i + 1} 值" data-cp-keyvalue="${i}" value="${cpEsc(k.value)}"></label>${cpB("刪除", "key-delete:" + i)}</div>`,
        )
        .join("")}</div>`
    : '<p class="note">此屬性還沒有關鍵影格。</p>';
  if (key) {
    html += `<p class="note">從第 ${key.frame} 格到下一個關鍵影格的緩動</p><div class="flow-choices" role="group" aria-label="緩動">${Compositor.EASES.map((e) => cpB(Compositor.EASE_LABEL[e], "ease:" + e, { pressed: key.ease === e })).join("")}</div>`;
    if (key.ease !== "hold") html += cpCurve(key);
  }
  return html;
}
function cpExprTab(l) {
  if (!cpExists(l, cp.prop)) cp.prop = "x";
  const p = cpP(l, cp.prop),
    c = p.expr ? Compositor.compile(p.expr) : null,
    key = l.id + ":" + cp.prop;
  return `<p class="note">屬性：<b>${cpEsc(cpLabelOf(cp.prop))}</b></p><label>表達式（最多 ${Compositor.EXPR.maxLength} 字；留空＝不使用）<input class="text-input" aria-label="表達式" data-cp-field="expr" maxlength="${Compositor.EXPR.maxLength}" value="${cpEsc(p.expr || "")}"></label><p class="note cp-error" role="alert" data-cp-err="${cpEsc(key)}" data-cp-expr-error ${c?.error ? `data-cp-compile="${cpEsc(JSON.stringify(c.error))}"` : ""}></p><details open><summary>支援的語法與屬性</summary><ul class="note"><li>數字、+ − × ÷（* /）、%、括號、比較（&lt; &gt; &lt;= &gt;= == !=）、&amp;&amp; ||、條件 ? 甲 : 乙</li><li>變數：time（秒）、frame（格）、value（關鍵影格算出的值）、fps、index（圖層順序，0＝最上層）、PI</li><li>函式：sin cos abs min max clamp(v,lo,hi) round floor ceil linear(t,t1,t2,v1,v2) loop(週期秒＝重播此屬性的關鍵影格) wiggle(頻率,幅度[,種子])（固定的擬隨機，每次輸出相同）</li><li>連結：layer("圖層名稱").屬性，可讀 ${Compositor.LINKABLE.join("、")}；互相連結成循環會被擋下</li><li>限制：${Compositor.EXPR.maxLength} 字、每次 ${Compositor.EXPR.maxSteps} 步、巢狀 ${Compositor.EXPR.maxDepth} 層；不能使用其他名稱（無法讀取檔案、網路或系統資料）。出錯時顯示第幾個字，該屬性改用關鍵影格的值，畫面照常輸出。</li></ul></details>`;
}
function cpMaskTab(l) {
  if (!l.mask)
    return `<p class="note">遮罩決定圖層哪裡可見。</p>${cpB("加矩形遮罩", "mask-add:rect")}${cpB("加橢圓遮罩", "mask-add:ellipse")}${cpB("加路徑遮罩", "mask-add:path")}`;
  return `<div class="flow-choices" role="group" aria-label="遮罩形狀">${[
    ["rect", "矩形"],
    ["ellipse", "橢圓"],
    ["path", "路徑"],
  ]
    .map(([k, t]) => cpB(t, "mask-shape:" + k, { pressed: l.mask.shape === k }))
    .join(
      "",
    )}</div><div class="row">${cpB(l.mask.inverted ? "取消反相" : "反相", "mask-invert", { pressed: !!l.mask.inverted })}${cpB(l.mask.enabled ? "停用遮罩" : "啟用遮罩", "mask-enable", { pressed: !l.mask.enabled })}${cpB("移除遮罩", "mask-remove")}</div>${l.mask.shape === "path" ? `<label>遮罩路徑點（x,y；分號分隔）<textarea aria-label="遮罩路徑點" data-cp-field="mask-points">${cpEsc((l.mask.points || []).map((p) => p.join(",")).join("; "))}</textarea></label>` : ""}${Object.keys(
    Compositor.MASK_PROPS,
  )
    .map((k) => cpPropRow(l, "mask." + k, CP_LABEL[k]))
    .join("")}`;
}
function cpMatteTab(l, d) {
  const i = d.layers.indexOf(l);
  if (i === 0)
    return '<p class="note">合成遮罩使用清單中緊鄰上方的圖層；最上層沒有上方圖層。</p>';
  return `<p class="note">以上方圖層「${cpEsc(d.layers[i - 1].name)}」作可見範圍（例：文字裡播放影片）；兩個圖層的動畫都照常進行，上方圖層本身不再顯示。</p><div class="flow-choices" role="group" aria-label="合成遮罩">${cpB("無", "matte:", { pressed: !l.matte })}${Compositor.MATTES.map((m) => cpB(Compositor.MATTE_LABEL[m], "matte:" + m, { pressed: l.matte?.mode === m })).join("")}</div>`;
}
function cpEffectsTab(l) {
  return `<p class="note">可用效果（依清單順序套用，可旁路）：${Object.values(
    Compositor.EFFECTS,
  )
    .map((e) => e.label)
    .join("、")}</p><div class="row">${Object.entries(Compositor.EFFECTS)
    .map(([k, e]) => cpB("加" + e.label, "fx-add:" + k))
    .join("")}</div>${l.effects
    .map(
      (fx, i) =>
        `<div class="cp-effect"><b>${cpEsc(Compositor.EFFECTS[fx.type].label)}</b><span class="row">${cpB("上移", "fx-up:" + fx.id, { disabled: i === 0 })}${cpB("下移", "fx-down:" + fx.id, { disabled: i === l.effects.length - 1 })}${cpB(fx.bypass ? "取消旁路" : "旁路", "fx-bypass:" + fx.id, { pressed: !!fx.bypass })}${cpB("刪除", "fx-delete:" + fx.id)}</span>${Object.keys(
          Compositor.EFFECTS[fx.type].props,
        )
          .map((k) => cpPropRow(l, "fx." + fx.id + "." + k, CP_LABEL[k]))
          .join("")}</div>`,
    )
    .join("")}`;
}
function cpTextTab(l) {
  const a = l.animator || { type: "none", by: "word" },
    { mode } = Compositor.textUnits(l),
    present = cpFontAvailable(l.font || "");
  return `<label>文字內容<textarea aria-label="文字內容" data-cp-field="text" maxlength="2000">${cpEsc(l.text)}</textarea></label><p class="note">字型（已載入的字型）</p><div class="flow-choices" role="group" aria-label="字型">${cpFontList()
    .map(([family, label]) =>
      cpB(label + (cpFontAvailable(family) ? "" : "（缺）"), "font:" + family, {
        pressed: l.font === family,
      }),
    )
    .join(
      "",
    )}</div><label>其他字型名稱<input class="text-input" aria-label="其他字型名稱" data-cp-field="font" maxlength="80" value="${cpEsc(l.font)}"></label>${present ? "" : `<p class="note cp-error" role="alert">缺少字型：${cpEsc(l.font)}（輸出會被擋下，不會改用其他字型）</p>`}<div class="row">${cpB(l.bold ? "取消粗體" : "粗體", "bold", { pressed: !!l.bold })}${cpB("靠左", "align:left", { pressed: l.align !== "center" })}${cpB("置中", "align:center", { pressed: l.align === "center" })}</div><p class="note">動態字幕</p><div class="flow-choices" role="group" aria-label="文字動畫">${Object.entries(
    Compositor.ANIMATORS,
  )
    .map(([k, t]) => cpB(t, "anim:" + k, { pressed: a.type === k }))
    .join(
      "",
    )}</div><div class="flow-choices" role="group" aria-label="動畫單位">${cpB("逐詞", "anim-by:word", { pressed: a.by !== "char" })}${cpB("逐字", "anim-by:char", { pressed: a.by === "char" })}</div><div class="row"><label>動畫開始格<input class="text-input" type="number" aria-label="動畫開始格" data-cp-field="anim-start" value="${Number.isFinite(a.start) ? a.start : l.inFrame}"></label><label>動畫結束格<input class="text-input" type="number" aria-label="動畫結束格" data-cp-field="anim-end" value="${Number.isFinite(a.end) ? a.end : l.inFrame + 30}"></label></div><p class="note" data-cp-timing>字詞時間來源：${{ words: "逐字稿的字詞時間", estimate: "估計（依字數平均分配，非實際語音時間）", sentence: "整句（沒有字詞時間：整句同時出現）" }[mode]}。本工作台沒有免費的字詞時間來源；有逐字稿時間時可貼入下方清單。</p><div class="row">${cpB("整句", "timing:sentence", { pressed: mode === "sentence" })}${cpB("依字數平均分配（估計）", "timing:estimate", { pressed: mode === "estimate" })}</div>${(
    l.words || []
  )
    .map(
      (w, i) =>
        `<div class="cp-word"><label>字詞<input class="text-input" aria-label="字詞 ${i + 1}" data-cp-word="${i}" data-cp-word-key="text" value="${cpEsc(w.text)}"></label><label>開始格<input class="text-input" type="number" aria-label="字詞 ${i + 1} 開始格" data-cp-word="${i}" data-cp-word-key="startFrame" value="${w.startFrame}"></label><label>結束格<input class="text-input" type="number" aria-label="字詞 ${i + 1} 結束格" data-cp-word="${i}" data-cp-word-key="endFrame" value="${w.endFrame}"></label>${w.estimated ? '<span class="note">估計</span>' : ""}${cpB("刪除", "word-delete:" + i)}</div>`,
    )
    .join("")}${l.words?.length ? cpB("新增字詞", "word-add") : ""}`;
}
function cpLabelOf(path) {
  const name = path.split(".").at(-1);
  return (
    (path.startsWith("mask.")
      ? "遮罩・"
      : path.startsWith("fx.")
        ? "特效・"
        : "") +
    (CP_LABEL[name] || (typeof rgLabel === "function" && rgLabel(name)) || name)
  );
}
function toolCompositorScreen(t) {
  if (!cp.ready) {
    cpBoot();
    return wfWrap(t, "<p>讀取動畫合成…</p>");
  }
  const d = cp.doc;
  if (!d)
    return wfWrap(
      t,
      `<h3>動畫合成</h3><p class="note">圖層、2D 變形、遮罩、合成遮罩、關鍵影格、動畫曲線、表達式與特效；輸出透明影片放回剪輯時間軸，或把構圖存成參考圖。</p><div class="row">${cpB("新增空白合成", "new")}${cpB("新增片頭範本", "template", { primary: true })}</div><div class="flow-choices">${cp.list
        .map((c) =>
          cpB(c.title + " · 第 " + c.revision + " 版", "open:" + c.id),
        )
        .join(
          "",
        )}</div><p class="cp-status" role="status" data-cp-status>${cpEsc(cp.status)}</p>`,
    );
  const l = cpLayer(),
    saved = cp.list.find((c) => c.id === d.id),
    fpsLabel = Timebase.label(d.timebase),
    tabs = [
      "屬性",
      "動畫",
      "表達式",
      "遮罩",
      "合成遮罩",
      "特效",
      ...(l?.kind === "text" ? ["文字"] : []),
    ];
  if (!tabs.includes(cp.tab)) cp.tab = "屬性";
  let inspector = '<p class="note">請在左側選一個圖層。</p>';
  if (l)
    inspector =
      `<div class="flow-choices cp-tabs" role="group" aria-label="屬性分頁">${tabs.map((x) => cpB(x, "tab:" + x, { pressed: cp.tab === x })).join("")}</div>` +
      {
        屬性: cpPropsTab,
        動畫: cpAnimTab,
        表達式: cpExprTab,
        遮罩: cpMaskTab,
        合成遮罩: cpMatteTab,
        特效: cpEffectsTab,
        文字: cpTextTab,
      }[cp.tab](l, d);
  const keys = l
      ? cpExists(l, cp.prop)
        ? cpP(l, cp.prop).keys || []
        : []
      : [],
    pct = (f) =>
      d.durationFrames > 1 ? (f / (d.durationFrames - 1)) * 100 : 0;
  const heading = `<div class="cp-heading row">${cpB("所有合成", "list")}<label>合成名稱<input class="text-input" aria-label="合成名稱" data-cp-field="title" maxlength="100" value="${cpEsc(d.title)}"></label><label>寬<input class="text-input" type="number" aria-label="合成寬" data-cp-field="width" min="16" max="3840" step="2" value="${d.width}"></label><label>高<input class="text-input" type="number" aria-label="合成高" data-cp-field="height" min="16" max="3840" step="2" value="${d.height}"></label><label>長度（格）<input class="text-input" type="number" aria-label="合成長度" data-cp-field="duration" min="1" max="36000" value="${d.durationFrames}"></label></div><div class="row"><span class="note">影格率</span><div class="flow-choices" role="group" aria-label="影格率">${Timebase.allowed.map((tb) => cpB(Timebase.label(tb), "fps:" + Timebase.label(tb), { pressed: Timebase.label(tb) === fpsLabel })).join("")}</div><span class="note">背景</span>${cpB("透明", "bg:transparent", { pressed: d.background === "transparent" })}${cpB("純色", "bg:colour", { pressed: d.background !== "transparent" })}${d.background !== "transparent" ? `<input class="text-input" type="color" aria-label="背景顏色" data-cp-field="background" value="${cpEsc(d.background.slice(0, 7))}">` : ""}</div><div class="row">${cpB(cp.dirty ? "儲存（有未儲存的修改）" : "儲存", "save", { primary: cp.dirty })}<span class="note" data-cp-revision>第 ${saved?.revision || 0} 版${cp.dirty ? "・未儲存" : ""}</span>${cpB("還原上一版", "restore", { disabled: !saved?.history.length })}${cpB("新增片頭範本", "template")}${cpB("輸出透明影片", "output", { disabled: !!cp.render })}${cpB("放到剪輯時間軸", "place", { disabled: !!cp.render })}${cpB("匯出構圖為參考圖", "still", { disabled: !!cp.render })}</div><p class="note">輸出時請勿關閉此頁：每一格在此頁面以預覽同一套繪製程式產生。</p><div class="row"><span data-cp-progress role="status"></span><span data-cp-render-controls></span></div><p class="cp-status" role="status" data-cp-status>${cpEsc(cp.status)}</p>`;
  const layers = `<aside class="cp-layers"><h3>圖層</h3><div class="row">${[
    ["text", "文字"],
    ["shape:rect", "矩形"],
    ["shape:ellipse", "橢圓"],
    ["shape:path", "路徑"],
    ["null", "控制器"],
    ["image", "圖片"],
    ["video", "影片"],
    ["rig", "角色"],
  ]
    .map(([k, t]) => cpB("＋" + t, "add:" + k))
    .join("")}</div><p class="note">清單最上面＝最上層。</p>${d.layers
    .map(
      (x, i) =>
        `<div class="cp-layer${x.id === cp.layer ? " selected" : ""}" data-cp-layer="${cpEsc(x.id)}">${cpB(x.name + " · " + CP_KIND[x.kind] + (x.parent ? " ↳" : "") + (x.matte ? " ▣" : ""), "layer:" + x.id, { pressed: x.id === cp.layer })}<span class="row">${cpB("上移", "up:" + x.id, { disabled: i === 0 })}${cpB("下移", "down:" + x.id, { disabled: i === d.layers.length - 1 })}${cpB(x.visible ? "隱藏" : "顯示", "visible:" + x.id, { pressed: !x.visible })}${cpB("刪除", "delete:" + x.id)}</span></div>`,
    )
    .join("")}</aside>`;
  const stage = `<section class="cp-stage"><div class="cp-canvas-wrap" style="aspect-ratio:${d.width}/${d.height}"><canvas data-cp-canvas width="${d.width}" height="${d.height}" aria-label="合成預覽"></canvas><canvas data-cp-overlay class="cp-overlay" width="${d.width}" height="${d.height}" aria-label="骨架顯示（不會輸出）"></canvas></div><p class="note" data-cp-missing-media></p><div class="row">${cpB("第一格", "frame:first")}${cpB("上一格", "frame:-1")}${cpB(cp.playing ? "暫停" : "播放", "play", { pressed: cp.playing })}${cpB("下一格", "frame:1")}${cpB("上一個關鍵影格", "key-prev", { disabled: !l })}${cpB("下一個關鍵影格", "key-next", { disabled: !l })}<label>目前影格<input class="text-input" type="number" aria-label="目前影格" data-cp-field="frame" min="0" max="${d.durationFrames - 1}" value="${cp.frame}"></label><span class="note" data-cp-clock>${(cp.frame / cpFps(d)).toFixed(2)} 秒</span></div><div class="cp-mini" data-cp-mini aria-label="迷你時間軸（${cpEsc(l ? cpLabelOf(cp.prop) : "")}）"><input type="range" aria-label="播放位置" data-cp-field="frame" min="0" max="${d.durationFrames - 1}" step="1" value="${cp.frame}">${keys
    .map(
      (k, i) =>
        `<button type="button" class="cp-key${i === cp.key ? " selected" : ""}" data-cp-key="${i}" style="left:${pct(k.frame)}%" title="第 ${k.frame} 格（拖動可移動）" aria-label="關鍵影格第 ${k.frame} 格">◆</button>`,
    )
    .join("")}</div></section>`;
  return wfWrap(
    t,
    `${heading}<div class="cp-workspace">${layers}${stage}<aside class="cp-inspector">${inspector}</aside></div>`,
  );
}
function toolCompositorAfterRender() {
  cpProgress();
  cpBuildCurve();
  cpPaint().catch(SeedStar.reportError);
}
// The curve editor: SVG built here (the sanitizer only passes HTML), two draggable handles = cubic-bezier.
function cpBuildCurve() {
  const host = document.querySelector("[data-cp-curve]"),
    l = cpLayer();
  if (!host || !l) return;
  const key = cpP(l, cp.prop).keys?.[cp.key];
  if (!key) return;
  const S = 200,
    pad = 30,
    NS = "http://www.w3.org/2000/svg",
    el = (name, attrs) => {
      const e = document.createElementNS(NS, name);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      return e;
    };
  const b = [
    ...(key.ease === "bezier" && key.bezier
      ? key.bezier
      : Compositor.PRESET[key.ease] || Compositor.PRESET.linear),
  ];
  const sx = (x) => pad + x * S,
    sy = (y) => pad + (1 - y) * S;
  const svg = el("svg", {
    viewBox: `0 0 ${S + pad * 2} ${S + pad * 2}`,
    width: "100%",
    "data-cp-curve-svg": "",
  });
  svg.append(
    el("rect", {
      x: pad,
      y: pad,
      width: S,
      height: S,
      fill: "none",
      stroke: "currentColor",
      "stroke-opacity": "0.3",
    }),
  );
  if (cp.linear)
    svg.append(
      el("line", {
        x1: sx(0),
        y1: sy(0),
        x2: sx(1),
        y2: sy(1),
        stroke: "currentColor",
        "stroke-dasharray": "4 4",
        "stroke-opacity": "0.6",
        "data-cp-linear": "",
      }),
    );
  const curve = el("path", {
      fill: "none",
      stroke: "var(--accent)",
      "stroke-width": "3",
    }),
    l1 = el("line", { stroke: "currentColor", "stroke-opacity": "0.6" }),
    l2 = el("line", { stroke: "currentColor", "stroke-opacity": "0.6" }),
    h1 = el("circle", {
      r: 8,
      fill: "var(--accent)",
      "data-cp-handle": "1",
      tabindex: "0",
      role: "slider",
      "aria-label": "控制點 1",
    }),
    h2 = el("circle", {
      r: 8,
      fill: "var(--accent)",
      "data-cp-handle": "2",
      tabindex: "0",
      role: "slider",
      "aria-label": "控制點 2",
    });
  const draw = () => {
    curve.setAttribute(
      "d",
      `M${sx(0)},${sy(0)} C${sx(b[0])},${sy(b[1])} ${sx(b[2])},${sy(b[3])} ${sx(1)},${sy(1)}`,
    );
    (l1.setAttribute("x1", sx(0)),
      l1.setAttribute("y1", sy(0)),
      l1.setAttribute("x2", sx(b[0])),
      l1.setAttribute("y2", sy(b[1])));
    (l2.setAttribute("x1", sx(1)),
      l2.setAttribute("y1", sy(1)),
      l2.setAttribute("x2", sx(b[2])),
      l2.setAttribute("y2", sy(b[3])));
    (h1.setAttribute("cx", sx(b[0])), h1.setAttribute("cy", sy(b[1])));
    (h2.setAttribute("cx", sx(b[2])), h2.setAttribute("cy", sy(b[3])));
  };
  draw();
  svg.append(curve, l1, l2, h1, h2);
  host.replaceChildren(svg);
  for (const h of [h1, h2])
    h.onpointerdown = (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const i = h === h1 ? 0 : 2;
      h.onpointermove = (ev) => {
        const r = svg.getBoundingClientRect(),
          k = (S + pad * 2) / r.width;
        b[i] =
          Math.round(
            Math.min(1, Math.max(0, ((ev.clientX - r.left) * k - pad) / S)) *
              1000,
          ) / 1000;
        b[i + 1] =
          Math.round(
            Math.min(
              2,
              Math.max(-1, 1 - ((ev.clientY - r.top) * k - pad) / S),
            ) * 1000,
          ) / 1000;
        draw();
      };
      h.onpointerup = h.onpointercancel = () => {
        h.onpointermove = h.onpointerup = h.onpointercancel = null;
        key.ease = "bezier";
        key.bezier = [...b];
        cpTouch();
        render();
      };
    };
}
function cpNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function cpSetFrame(f) {
  cp.frame = Math.max(0, Math.min(cp.doc.durationFrames - 1, Math.round(f)));
}
async function cpPlay() {
  cp.playing = true;
  render();
  while (cp.playing && tool === "compose" && cp.doc) {
    const t0 = performance.now();
    cpSetFrame((cp.frame + 1) % cp.doc.durationFrames);
    await cpPaint();
    const clock = document.querySelector("[data-cp-clock]"),
      input = document.querySelector('input[data-cp-field="frame"]');
    if (clock)
      clock.textContent = (cp.frame / cpFps(cp.doc)).toFixed(2) + " 秒";
    if (input) input.value = cp.frame;
    document
      .querySelectorAll('input[type="range"][data-cp-field="frame"]')
      .forEach((r) => (r.value = cp.frame));
    await new Promise((r) =>
      setTimeout(
        r,
        Math.max(0, 1000 / cpFps(cp.doc) - (performance.now() - t0)),
      ),
    );
  }
  cp.playing = false;
}
function cpPoints(text) {
  const pts = String(text || "")
    .split(";")
    .map((s) => s.split(",").map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  if (pts.length && pts.length < 3) throw Error("路徑至少需要 3 個點");
  return pts;
}
async function cpPickMedia(l) {
  const rows = await SeedStar.pickAssets({ kind: l.kind });
  const a = rows?.[0];
  if (!a) return;
  if (
    !SeedStar.safeUrl(a.url) ||
    (a.previewUrl && !SeedStar.safeUrl(a.previewUrl))
  )
    throw Error("素材網址無效");
  l.url = a.url;
  l.previewUrl = a.previewUrl || a.url;
  l.assetId = a.id;
  l.assetName = a.name || "";
  // Size from the original (the proxy may be smaller); a non-decodable original falls back to the proxy's aspect.
  let entry = cpMediaEntry(l, "output");
  if (!(await entry.ready)) await (entry = cpMediaEntry(l, "preview")).ready;
  const w = entry.el.naturalWidth || entry.el.videoWidth || 640,
    h = entry.el.naturalHeight || entry.el.videoHeight || 360,
    fit = Math.min(cp.doc.width / w, cp.doc.height / h, 1);
  l.props.width = { value: Math.round(w * fit) };
  l.props.height = { value: Math.round(h * fit) };
  l.props.x = { value: Math.round((cp.doc.width - w * fit) / 2) };
  l.props.y = { value: Math.round((cp.doc.height - h * fit) / 2) };
  cpTouch();
}
async function cpChooseProject() {
  await cpEditorReady();
  if (!ed.projects.length)
    throw Error("還沒有剪輯專案，請先到「影片剪輯」建立");
  const d = edDialog(
    `<h3>放到哪個剪輯專案？</h3><p class="note">會加在該專案第一條疊加影片軌（主軌之上）的最後面；若沒有疊加軌會新增一條。</p><div class="flow-choices">${ed.projects.map((p) => `<button type="button" class="btn small" data-cp-project="${cpEsc(p.id)}">${cpEsc(p.title + " · " + p.ratio)}</button>`).join("")}</div>`,
  );
  return new Promise((resolve) => {
    d.addEventListener("close", () => resolve(null));
    d.querySelectorAll("[data-cp-project]").forEach(
      (b) => (b.onclick = () => (resolve(b.dataset.cpProject), d.close())),
    );
  });
}

async function cpAction(action) {
  const [name, ...rest] = action.split(":"),
    arg = rest.join(":"),
    d = cp.doc,
    l = cpLayer();
  // Card P4: rig layer actions (scripts/tools-rig.js).
  if (name.startsWith("rig-") && typeof rgCpAction === "function")
    return rgCpAction(name, arg, d, l);
  if (name === "add" && arg === "rig" && typeof rgAddLayer === "function")
    return rgAddLayer(d);
  if (name === "new" || name === "template") {
    const doc =
      name === "template"
        ? cpTemplate()
        : Compositor.normalize({ title: "未命名合成", layers: [] });
    cp.doc = doc;
    cp.layer =
      doc.layers.find((x) => x.name === "標題")?.id ||
      doc.layers[0]?.id ||
      null;
    cp.frame = 0;
    cp.tab = "屬性";
    await cpSave();
    return render();
  }
  if (name === "open") {
    cpOpen(arg);
    return render();
  }
  if (name === "list") {
    if (cp.dirty && !confirm("有未儲存的修改，確定離開？")) return;
    cp.doc = null;
    cp.playing = false;
    return render();
  }
  if (!d) return;
  if (name === "save") {
    await cpSave();
    cp.status = "已儲存第 " + cp.doc.revision + " 版";
    return render();
  }
  if (name === "restore") {
    await cpRestore();
    cp.status = "已還原上一版（存成第 " + cp.doc.revision + " 版）";
    return render();
  }
  if (name === "output" || name === "place" || name === "still") {
    cp.playing = false;
    const project = name === "place" ? await cpChooseProject() : null;
    if (name === "place" && !project) return;
    cp.status = "";
    render();
    try {
      if (name === "output") await cpOutput();
      else if (name === "still") await cpStill();
      else await cpPlace(project);
    } catch (e) {
      cp.status = e.message;
      render();
      throw e;
    }
    return render();
  }
  if (name === "cancel") {
    if (cp.render) cp.render.cancelled = true;
    return;
  }
  if (name === "play") {
    if (cp.playing) cp.playing = false;
    else cpPlay().catch(SeedStar.reportError);
    return render();
  }
  if (name === "frame") {
    cpSetFrame(arg === "first" ? 0 : cp.frame + Number(arg));
    return render();
  }
  if (name === "fps") {
    const tb = Timebase.fromLabel(arg);
    if (tb) d.timebase = { num: tb.num, den: tb.den };
    cpTouch();
    return render();
  }
  if (name === "bg") {
    d.background =
      arg === "transparent"
        ? "transparent"
        : d.background === "transparent"
          ? "#000000"
          : d.background;
    cpTouch();
    return render();
  }
  if (name === "add") {
    const [kind, shape] = arg.split(":"),
      layer = Compositor.newLayer(kind, {
        id: "L" + cpRid(),
        outFrame: d.durationFrames,
        ...(shape ? { shape } : {}),
      });
    layer.props.x = { value: Math.round(d.width / 2) };
    layer.props.y = { value: Math.round(d.height / 2) };
    if (kind === "shape") {
      layer.props.anchorX = { value: 200 };
      layer.props.anchorY = { value: 100 };
      if (shape === "path")
        layer.points = [
          [200, 0],
          [400, 200],
          [0, 200],
        ];
    }
    if (kind === "text") layer.props.anchorY = { value: 36 };
    d.layers.unshift(layer);
    cp.layer = layer.id;
    cp.prop = "x";
    cp.key = null;
    cpTouch();
    if (kind === "image" || kind === "video")
      await cpPickMedia(layer).catch(SeedStar.reportError);
    return render();
  }
  if (name === "layer") {
    cp.layer = arg;
    cp.key = null;
    if (!cpExists(cpLayer(), cp.prop)) cp.prop = "x";
    return render();
  }
  if (["up", "down", "visible", "delete"].includes(name)) {
    const i = d.layers.findIndex((x) => x.id === arg);
    if (i < 0) return;
    if (name === "up" && i > 0)
      [d.layers[i - 1], d.layers[i]] = [d.layers[i], d.layers[i - 1]];
    if (name === "down" && i < d.layers.length - 1)
      [d.layers[i + 1], d.layers[i]] = [d.layers[i], d.layers[i + 1]];
    if (name === "visible") d.layers[i].visible = !d.layers[i].visible;
    if (name === "delete") {
      d.layers.splice(i, 1);
      for (const x of d.layers) if (x.parent === arg) x.parent = null;
      if (cp.layer === arg) cp.layer = d.layers[0]?.id || null;
    }
    cpTouch();
    return render();
  }
  if (name === "tab") {
    cp.tab = arg;
    return render();
  }
  if (!l) return;
  if (name === "parent") {
    if (Compositor.parentCycle(d, l.id, arg || null))
      throw Error("不能設為父層：會形成循環");
    l.parent = arg || null;
  } else if (name === "blend") l.blend = arg;
  else if (name === "shape") {
    l.shape = arg;
    if (arg === "path" && !(l.points?.length > 2))
      l.points = [
        [200, 0],
        [400, 200],
        [0, 200],
      ];
  } else if (name === "media-pick") await cpPickMedia(l);
  else if (name === "prop") {
    cp.prop = arg;
    cp.key = null;
    if (cp.tab !== "動畫" && cp.tab !== "表達式") cp.tab = "動畫";
    return render();
  } else if (name === "key-toggle" || name === "key-add") {
    const path = name === "key-add" ? cp.prop : arg,
      p = cpP(l, path),
      i = (p.keys || []).findIndex((k) => k.frame === cp.frame);
    if (name === "key-toggle" && i >= 0) {
      p.value = p.keys[i].value;
      p.keys.splice(i, 1);
      if (!p.keys.length) delete p.keys;
    } else Compositor.setKey(p, cp.frame, Compositor.valueAt(p, cp.frame));
    cp.prop = path;
    cp.key = (p.keys || []).findIndex((k) => k.frame === cp.frame);
    if (cp.key < 0) cp.key = null;
  } else if (name === "key-select") {
    cp.key = Number(arg);
    const k = cpP(l, cp.prop).keys?.[cp.key];
    if (k) cpSetFrame(k.frame);
    return render();
  } else if (name === "key-delete") {
    const p = cpP(l, cp.prop);
    p.keys.splice(Number(arg), 1);
    if (!p.keys.length) delete p.keys;
    cp.key = null;
  } else if (name === "key-copy") {
    const k = cpP(l, cp.prop).keys?.[cp.key];
    if (k)
      cp.clipboard = structuredClone({
        value: k.value,
        ease: k.ease,
        bezier: k.bezier,
      });
    cp.status = "已複製關鍵影格";
    return render();
  } else if (name === "key-paste") {
    if (!cp.clipboard) return;
    const p = cpP(l, cp.prop);
    Compositor.setKey(p, cp.frame, cp.clipboard.value);
    const k = p.keys.find((x) => x.frame === cp.frame);
    k.ease = cp.clipboard.ease;
    if (cp.clipboard.bezier) k.bezier = [...cp.clipboard.bezier];
    cp.key = p.keys.indexOf(k);
  } else if (name === "key-prev" || name === "key-next") {
    const frames = Compositor.keyFrames(l),
      f =
        name === "key-prev"
          ? frames.filter((x) => x < cp.frame).at(-1)
          : frames.find((x) => x > cp.frame);
    if (f !== undefined) cpSetFrame(f);
    return render();
  } else if (name === "ease") {
    const k = cpP(l, cp.prop).keys?.[cp.key];
    if (!k) return;
    k.ease = arg;
    if (arg === "bezier" && !k.bezier) k.bezier = [0.25, 0.1, 0.25, 1];
  } else if (name === "linear-toggle") {
    cp.linear = !cp.linear;
    return render();
  } else if (name === "mask-add") {
    l.mask = {
      enabled: true,
      shape: arg,
      inverted: false,
      points:
        arg === "path"
          ? [
              [0, 0],
              [300, 0],
              [150, 200],
            ]
          : [],
      props: {
        maskX: { value: 0 },
        maskY: { value: 0 },
        maskWidth: { value: 400 },
        maskHeight: { value: 200 },
        feather: { value: 0 },
        expansion: { value: 0 },
      },
    };
  } else if (name === "mask-shape") {
    l.mask.shape = arg;
    if (arg === "path" && !(l.mask.points?.length > 2))
      l.mask.points = [
        [0, 0],
        [300, 0],
        [150, 200],
      ];
  } else if (name === "mask-invert") l.mask.inverted = !l.mask.inverted;
  else if (name === "mask-enable") l.mask.enabled = !l.mask.enabled;
  else if (name === "mask-remove") {
    l.mask = null;
    if (cp.prop.startsWith("mask.")) cp.prop = "x";
  } else if (name === "matte") l.matte = arg ? { mode: arg } : null;
  else if (name === "fx-add") {
    const props = {};
    for (const [k, v] of Object.entries(Compositor.EFFECTS[arg].props))
      props[k] = { value: v };
    l.effects.push({ id: "fx" + cpRid(), type: arg, bypass: false, props });
  } else if (name.startsWith("fx-")) {
    const i = l.effects.findIndex((f) => f.id === arg);
    if (i < 0) return;
    if (name === "fx-up" && i > 0)
      [l.effects[i - 1], l.effects[i]] = [l.effects[i], l.effects[i - 1]];
    if (name === "fx-down" && i < l.effects.length - 1)
      [l.effects[i + 1], l.effects[i]] = [l.effects[i], l.effects[i + 1]];
    if (name === "fx-bypass") l.effects[i].bypass = !l.effects[i].bypass;
    if (name === "fx-delete") {
      l.effects.splice(i, 1);
      if (cp.prop.startsWith("fx." + arg + ".")) cp.prop = "x";
    }
  } else if (name === "font") l.font = arg;
  else if (name === "bold") l.bold = !l.bold;
  else if (name === "align") l.align = arg;
  else if (name === "anim") l.animator = { ...(l.animator || {}), type: arg };
  else if (name === "anim-by") l.animator = { ...(l.animator || {}), by: arg };
  else if (name === "timing") {
    const a = l.animator || {},
      start = Number.isFinite(a.start) ? a.start : l.inFrame,
      end = Number.isFinite(a.end) ? a.end : start + 30;
    l.words =
      arg === "estimate"
        ? Compositor.estimateWords(
            l.text,
            start,
            end,
            a.by === "char" ? "char" : "word",
          )
        : [];
  } else if (name === "word-delete") l.words.splice(Number(arg), 1);
  else if (name === "word-add") {
    const last = l.words.at(-1);
    l.words.push({
      text: "字",
      startFrame: last?.endFrame || 0,
      endFrame: (last?.endFrame || 0) + 10,
    });
  } else return;
  cpTouch();
  render();
}
async function cpField(el) {
  const d = cp.doc,
    l = cpLayer(),
    v = el.value;
  if (el.dataset.cpProp !== undefined) {
    const path = el.dataset.cpProp,
      p = cpP(l, path),
      value =
        el.type === "number" ? cpNumber(v, Compositor.valueAt(p, cp.frame)) : v;
    if (typeof value === "string" && !Compositor.isColor(value))
      throw Error("顏色格式需為 #rrggbb 或 #rrggbbaa");
    // Animated property: editing sets (or adds) the key at the playhead; otherwise the static value.
    if (p.keys?.length) Compositor.setKey(p, cp.frame, value);
    else p.value = value;
    cp.prop = path;
  } else if (el.dataset.cpKeyframe !== undefined) {
    const p = cpP(l, cp.prop);
    Compositor.moveKey(
      p,
      Number(el.dataset.cpKeyframe),
      Math.max(0, Math.round(cpNumber(v, 0))),
    );
    cp.key = null;
  } else if (el.dataset.cpKeyvalue !== undefined) {
    const k = cpP(l, cp.prop).keys?.[Number(el.dataset.cpKeyvalue)];
    if (!k) return;
    k.value =
      el.type === "number"
        ? cpNumber(v, k.value)
        : Compositor.isColor(v)
          ? v
          : k.value;
  } else if (el.dataset.cpWord !== undefined) {
    const w = l.words[Number(el.dataset.cpWord)],
      key = el.dataset.cpWordKey;
    if (!w) return;
    w[key] =
      key === "text" ? String(v) : Math.max(0, Math.round(cpNumber(v, w[key])));
    delete w.estimated;
  } else {
    const field = el.dataset.cpField;
    if (field === "frame") {
      cpSetFrame(cpNumber(v, cp.frame));
      return render();
    }
    if (field === "title") d.title = String(v).slice(0, 100) || "未命名合成";
    else if (field === "width" || field === "height")
      d[field] = Math.max(
        16,
        Math.min(3840, Math.round(cpNumber(v, d[field]) / 2) * 2),
      );
    else if (field === "duration") {
      d.durationFrames = Math.max(
        1,
        Math.min(36000, Math.round(cpNumber(v, d.durationFrames))),
      );
      cpSetFrame(cp.frame);
    } else if (field === "background")
      d.background = Compositor.isColor(v) ? v : d.background;
    else if (!l) return;
    else if (field === "layer-name")
      l.name = String(v).slice(0, 60) || CP_KIND[l.kind];
    else if (field === "in")
      l.inFrame = Math.max(0, Math.round(cpNumber(v, l.inFrame)));
    else if (field === "out")
      l.outFrame = Math.max(l.inFrame + 1, Math.round(cpNumber(v, l.outFrame)));
    else if (field === "text") {
      l.text = String(v);
      // Words were cut from the old text; an estimate follows the new text, transcript timings are kept as edited.
      if (l.words?.some((w) => w.estimated)) {
        const a = l.animator || {};
        l.words = Compositor.estimateWords(
          l.text,
          Number.isFinite(a.start) ? a.start : l.inFrame,
          Number.isFinite(a.end) ? a.end : l.inFrame + 30,
          a.by === "char" ? "char" : "word",
        );
      }
    } else if (field === "font") l.font = String(v).trim().slice(0, 80);
    else if (field === "expr") {
      const p = cpP(l, cp.prop);
      if (String(v).trim())
        p.expr = String(v).slice(0, Compositor.EXPR.maxLength);
      else delete p.expr;
    } else if (field === "points") l.points = cpPoints(v);
    else if (field === "mask-points") l.mask.points = cpPoints(v);
    else if (field === "anim-start" || field === "anim-end")
      l.animator = {
        ...(l.animator || {}),
        [field === "anim-start" ? "start" : "end"]: Math.max(
          0,
          Math.round(cpNumber(v, 0)),
        ),
      };
    else return;
  }
  cpTouch();
  render();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-cp-action]");
  if (!b || b.disabled) return;
  e.preventDefault();
  cpAction(b.dataset.cpAction).catch((error) => {
    cp.status = error.message;
    const box = document.querySelector("[data-cp-status]");
    if (box) box.textContent = error.message;
    SeedStar.reportError(error);
  });
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (
    !el.closest?.('[data-tool-flow="compose"]') ||
    !(
      el.dataset.cpProp !== undefined ||
      el.dataset.cpField ||
      el.dataset.cpKeyframe !== undefined ||
      el.dataset.cpKeyvalue !== undefined ||
      el.dataset.cpWord !== undefined
    )
  )
    return;
  cpField(el).catch((error) => {
    cp.status = error.message;
    SeedStar.reportError(error);
  });
});
// Mini timeline: drag a key diamond to move it (commits on release).
document.addEventListener("pointerdown", (e) => {
  const diamond = e.target.closest?.("[data-cp-key]");
  if (!diamond || !cp.doc) return;
  e.preventDefault();
  const lane = diamond.closest("[data-cp-mini]"),
    i = Number(diamond.dataset.cpKey),
    l = cpLayer(),
    p = l && cpP(l, cp.prop);
  if (!p?.keys?.[i]) return;
  let frame = p.keys[i].frame,
    moved = false;
  diamond.setPointerCapture(e.pointerId);
  diamond.onpointermove = (ev) => {
    const r = lane.getBoundingClientRect();
    frame = Math.round(
      Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) *
        (cp.doc.durationFrames - 1),
    );
    diamond.style.left =
      (frame / Math.max(1, cp.doc.durationFrames - 1)) * 100 + "%";
    moved = true;
  };
  diamond.onpointerup = diamond.onpointercancel = () => {
    diamond.onpointermove =
      diamond.onpointerup =
      diamond.onpointercancel =
        null;
    if (moved) {
      Compositor.moveKey(p, i, frame);
      cp.key = p.keys.findIndex((k) => k.frame === frame);
      cpSetFrame(frame);
      cpTouch();
    } else {
      cp.key = i;
      cpSetFrame(p.keys[i].frame);
    }
    render();
  };
});
document.addEventListener("input", (e) => {
  if (
    e.target.matches?.('input[type="range"][data-cp-field="frame"]') &&
    cp.doc
  ) {
    cpSetFrame(Number(e.target.value));
    const input = document.querySelector(
        'input[type="number"][data-cp-field="frame"]',
      ),
      clock = document.querySelector("[data-cp-clock]");
    if (input) input.value = cp.frame;
    if (clock)
      clock.textContent = (cp.frame / cpFps(cp.doc)).toFixed(2) + " 秒";
    cpPaint().catch(SeedStar.reportError);
  }
});
// Loaded after tools-0.js (so the other tools render without waiting for this file): a page opened at #compose
// rendered a placeholder first and is drawn again now; so is #rig (scripts/tools-rig.js loads just before this).
if (tool === "compose" || tool === "rig") render();
