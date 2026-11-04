"use client";

/**
 * CanvasEditor [1-i] — Fabric.js quick editor (upload image + add text + live preview).
 *
 * Design notes (plan §11):
 *  - Fabric is dynamic-import()ed inside useEffect so it NEVER loads on the server
 *    (it touches window/document). The parent page also loads this via next/dynamic
 *    ssr:false — belt and braces.
 *  - The source image is handed off via sessionStorage (key SOURCE_KEY), NOT a query
 *    string: our images are base64 data URLs (megabytes), which blow past URL limits.
 *  - crossOrigin:'anonymous' on every loaded image so the canvas never taints and
 *    export keeps working. (Real R2-CORS taint check is an integration test — plan §14.3.)
 *  - Export uses toDataURL('png') to match the codebase convention (designs/process APIs
 *    all speak base64 data URLs). Save reuses POST /api/tools/designs (same as Studio),
 *    so no new R2 wiring. Download is a plain anchor.
 *
 * Phase 1 target = internal admin. Customer-facing product canvas is Phase 2 (plan §11.1).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Canvas as FabricCanvas, FabricObject } from "fabric";
import { roleHeader } from "@/lib/ops-role";
import { CANVAS_NAME_KEY, toCanvasSrc, readCanvasSource } from "@/components/tools/canvas-handoff";
import { ensureAwFilters } from "./fabric-filters";
// 🎨 調色: the math, slider rows, presets and `adj` shape are public/editor-shared/color-grade.js (the Vector Editor loads the same file)
import { GRADE_SECTIONS, HSL_AXES, HSL_RANGES, PRESETS, REMOVE_COLOR_LIMITS, adoptAdj, applyAuto, buildFilterSpecs, clearRemoveColor, fmtValue, getPath, hasAnyHsl, hslNeutral, isGradeNeutral, limitOf, makeFilters, neutralAdj, resetGradeAdj, sanitizeAdj, setPath, setRemoveColor, type AdjState, type AutoKind, type HslKey } from "@/lib/studio/editor-color-grade";
// 🪄 去背: the AI 去背 request, its messages and the pixel pick are public/editor-shared/bg-remove.js (the Vector Editor loads the same file); the colour key is adj.removeColor
import { BG_MSG, hexAtClient, isRouteImage, keepViewAfterSwap, requestRemoveBg } from "@/lib/studio/editor-bg-remove";
import SidebarPanel from "@/components/tools/SidebarPanel";
import FontLibrary, { type FontPreset } from "@/components/tools/FontLibrary";
import { posterizeDataUrl } from "@/lib/studio/posterize";
// Pure-data import only (NOT generative-fill.ts — that uses Buffer/process.env, server-only).
import { OUTPAINT_PRESETS, OUTPAINT_LABELS, type OutpaintPreset } from "@/lib/studio/outpaint-presets";
import { EDGE_MASK_STYLES, applyEdgeMask, buildMaskSvg, type EdgeMaskId } from "@/lib/studio/edge-mask";
import { fitDisplayScale, convertUnit } from "@/lib/studio/canvas-fit";

// Edge-mask chip previews (asset → PNG maskUrl; procedural → tiny SVG). Computed once at import.
const EDGE_PREVIEWS = EDGE_MASK_STYLES.map((s) => ({
  id: s.id,
  zh: s.label,
  en: s.labelEn,
  svg: s.maskUrl ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildMaskSvg(s.id, 44, 44, { amount: 62, seed: 7 }))}`,
}));

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Font choices for the text tool. Each value is a CSS font-family STACK (canvas 2D / Fabric
 * resolve fallbacks), covering Windows + macOS system fonts so CJK renders without a web-font
 * download: 黑體=JhengHei/PingFang, 明體=Noto/PMingLiU serif, 楷書=DFKai/Kaiti.
 */
const FONT_OPTIONS: FontPreset[] = [
  { label: "黑體（中）", value: '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif', cat: "cjk" },
  { label: "明體（中）", value: '"Noto Serif TC","Source Han Serif TC","PMingLiU",serif', cat: "cjk" },
  { label: "楷書（中）", value: '"DFKai-SB","BiauKai","Kaiti TC",serif', cat: "cjk" },
  { label: "圓體（中）", value: '"Yuanti TC","Microsoft JhengHei","Noto Sans TC",sans-serif', cat: "cjk" },
  { label: "Sans (En)", value: "Arial,Helvetica,sans-serif", cat: "latin" },
  { label: "Serif (En)", value: 'Georgia,"Times New Roman",serif', cat: "latin" },
  { label: "Mono (En)", value: '"Courier New",monospace', cat: "latin" },
  { label: "手寫 (En)", value: '"Comic Sans MS","Segoe Script",cursive', cat: "latin" },
];

/** Quadratic arc path the 弧形 toggle sets as a text's `path` (Fabric v7 text-on-path). */
function arcPathData(textWidth: number): string {
  const len = Math.max(220, textWidth * 1.5);
  return `M 0 80 Q ${len / 2} -20 ${len} 80`;
}

/** Fabric text-like object types whose font/colour/size the toolbar can edit. */
function isTextObject(o: { type?: string } | null | undefined): boolean {
  return !!o && (o.type === "i-text" || o.type === "text" || o.type === "textbox");
}

/**
 * 🎨 外觀 / 物件效果 — the style a shape carries. One shape of data for the controls, the "next new shape" default and the
 * selected object (mirror of nextStyle in public/vector-editor.html). fill "" / "transparent" = 無填色; grad = applied gradient or null.
 */
type GradCfg = { a: string; b: string; c: string; mid: boolean; type: "linear" | "radial"; angle: "0" | "90" | "45" | "135" };
type FxCfg = { type: "none" | "shadow" | "glow"; color: string; blur: number; off: number };
type ObjStyle = {
  fill: string; grad: GradCfg | null; stroke: string; strokeWidth: number; dash: boolean; dashGap: number;
  rx: number; opacity: number; blend: string; fx: FxCfg; clip: "none" | "circle" | "round";
};
const DEFAULT_STYLE: ObjStyle = {
  fill: "transparent", grad: null, stroke: "#111111", strokeWidth: 4, dash: false, dashGap: 8,
  rx: 0, opacity: 100, blend: "normal", fx: { type: "none", color: "#000000", blur: 12, off: 6 }, clip: "none",
};
const DEFAULT_GRAD: GradCfg = { a: "#ff5e62", b: "#ff9966", c: "#ffe066", mid: false, type: "linear", angle: "0" };
const STYLE_KEYS = ["fill", "stroke", "strokeWidth", "dash", "rx", "opacity", "blend", "fx", "clip"] as const;
type StyleKey = (typeof STYLE_KEYS)[number];
const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "soft-light", "hard-light", "difference"];
const SWATCHES = ["#000000", "#ffffff", "#e63946", "#ff5e62", "#f1a208", "#ffd166", "#ffbe0b", "#06d6a0", "#2ec4b6", "#118ab2", "#3a86ff", "#073b4c", "#ef476f", "#7209b7", "#8338ec", "#fb5607", "#cbb47f", "#6c757d", "#495057", "#212529"];
const HEX6 = /^#[0-9a-f]{6}$/i;
function toHex6(c: unknown): string | null {
  if (typeof c !== "string") return null;
  if (HEX6.test(c)) return c.toLowerCase();
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : null;
}

/** The slice of a Fabric object the style code reads/writes. */
type StyleObj = {
  type?: string; fill?: unknown; stroke?: unknown; strokeWidth?: number; strokeDashArray?: number[] | null; rx?: number; opacity?: number;
  globalCompositeOperation?: string; width?: number; height?: number;
  shadow?: { offsetX?: number; offsetY?: number; blur?: number; color?: unknown } | null;
  clipPath?: { type?: string } | null;
  set: (p: Record<string, unknown>) => void;
};
type FabricNs = typeof import("fabric");

function makeGradient(fb: FabricNs, g: GradCfg, o: StyleObj) {
  const w = o.width || 100, h = o.height || 100; // object-local (unscaled) space: Fabric scales the fill with the object
  const colorStops = g.mid
    ? [{ offset: 0, color: g.a }, { offset: 0.5, color: g.c }, { offset: 1, color: g.b }]
    : [{ offset: 0, color: g.a }, { offset: 1, color: g.b }];
  if (g.type === "radial") {
    const cx = w / 2, cy = h / 2;
    return new fb.Gradient({ type: "radial", gradientUnits: "pixels", coords: { x1: cx, y1: cy, r1: 0, x2: cx, y2: cy, r2: Math.max(w, h) / 2 }, colorStops });
  }
  const coords = g.angle === "0" ? { x1: 0, y1: h / 2, x2: w, y2: h / 2 }
    : g.angle === "90" ? { x1: w / 2, y1: 0, x2: w / 2, y2: h }
    : g.angle === "45" ? { x1: 0, y1: 0, x2: w, y2: h }
    : { x1: w, y1: 0, x2: 0, y2: h };
  return new fb.Gradient({ type: "linear", gradientUnits: "pixels", coords, colorStops });
}
function makeShadow(fb: FabricNs, fx: FxCfg) {
  if (fx.type === "shadow") return new fb.Shadow({ color: fx.color, blur: fx.blur, offsetX: fx.off, offsetY: fx.off });
  if (fx.type === "glow") return new fb.Shadow({ color: fx.color, blur: Math.max(fx.blur, 10), offsetX: 0, offsetY: 0 }); // glow = offset-0 coloured shadow
  return null;
}
function makeClip(fb: FabricNs, kind: ObjStyle["clip"], o: StyleObj) {
  if (kind === "none") return undefined;
  const w = o.width ?? 100, h = o.height ?? 100;
  // clipPath positioned relative to the object's centre (default, non-absolute)
  if (kind === "circle") return new fb.Circle({ radius: Math.min(w, h) / 2, originX: "center", originY: "center" });
  return new fb.Rect({ width: w, height: h, rx: Math.min(w, h) * 0.15, ry: Math.min(w, h) * 0.15, originX: "center", originY: "center" });
}
function applyStyleTo(fb: FabricNs, o: StyleObj, st: ObjStyle, keys: readonly StyleKey[]) {
  const has = (k: StyleKey) => keys.includes(k);
  if (has("fill")) o.set({ fill: st.grad ? makeGradient(fb, st.grad, o) : st.fill });
  if (has("stroke")) o.set({ stroke: st.stroke });
  if (has("strokeWidth")) o.set({ strokeWidth: st.strokeWidth });
  if (has("dash")) o.set({ strokeDashArray: st.dash ? [st.dashGap, st.dashGap] : null });
  if (has("rx") && o.type === "rect") o.set({ rx: st.rx, ry: st.rx });
  if (has("opacity")) o.set({ opacity: st.opacity / 100 });
  if (has("blend")) o.set({ globalCompositeOperation: st.blend === "normal" ? "source-over" : st.blend });
  if (has("fx")) o.set({ shadow: makeShadow(fb, st.fx) });
  if (has("clip")) o.set({ clipPath: makeClip(fb, st.clip, o) });
}
/** Object → ObjStyle; what an object cannot tell (gradient-fill colour, effect colour when no effect…) stays as `fb`'s. */
function readStyle(o: StyleObj, fb: ObjStyle): ObjStyle {
  const f = o.fill as { type?: string; colorStops?: { color?: string }[]; coords?: { x1?: number; x2?: number; y1?: number; y2?: number } } | string | null | undefined;
  const isG = !!f && typeof f === "object" && Array.isArray(f.colorStops) && f.colorStops.length > 0;
  const st: ObjStyle = {
    fill: typeof f === "string" ? f : f == null ? "" : fb.fill, grad: null,
    stroke: typeof o.stroke === "string" ? o.stroke : fb.stroke, strokeWidth: o.strokeWidth ?? 0,
    dash: Array.isArray(o.strokeDashArray) && o.strokeDashArray.length > 0,
    dashGap: Array.isArray(o.strokeDashArray) && o.strokeDashArray[0] > 0 ? o.strokeDashArray[0] : fb.dashGap,
    rx: o.type === "rect" ? o.rx ?? 0 : 0, opacity: Math.round((o.opacity ?? 1) * 100),
    blend: o.globalCompositeOperation && o.globalCompositeOperation !== "source-over" ? o.globalCompositeOperation : "normal",
    fx: { ...fb.fx, type: "none" }, clip: "none",
  };
  if (isG && typeof f === "object" && f) {
    const cs = f.colorStops!, co = f.coords ?? {}, dx = (co.x2 ?? 0) - (co.x1 ?? 0), dy = (co.y2 ?? 0) - (co.y1 ?? 0);
    st.grad = {
      type: f.type === "radial" ? "radial" : "linear",
      a: toHex6(cs[0].color) ?? DEFAULT_GRAD.a, b: toHex6(cs[cs.length - 1].color) ?? DEFAULT_GRAD.b,
      mid: cs.length > 2, c: cs.length > 2 ? toHex6(cs[1].color) ?? DEFAULT_GRAD.c : DEFAULT_GRAD.c,
      angle: dx > 0 && Math.abs(dy) < 1e-6 ? "0" : Math.abs(dx) < 1e-6 && dy > 0 ? "90" : dx > 0 && dy > 0 ? "45" : "135",
    };
  }
  if (o.shadow) {
    const sh = o.shadow;
    st.fx = { type: !sh.offsetX && !sh.offsetY ? "glow" : "shadow", color: toHex6(sh.color) ?? fb.fx.color, blur: Math.round(sh.blur ?? 0), off: Math.round(Math.abs(sh.offsetX ?? 0)) };
  }
  if (o.clipPath) st.clip = o.clipPath.type === "circle" ? "circle" : "round";
  return st;
}

/** Project file shared with public/vector-editor.html (see exportDesign). */
const DESIGN_FORMAT = "awarewave-design/1";
type DesignMeta = { wv: number; hv: number; unit: "cm" | "mm" | "px"; dpi: number; bgColor?: string; transparent?: boolean };
/** Validate the `meta` block of a project file (either editor's, old or new); null = keep the current document size. */
function readDesignMeta(raw: unknown): DesignMeta | null {
  const m = raw as Partial<DesignMeta> | null | undefined;
  if (!m || typeof m !== "object") return null;
  const unit = m.unit === "cm" || m.unit === "mm" || m.unit === "px" ? m.unit : null;
  const { wv, hv, dpi } = m;
  if (!unit || typeof wv !== "number" || typeof hv !== "number" || typeof dpi !== "number") return null;
  if (!(wv > 0 && hv > 0 && dpi >= 1 && dpi <= 2400)) return null;
  return {
    wv, hv, unit, dpi,
    bgColor: typeof m.bgColor === "string" && /^#[0-9a-f]{6}$/i.test(m.bgColor) ? m.bgColor : undefined,
    transparent: typeof m.transparent === "boolean" ? m.transparent : undefined,
  };
}

// app/api/tools/designs/route.ts MAX_IMAGE_CHARS = 12_000_000 → shrink the data URL under it (WebP, then fewer
// pixels) instead of letting the save fail with 413 (Codex 32bc17ad F1, same class as vector-editor.html).
const UPLOAD_MAX_CHARS = 11_500_000;
async function uploadableDataUrl(url: string): Promise<string> {
  if (url.length <= UPLOAD_MAX_CHARS) return url;
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("decode failed")); img.src = url; });
  const oc = document.createElement("canvas");
  const g = oc.getContext("2d");
  if (!g) return url;
  let sc = 1;
  let out = url;
  while (out.length > UPLOAD_MAX_CHARS && sc > 0.05) {
    oc.width = Math.max(1, Math.round(img.width * sc));
    oc.height = Math.max(1, Math.round(img.height * sc));
    g.clearRect(0, 0, oc.width, oc.height);
    g.drawImage(img, 0, 0, oc.width, oc.height);
    out = oc.toDataURL("image/webp", 0.92);
    sc *= 0.85;
  }
  return out;
}

function triggerDownload(href: string, filename: string, revoke = false) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default function CanvasEditor() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  // Fabric v6/v7 dispose() is async (awaits an in-flight rAF render before detaching).
  // React 18 StrictMode mounts effects twice (mount→cleanup→mount); reusing the SAME
  // <canvas> node before the prior dispose finishes throws "already initialized" / leaks
  // listeners (fabricjs/fabric.js#10482, #8899). We park the dispose promise here and the
  // next mount AWAITS it before constructing a new Canvas on the node.
  const disposeRef = useRef<Promise<void> | null>(null);
  // Semantic download base name carried across the handoff (產品-主圖名稱-風格-編輯). Read +
  // cleared once on mount so it binds to THIS handoff and can't leak into a later direct
  // (sidebar-link) visit; set-only-when-found survives StrictMode's double mount.
  const nameRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  // Text style controls — drive new text + the currently-selected text object.
  const [textFont, setTextFont] = useState(FONT_OPTIONS[0].value);
  const [textColor, setTextColor] = useState("#111111");
  const [textSize, setTextSize] = useState(48);
  const [textInput, setTextInput] = useState("你的文字"); // 加文字 content (same input as vector-editor)
  const [textBold, setTextBold] = useState(false);
  const [textItalic, setTextItalic] = useState(false);
  const [textUnderline, setTextUnderline] = useState(false);
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right">("left");
  const [textSpacing, setTextSpacing] = useState(0); // charSpacing −100…800
  const [textLineH, setTextLineH] = useState(1.16); // lineHeight 0.8–3
  const [textArc, setTextArc] = useState(false); // 弧形 on/off
  const [textSelected, setTextSelected] = useState(false);
  const [imageSelected, setImageSelected] = useState(false); // an image object is selected → show 調色
  const [anySelected, setAnySelected] = useState(false); // any object selected → enable per-object tools
  const [lockSelected, setLockSelected] = useState(false); // selected object is locked (防呆 block)
  // 🎨 調色: every control of the panel edits this one object (shape + math = public/editor-shared/color-grade.js);
  // it is written to the selected image as `adj`, so selecting an image fills the controls and project save/load keep it
  const [adj, setAdj] = useState<AdjState>(() => neutralAdj());
  const [layers, setLayers] = useState<FabricObject[]>([]); // 圖層面板 (top layer first)
  const [selLayers, setSelLayers] = useState<FabricObject[]>([]); // objects currently selected on the canvas → highlighted rows
  const layersListRef = useRef<HTMLDivElement | null>(null);
  // ↩️ Undo/Redo — JSON snapshots of the canvas.
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  // bumped by every recorded edit (+ 透明底): 已存入 only sticks when nothing changed while the save was in flight
  const editSeqRef = useRef(0);
  // text-style edits call set() (no object:modified) → debounced undo step (Codex 85ff8658 F2);
  // ref because snapshot is declared later in this component.
  const snapshotRef = useRef<() => void>(() => {});
  const textSnapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoringRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // 畫布尺寸 / DPI（公分↔像素；參考 vector-trace-demo）
  const [szW, setSzW] = useState(9);
  const [szH, setSzH] = useState(5.4);
  const [szUnit, setSzUnit] = useState<"cm" | "mm" | "px">("cm");
  const [szDpi, setSzDpi] = useState(300);
  const [szInfo, setSzInfo] = useState<string | null>(null);
  // 畫布底色 / 匯出透明底 — same two controls as vector-editor.html's 畫布尺寸 panel (merged 2026-11-04)
  const [bgColor, setBgColor] = useState("#ffffff");
  const [exportTransparent, setExportTransparent] = useState(false);
  // Editable download filename: auto-filled from upload filename or handoff name; user can override.
  const [editName, setEditName] = useState(() => {
    const now = new Date();
    return `canvas-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const canvasMetaRef = useRef<{ realW: number; realH: number; dispScale: number; dpi: number } | null>(null);
  const [viewPct, setViewPct] = useState(100); // 檢視縮放 % (display scale of the artboard; export is always real px)
  const [exportBusy, setExportBusy] = useState(false); // PDF build in flight
  // Download base name: handoff name until the user edits the input; illegal filename characters are replaced.
  // The document as the user sized it: the typed size when it still equals the real px (so 10×6 cm stays 10×6, not
  // 10.01×5.99 from a px round trip), else the real px converted into the current unit.
  const docMeta = useCallback(() => {
    const m = canvasMetaRef.current;
    const dpi = m?.dpi ?? szDpi;
    const toPxN = (v: number) => (szUnit === "px" ? Math.round(v) : Math.round(((szUnit === "mm" ? v / 10 : v) * dpi) / 2.54));
    const typed = !m || (toPxN(szW) === m.realW && toPxN(szH) === m.realH);
    const wv = typed ? szW : convertUnit(m!.realW, "px", szUnit, dpi);
    const hv = typed ? szH : convertUnit(m!.realH, "px", szUnit, dpi);
    const realW = m?.realW ?? toPxN(szW), realH = m?.realH ?? toPxN(szH);
    const cm = (v: number, real: number) => (szUnit === "cm" && typed ? v : szUnit === "mm" && typed ? v / 10 : +((real / dpi) * 2.54).toFixed(2));
    return { wv, hv, unit: szUnit, dpi, realW, realH, cmW: cm(wv, realW), cmH: cm(hv, realH) };
  }, [szW, szH, szUnit, szDpi]);
  const fileBase = useCallback(() => (nameRef.current || editName).replace(/[\\/:*?"<>|]/g, "-").trim() || "design", [editName]);
  const [drawMode, setDrawMode] = useState<"off" | "draw" | "erase">("off"); // 自由繪筆 / 橡皮擦
  const [drawColor, setDrawColor] = useState("#111111");
  const [drawWidth, setDrawWidth] = useState(6);
  const drawHandlerRef = useRef<((e: { path?: FabricObject }) => void) | null>(null);
  const [inpaintMode, setInpaintMode] = useState(false); // 🪄 painting a mask (removal or fill)
  const [inpaintBusy, setInpaintBusy] = useState(false);
  const [maskMode, setMaskMode] = useState<"remove" | "fill">("remove"); // what the painted mask does
  const [fillPrompt, setFillPrompt] = useState(""); // 生成填色 prompt (AI fills the masked area)
  const [outpaintPrompt, setOutpaintPrompt] = useState(""); // 擴圖 prompt — separate state (was shared with fillPrompt → bled across tools)
  const [brushSize, setBrushSize] = useState(34);
  // 🖼 擴圖 outpaint (flux-fill-pro) + 色調分離 posterize — both replace the selected image's pixels.
  const [outpaintDir, setOutpaintDir] = useState<OutpaintPreset>("Zoom out 1.5x");
  const [genBusy, setGenBusy] = useState(false); // outpaint / posterize / edge-mask in flight
  const [edgeAmount, setEdgeAmount] = useState(55);
  const [edgeStyleApplied, setEdgeStyleApplied] = useState<EdgeMaskId | null>(null);
  const [posterLevels, setPosterLevels] = useState(5);
  const [hslTab, setHslTab] = useState<HslKey>("all"); // which HSL range the mixer sliders show
  // 🪄 去背: the colour-key controls (applied = adj.removeColor), AI 去背 busy flag + message, and whether the selected image still has its pre-AI source
  const [keyColor, setKeyColor] = useState("#ffffff");
  const [keyDist, setKeyDist] = useState(REMOVE_COLOR_LIMITS.neutral);
  const [bgBusy, setBgBusy] = useState(false);
  const bgBusyRef = useRef(false);
  const [bgMsg, setBgMsg] = useState<{ text: string; busy: boolean }>({ text: BG_MSG.intro, busy: false });
  const [hasBgOriginal, setHasBgOriginal] = useState(false);
  // 🗂 群組 — track whether the active selection can be grouped / ungrouped.
  const [multiSelected, setMultiSelected] = useState(false); // ActiveSelection (≥2 objects)
  const [groupSelected, setGroupSelected] = useState(false); // a single Group object
  const inpaintImgRef = useRef<FabricObject | null>(null); // image being edited in inpaint mode
  const inpaintPathsRef = useRef<FabricObject[]>([]); // strokes painted as the mask
  // ✂️ 裁切 Crop — drag a rect over the selected image, apply → native cropX/cropY window (non-destructive, undoable).
  const [cropMode, setCropMode] = useState(false);
  const cropImgRef = useRef<FabricObject | null>(null); // image being cropped
  const cropRectRef = useRef<FabricObject | null>(null); // the draggable crop rectangle overlay
  // 🎨 外觀 / 物件效果 — objStyle = what the panel shows (the selected object's style, or the next-shape default when nothing is selected)
  const [objStyle, setObjStyle] = useState<ObjStyle>(DEFAULT_STYLE);
  const [fillPick, setFillPick] = useState("#3366ff"); // colour input value while the fill is 無填色 (an input needs a hex)
  const [gradCfg, setGradCfg] = useState<GradCfg>(DEFAULT_GRAD); // 漸層 controls; 套用漸層 = apply this config
  const nextStyleRef = useRef<ObjStyle>(DEFAULT_STYLE); // style of the next new shape (addShape reads it)
  const fabricNsRef = useRef<FabricNs | null>(null);
  const styleSnapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showStyle = useCallback((st: ObjStyle) => {
    setObjStyle((prev) => ({ ...st, fx: st.fx.type === "none" ? { ...prev.fx, type: "none" } : st.fx }));
    const fh = toHex6(st.fill);
    if (fh) setFillPick(fh);
    if (st.grad) setGradCfg(st.grad);
  }, []);
  // 🎨 per-image adjustments (#3/#4): userEditRef holds the OBJECT the user is editing (not a bool).
  // The debounced undo snapshot fires only when the filter effect's active object === userEditRef,
  // so a programmatic selection-sync (loadAdj) can never consume a flag meant for another object
  // (critic: object identity eliminates the async wrong-image / stuck-flag race class).
  const userEditRef = useRef<FabricObject | null>(null);
  const snapTimerRef = useRef<number | null>(null);
  // Mark the currently-active object as the target of a genuine user edit (called by slider handlers).
  const markEdit = useCallback(() => { userEditRef.current = fabricRef.current?.getActiveObject() ?? null; }, []);
  // Reset all adjustment sliders to neutral (programmatic — does NOT markEdit). Used after a bake
  // replaces the image (new pixels already include the look) and after undo/redo restore.
  const resetAdjToNeutral = useCallback(() => setAdj(neutralAdj()), []);

  // Container width for dynamic MAX_DISP — keeps canvas within viewport without horizontal scroll.
  const [containerWidth, setContainerWidth] = useState(650);
  // 🖥 Workspace height measured dynamically (container top → viewport bottom) instead of a hardcoded
  // calc(100vh - 110px): self-adjusts when the error banner appears or the description wraps, so the
  // workspace never overflows into a page scrollbar (critic follow-up on b1cc5bd8).
  const [workspaceH, setWorkspaceH] = useState(560);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  // Guards against auto-reapplying 書布尺寸 when window resizes before user clicks 套用書布.
  const sizedByCanvasApply = useRef(false);

  // ── init fabric canvas + load handed-off source image (client only) ──
  useEffect(() => {
    let disposed = false;
    let canvas: FabricCanvas | null = null;

    (async () => {
      // Let any previous instance finish tearing down before we reuse the DOM node.
      if (disposeRef.current) {
        try {
          await disposeRef.current;
        } catch {
          /* prior dispose errors are non-fatal here */
        }
      }
      const fabric = await import("fabric");
      if (disposed || !canvasElRef.current) return;
      fabricNsRef.current = fabric;

      // Force Canvas 2D filter backend so custom per-pixel filters (HslColorMixer) work correctly.
      // Fabric v7 defaults to WebGL (enableGLFiltering=true); custom filters that only implement
      // applyTo2d are silently skipped — WebGL runs the identity shader instead (critic 2026-06-29).
      (fabric as unknown as { config?: { configure(o: Record<string, unknown>): void } }).config?.configure({ enableGLFiltering: false });
      ensureAwFilters(fabric); // HSL mixer + blur filter classes → classRegistry, so undo / design load can revive them

      // Persist our custom `name` (圖層改名) through toJSON/loadFromJSON + design save. Must be set
      // class-level BEFORE any object is created (Fabric v7 concatenates customProperties into
      // every toObject; per-instance assignment is ignored). Confirmed: fabricjs discussion #10176.
      // The lock* props + hasControls ride along so a layer 🔒 survives undo/redo and design save/load.
      (fabric.FabricObject as unknown as { customProperties: string[] }).customProperties = [
        "name", "adj", "bgOriginal", "lockMovementX", "lockMovementY", "lockScalingX", "lockScalingY", "lockRotation", "hasControls",
      ];

      canvas = new fabric.Canvas(canvasElRef.current, {
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;
      // dev-only e2e probe (tests/e2e/editor-merge): real canvas + fabric namespace; stripped from production builds
      if (process.env.NODE_ENV !== "production") (window as unknown as { __cvTest?: unknown }).__cvTest = { canvas, fabric, undoStack: undoStack.current };
      // The artboard = the white canvas = the real export bounds. Give Fabric's wrapper a drop-shadow
      // + crisp border so it stands out from the grey checker workspace → the user sees exactly where
      // the usable area ends (Photoshop/Figma-style). setDimensions only touches size, not these.
      const wrap = canvas.wrapperEl; // typed HTMLDivElement (Fabric) → a future rename fails at compile
      if (wrap) {
        wrap.style.boxShadow = "0 3px 14px rgba(0,0,0,0.26)";
        wrap.style.outline = "1px solid rgba(128,128,128,0.5)";
        wrap.style.borderRadius = "2px";
        wrap.style.margin = "auto"; // centred when it fits, scrollable (not clipped) when 100% is larger than the workspace
        wrap.style.flex = "none";
      }
      // Default 800×800 document so the auto-fit (relayoutCanvas) has a real size to scale from even
      // before a handoff/upload. Export uses these realW/realH. (Was null → no auto-fit on direct visit.)
      canvasMetaRef.current = { realW: 800, realH: 800, dispScale: 1, dpi: szDpi };
      setReady(true);

      // 🎨 Load an image's saved adjustments into the controls (or neutral). An image with filters but no usable adj gets them as
      // adj.legacy (adoptAdj), so the rebuild below keeps them. Sets state WITHOUT touching userEditRef → no undo step for a mere selection.
      const loadAdj = (img: { adj?: unknown; filters?: unknown[] } | null) => setAdj(img ? adoptAdj(img.adj, img.filters) : neutralAdj());

      // Keep the toolbar in sync with the selected text object (and vice-versa).
      const syncFromSelection = () => {
        const o = canvas.getActiveObject() as
          | { type?: string; fontFamily?: unknown; fill?: unknown; fontSize?: unknown; fontWeight?: unknown; fontStyle?: unknown; underline?: unknown; textAlign?: unknown; charSpacing?: unknown; lineHeight?: unknown; path?: unknown }
          | null;
        if (isTextObject(o)) {
          setTextSelected(true);
          if (typeof o!.fontFamily === "string") setTextFont(o!.fontFamily);
          if (typeof o!.fill === "string") setTextColor(o!.fill);
          if (typeof o!.fontSize === "number") setTextSize(Math.round(o!.fontSize));
          setTextBold(o!.fontWeight === "bold" || o!.fontWeight === 700);
          setTextItalic(o!.fontStyle === "italic");
          setTextUnderline(!!o!.underline);
          if (o!.textAlign === "left" || o!.textAlign === "center" || o!.textAlign === "right") setTextAlign(o!.textAlign);
          setTextSpacing(typeof o!.charSpacing === "number" ? o!.charSpacing : 0);
          setTextLineH(typeof o!.lineHeight === "number" ? o!.lineHeight : 1.16);
          setTextArc(!!o!.path);
        } else {
          setTextSelected(false);
        }
        setImageSelected(o?.type === "image");
        // 🎨 per-image adjustments (#3): load THIS image's saved sliders, or neutral for non-images.
        loadAdj(o?.type === "image" ? (o as unknown as { adj?: unknown; filters?: unknown[] }) : null);
        setHasBgOriginal(o?.type === "image" && !!(o as unknown as { bgOriginal?: string }).bgOriginal);
        // reflect THIS image's own applied edge style (or none) in the edge-mask panel
        setEdgeStyleApplied((o as unknown as { edgeStyle?: EdgeMaskId } | null)?.edgeStyle ?? null);
        setAnySelected(!!o);
        setMultiSelected((o as { type?: string } | null)?.type === "activeselection");
        setGroupSelected((o as { type?: string } | null)?.type === "group");
        setLockSelected(!!(o as { lockMovementX?: boolean } | null)?.lockMovementX);
        setSelLayers(canvas.getActiveObjects());
        // 🎨 外觀 / 物件效果: every control shows the selection's values (first object of a multi-selection)
        const rep0 = canvas.getActiveObjects()[0] ?? o;
        if (rep0) showStyle(readStyle(rep0 as unknown as StyleObj, nextStyleRef.current));
      };
      canvas.on("selection:created", syncFromSelection);
      canvas.on("selection:updated", syncFromSelection);
      canvas.on("selection:cleared", () => {
        setTextSelected(false);
        setImageSelected(false);
        loadAdj(null); // no image selected → sliders show neutral (not the last image's settings)
        setHasBgOriginal(false);
        setEdgeStyleApplied(null);
        setAnySelected(false);
        setMultiSelected(false);
        setGroupSelected(false);
        setLockSelected(false);
        setSelLayers([]);
        showStyle(nextStyleRef.current); // nothing selected → the controls show the next-shape default again
      });
      // 🗂 keep the layer panel in sync with the object stack.
      const onStack = () => {
        setLayers([...canvas.getObjects()].reverse());
        // any *user* edit re-enables 存入 My Designs; skip during undo/redo/load restore (critic N4).
        if (!restoringRef.current) setSaveState("idle");
        snapshot(); // record an undo step on add/remove/modify
      };
      canvas.on("object:added", onStack);
      canvas.on("object:removed", onStack);
      canvas.on("object:modified", onStack);
      setLayers([...canvas.getObjects()].reverse());
      snapshot(); // initial baseline so the first edit is undoable

      const source = typeof window !== "undefined" ? await readCanvasSource() : null;
      if (typeof window !== "undefined") {
        const handoffName = sessionStorage.getItem(CANVAS_NAME_KEY);
        if (handoffName) {
          nameRef.current = handoffName; // set-only-when-found → StrictMode-safe
          sessionStorage.removeItem(CANVAS_NAME_KEY); // consume so a later direct visit can't inherit it
          setEditName(handoffName);
        }
      }
      if (source) {
        try {
          // Remote R2 public URLs (gallery handoff) are cross-origin → taint the canvas under
          // crossOrigin:"anonymous". toCanvasSrc routes them through the same-origin image proxy
          // (data URLs from Banner/Studio/Tarot pass through unchanged). Was the "底圖載入失敗" cause.
          const img = await fabric.FabricImage.fromURL(toCanvasSrc(source), { crossOrigin: "anonymous" });
          if (disposed || !canvas) return;
          // Match the canvas to the imported image instead of forcing every handoff into
          // the default 800×800 square. Work in source-pixel coordinates and zoom the
          // preview down to fit; exportPng() restores the full source dimensions.
          const realW = Math.max(1, img.width || 800);
          const realH = Math.max(1, img.height || 800);
          // Fit the preview into the visible workspace (width AND height) so it never exceeds one
          // viewport. Export stays at realW/realH. Subsequent resizes go through relayoutCanvas().
          const el = canvasContainerRef.current;
          const availW = el ? Math.max(200, el.clientWidth - 36) : 650;
          const availH = el ? Math.max(220, el.clientHeight - 36) : 650;
          const dispScale = fitDisplayScale(realW, realH, availW, availH);
          canvas.setZoom(dispScale);
          canvas.setDimensions({
            width: Math.round(realW * dispScale),
            height: Math.round(realH * dispScale),
          });
          canvasMetaRef.current = { realW, realH, dispScale, dpi: szDpi };
          // 畫布尺寸 panel 反映「圖片的實際 px 尺寸」(非預設 9×5.4cm) — 一致且按套用不會縮回預設。
          setSzUnit("px");
          setSzW(realW);
          setSzH(realH);
          setSzInfo(`來源 ${realW}×${realH}px（預覽 ${Math.round(dispScale * 100)}%）`);
          img.set({
            left: realW / 2,
            top: realH / 2,
            originX: "center",
            originY: "center",
            selectable: true,
          });
          canvas.add(img);
          canvas.requestRenderAll();
        } catch (err) {
          // Surface the real reason in the console — the on-screen message stays user-friendly.
          console.warn("[canvas] 底圖載入失敗", err);
          setError("底圖載入失敗（可能是跨來源限制）。仍可加文字／上傳圖片。");
        }
      }
    })();

    return () => {
      disposed = true;
      // Cancel any pending debounced undo snapshot so it can't fire against a disposing canvas.
      if (snapTimerRef.current) { window.clearTimeout(snapTimerRef.current); snapTimerRef.current = null; }
      if (styleSnapTimer.current) { clearTimeout(styleSnapTimer.current); styleSnapTimer.current = null; }
      // dispose() detaches DOM listeners; ref cleared so a fast remount can't double-dispose.
      // Park the (async) dispose promise so the next mount can await it before reinit.
      const c = fabricRef.current;
      fabricRef.current = null;
      disposeRef.current = c
        ? Promise.resolve(c.dispose()).then(
            () => undefined,
            () => undefined
          )
        : null;
    };
  }, []);

  // Apply the 調色 adj (grade + 去白底/預設 + effects + HSL, built by the shared buildFilterSpecs) to the selected IMAGE.
  // Canvas is WYSIWYG: the filtered pixels are exactly what toDataURL exports.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type !== "image") return;
    let cancelled = false;
    void import("fabric").then((fabric) => {
      if (cancelled || fabricRef.current !== canvas) return;
      const F = (fabric as unknown as { filters: Record<string, new (o?: Record<string, unknown>) => object> }).filters;
      const aw = ensureAwFilters(fabric);
      const target = obj as unknown as { filters: object[]; applyFilters: () => void };
      target.filters = makeFilters((cls) => aw[cls] ?? F[cls], buildFilterSpecs(adj));
      target.applyFilters();
      canvas.requestRenderAll();
      setSaveState("idle"); // filter/adjust change is an edit → re-enable save
      // persist on THIS image so re-selecting it (or save/load, undo) restores the exact controls
      (obj as unknown as { adj?: AdjState }).adj = sanitizeAdj(adj);
      // ↩️ record ONE undo step after the user stops dragging (debounced). Only when THIS object
      // is the genuine edit target — never for selection-sync (loadAdj) or undo/redo restore.
      if (userEditRef.current === obj && !restoringRef.current) {
        userEditRef.current = null;
        if (snapTimerRef.current) window.clearTimeout(snapTimerRef.current);
        snapTimerRef.current = window.setTimeout(() => { snapTimerRef.current = null; snapshot(); }, 450);
      }
    });
    return () => {
      cancelled = true;
    };
    // snapshot intentionally omitted from deps (declared later; stable useCallback). userEditRef/snapTimerRef are refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adj]);

  const addText = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return; // unmounted/disposed mid-import
      // Center in REAL/object space (objects are zoom-independent); the canvas may now be zoomed by
      // auto-fit, so getWidth() (display px) would mis-place the text (critic Major).
      const m = canvasMetaRef.current;
      const z = canvas.getZoom() || 1;
      const text = new fabric.IText(textInput || "文字", {
        left: m ? m.realW / 2 : canvas.getWidth() / z / 2,
        top: m ? m.realH / 2 : canvas.getHeight() / z / 2,
        originX: "center",
        originY: "center",
        fontSize: textSize,
        fill: textColor,
        fontFamily: textFont,
        fontWeight: textBold ? "bold" : "normal",
        fontStyle: textItalic ? "italic" : "normal",
        underline: textUnderline,
        textAlign,
        charSpacing: textSpacing,
        lineHeight: textLineH,
      });
      if (textArc) {
        (text as unknown as { set: (p: Record<string, unknown>) => void }).set({
          path: new fabric.Path(arcPathData(text.width ?? 220), { fill: "", stroke: "" }),
        });
      }
      canvas.add(text);
      canvas.setActiveObject(text);
      setTextSelected(true);
      canvas.requestRenderAll();
    });
  }, [textInput, textFont, textColor, textSize, textBold, textItalic, textUnderline, textAlign, textSpacing, textLineH, textArc]);

  /** Apply a font/colour/size change to the selected text object (no-op if none). */
  const applyTextStyle = useCallback((patch: Record<string, unknown>) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const o = canvas.getActiveObject();
    if (isTextObject(o as { type?: string } | null)) {
      (o as unknown as { set: (p: Record<string, unknown>) => void }).set(patch);
      canvas.requestRenderAll();
      // one undo step per burst of slider/button changes, so 復原 undoes the style, not the object
      if (textSnapTimer.current) clearTimeout(textSnapTimer.current);
      textSnapTimer.current = setTimeout(() => { textSnapTimer.current = null; snapshotRef.current(); }, 300);
    }
  }, []);

  /** Toggle bold/italic/underline: flips the control state (= the default for the next text) and
   *  applies it to the selected text, if any. */
  const toggleText = useCallback((prop: "fontWeight" | "fontStyle" | "underline") => {
    if (prop === "fontWeight") { const on = !textBold; setTextBold(on); applyTextStyle({ fontWeight: on ? "bold" : "normal" }); }
    else if (prop === "fontStyle") { const on = !textItalic; setTextItalic(on); applyTextStyle({ fontStyle: on ? "italic" : "normal" }); }
    else { const on = !textUnderline; setTextUnderline(on); applyTextStyle({ underline: on }); }
  }, [applyTextStyle, textBold, textItalic, textUnderline]);

  // 🎨 外觀 / 物件效果 — every control = nextStyleRef patch (default for the next new shape) + the same keys written to the
  // selection. Style is not a move, so locked objects still take it. One undo step per burst (debounced like applyTextStyle).
  const commitStyle = useCallback(() => {
    setSaveState("idle");
    if (styleSnapTimer.current) clearTimeout(styleSnapTimer.current);
    styleSnapTimer.current = setTimeout(() => { styleSnapTimer.current = null; snapshotRef.current(); }, 300);
  }, []);
  const refreshStyleUI = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const a = canvas.getActiveObjects();
    showStyle(a.length ? readStyle(a[0] as unknown as StyleObj, nextStyleRef.current) : nextStyleRef.current);
  }, [showStyle]);
  const styleSet = useCallback((patch: Partial<ObjStyle>, keys: readonly StyleKey[], refresh = false) => {
    const canvas = fabricRef.current;
    const fb = fabricNsRef.current;
    if (!canvas || !fb) return;
    nextStyleRef.current = { ...nextStyleRef.current, ...patch };
    setObjStyle((s) => ({ ...s, ...patch }));
    const sel = canvas.getActiveObjects();
    if (sel.length) {
      sel.forEach((o) => applyStyleTo(fb, o as unknown as StyleObj, nextStyleRef.current, keys));
      canvas.requestRenderAll();
      commitStyle();
    }
    if (refresh) refreshStyleUI();
  }, [commitStyle, refreshStyleUI]);
  // a dashed stroke needs a visible width: bump a 0-width target to 2 (the selection, or the default when nothing is selected)
  const setDash = useCallback((on: boolean, gap: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const sel = canvas.getActiveObjects();
    if (on) {
      if (sel.length) sel.forEach((o) => { if (!((o as unknown as StyleObj).strokeWidth! >= 1)) (o as unknown as StyleObj).set({ strokeWidth: 2 }); });
      if (nextStyleRef.current.strokeWidth < 1) nextStyleRef.current = { ...nextStyleRef.current, strokeWidth: 2 };
    }
    styleSet({ dash: on, dashGap: Math.max(1, gap || 8) }, ["dash"], true);
  }, [styleSet]);
  const applyGradient = useCallback(() => styleSet({ grad: { ...gradCfg } }, ["fill"]), [styleSet, gradCfg]);
  const flipActive = useCallback((axis: "x" | "y") => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const sel = canvas.getActiveObjects() as unknown as (StyleObj & { flipX?: boolean; flipY?: boolean })[];
    if (!sel.length) return;
    sel.forEach((o) => o.set(axis === "x" ? { flipX: !o.flipX } : { flipY: !o.flipY }));
    canvas.requestRenderAll();
    commitStyle();
  }, [commitStyle]);
  // 💧 native EyeDropper (any screen pixel) where the browser has it; otherwise the next click on the artboard
  // picks that pixel (Firefox/Safari have no EyeDropper — same fallback as vector-editor.html, nobody loses the tool)
  const pickColor = useCallback(async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (ED) {
      try {
        const r = await new ED().open();
        styleSet({ fill: r.sRGBHex, grad: null }, ["fill"], true);
      } catch { /* cancelled (Esc) */ }
      return;
    }
    const c = fabricRef.current as unknown as {
      defaultCursor: string;
      lowerCanvasEl: HTMLCanvasElement;
      on: (ev: string, fn: (o: { e: MouseEvent }) => void) => void;
      off: (ev: string, fn: (o: { e: MouseEvent }) => void) => void;
      getActiveObjects: () => FabricObject[];
      discardActiveObject: () => void;
      setActiveObject: (o: FabricObject) => void;
      requestRenderAll: () => void;
    } | null;
    if (!c) return;
    const targets = c.getActiveObjects(); // the pick click (de)selects what is under it → restored below
    const prevCursor = c.defaultCursor;
    c.defaultCursor = "crosshair";
    const once = (opt: { e: MouseEvent }) => {
      c.off("mouse:down", once);
      c.defaultCursor = prevCursor;
      const el = c.lowerCanvasEl;
      const rect = el.getBoundingClientRect();
      const x = Math.floor((opt.e.clientX - rect.left) * (el.width / rect.width));
      const y = Math.floor((opt.e.clientY - rect.top) * (el.height / rect.height));
      const px = el.getContext("2d")?.getImageData(x, y, 1, 1).data;
      if (!px) return;
      const hex = "#" + [px[0], px[1], px[2]].map((n) => n.toString(16).padStart(2, "0")).join("");
      const apply = () => styleSet({ fill: hex, grad: null }, ["fill"], true);
      c.discardActiveObject();
      if (targets.length > 1) {
        // multi-selection is rebuilt async (fabric namespace) → apply only once it is back
        void import("fabric").then((fabric) => {
          c.setActiveObject(new fabric.ActiveSelection(targets, { canvas: c as unknown as InstanceType<typeof fabric.Canvas> }) as unknown as FabricObject);
          c.requestRenderAll();
          apply();
        });
        return;
      }
      if (targets.length === 1) c.setActiveObject(targets[0]);
      apply();
    };
    c.on("mouse:down", once);
  }, [styleSet]);

  // 〽️ 文字沿路徑 — make the selected text follow a curved (arc) path, or straighten it.
  const applyTextArc = useCallback((on: boolean) => {
    setTextArc(on); // also the default for the next text
    const canvas = fabricRef.current;
    const o = canvas?.getActiveObject() as unknown as (Record<string, unknown> & { width?: number }) | null;
    if (!canvas || !o || !isTextObject(o as { type?: string })) return;
    if (!on) {
      (o as unknown as { set: (p: Record<string, unknown>) => void }).set({ path: null });
      canvas.requestRenderAll();
      return;
    }
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return;
      const arc = new fabric.Path(arcPathData(o.width ?? 220), { fill: "", stroke: "" });
      (o as unknown as { set: (p: Record<string, unknown>) => void }).set({ path: arc });
      canvas.requestRenderAll();
    });
  }, []);

  // 🗂 圖層面板 — snapshot the canvas object stack (top layer first for display).
  const refreshLayers = useCallback(() => {
    const c = fabricRef.current;
    if (c) setLayers([...c.getObjects()].reverse());
  }, []);

  // ↩️ Undo/Redo — snapshot {canvas JSON, zoom} after each change; restore on undo/redo.
  // 畫布底色 picker follows the artboard after undo/redo/import (loadFromJSON restores `background`).
  const syncBgFromCanvas = useCallback(() => {
    const c = fabricRef.current as unknown as { backgroundColor?: unknown } | null;
    const bg = c?.backgroundColor;
    setBgColor(typeof bg === "string" && /^#[0-9a-f]{6}$/i.test(bg) ? bg : "#ffffff");
  }, []);
  const snapshot = useCallback(() => {
    if (restoringRef.current) return;
    editSeqRef.current++;
    const c = fabricRef.current as unknown as { toJSON: () => unknown; getZoom: () => number } | null;
    if (!c) return;
    undoStack.current.push(JSON.stringify({ json: c.toJSON(), zoom: c.getZoom() }));
    if (undoStack.current.length > 20) undoStack.current.shift(); // cap: base64 imgs are heavy
    redoStack.current = [];
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(false);
  }, []);
  snapshotRef.current = snapshot;
  const restore = useCallback(
    (snap: string) => {
      const c = fabricRef.current as unknown as
        | {
            loadFromJSON: (j: unknown) => Promise<unknown>;
            requestRenderAll: () => void;
            setZoom: (z: number) => void;
            getObjects: () => FabricObject[];
          }
        | null;
      if (!c) return;
      const parsed = JSON.parse(snap) as { json: unknown; zoom?: number };
      restoringRef.current = true; // stays true until load resolves (v7 loadFromJSON is async)
      void c.loadFromJSON(parsed.json).then(() => {
        if (typeof parsed.zoom === "number") c.setZoom(parsed.zoom);
        // loadFromJSON restores the filter MODEL but not the rendered result — re-apply.
        c.getObjects().forEach((o) => {
          const im = o as unknown as { type?: string; filters?: unknown[]; applyFilters?: () => void };
          if (im.type === "image" && im.filters && im.filters.length > 0 && im.applyFilters) im.applyFilters();
        });
        c.requestRenderAll();
        refreshLayers();
        resetAdjToNeutral(); // loadFromJSON clears selection → sliders back to neutral (no stale display)
        syncBgFromCanvas();
        restoringRef.current = false; // only now are all object:added events done
      });
    },
    [refreshLayers, resetAdjToNeutral, syncBgFromCanvas]
  );
  // a change still inside a debounce window (style / text / filter sliders) is history the user already sees → record it first
  const flushPendingSnaps = useCallback(() => {
    let pending = false;
    if (styleSnapTimer.current) { clearTimeout(styleSnapTimer.current); styleSnapTimer.current = null; pending = true; }
    if (textSnapTimer.current) { clearTimeout(textSnapTimer.current); textSnapTimer.current = null; pending = true; }
    if (snapTimerRef.current) { window.clearTimeout(snapTimerRef.current); snapTimerRef.current = null; pending = true; }
    if (pending) snapshot();
  }, [snapshot]);
  const undo = useCallback(() => {
    flushPendingSnaps();
    if (undoStack.current.length < 2) return;
    const cur = undoStack.current.pop();
    if (cur) redoStack.current.push(cur);
    restore(undoStack.current[undoStack.current.length - 1]);
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(redoStack.current.length > 0);
  }, [restore, flushPendingSnaps]);
  const redo = useCallback(() => {
    flushPendingSnaps();
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(next);
    restore(next);
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(redoStack.current.length > 0);
  }, [restore, flushPendingSnaps]);
  const selectLayer = useCallback((o: FabricObject) => {
    const c = fabricRef.current;
    if (!c) return;
    c.setActiveObject(o);
    c.requestRenderAll();
  }, []);
  const toggleLayerVisible = useCallback((o: FabricObject) => {
    const c = fabricRef.current;
    if (!c) return;
    // Normalise: undefined visible counts as shown, so the first hide-click actually hides.
    const shown = (o as unknown as { visible?: boolean }).visible !== false;
    (o as unknown as { set: (p: Record<string, unknown>) => void }).set({ visible: !shown });
    c.requestRenderAll();
    setSaveState("idle");
    snapshot(); // set() fires no object:modified → record the undo step here
    refreshLayers();
  }, [refreshLayers, snapshot]);
  const moveLayer = useCallback((o: FabricObject, dir: "up" | "down" | "front" | "back") => {
    const c = fabricRef.current as unknown as {
      bringObjectForward?: (o: FabricObject) => void;
      sendObjectBackwards?: (o: FabricObject) => void;
      bringObjectToFront?: (o: FabricObject) => void;
      sendObjectToBack?: (o: FabricObject) => void;
      getObjects: () => FabricObject[];
      requestRenderAll: () => void;
    } | null;
    if (!c) return;
    const before = c.getObjects().indexOf(o);
    if (dir === "up") c.bringObjectForward?.(o);
    else if (dir === "down") c.sendObjectBackwards?.(o);
    else if (dir === "front") c.bringObjectToFront?.(o);
    else c.sendObjectToBack?.(o);
    c.requestRenderAll();
    if (c.getObjects().indexOf(o) !== before) { setSaveState("idle"); snapshot(); } // stack change fires no event
    refreshLayers();
  }, [refreshLayers, snapshot]);
  // 🔒 per-layer lock: move/scale/rotate frozen, still selectable (so the row can unlock it again).
  const toggleLayerLock = useCallback((o: FabricObject) => {
    const c = fabricRef.current;
    if (!c) return;
    const lock = !(o as unknown as { lockMovementX?: boolean }).lockMovementX;
    (o as unknown as { set: (p: Record<string, unknown>) => void }).set({
      lockMovementX: lock,
      lockMovementY: lock,
      lockScalingX: lock,
      lockScalingY: lock,
      lockRotation: lock,
      hasControls: !lock,
      selectable: true,
    });
    if (c.getActiveObject() === o) setLockSelected(lock);
    c.requestRenderAll();
    setSaveState("idle");
    snapshot();
    refreshLayers();
  }, [refreshLayers, snapshot]);
  const duplicateLayer = useCallback((o: FabricObject) => {
    const c = fabricRef.current;
    if (!c) return;
    void (o as unknown as { clone: () => Promise<FabricObject> }).clone().then((clone) => {
      if (fabricRef.current !== c) return;
      (clone as unknown as { set: (p: Record<string, unknown>) => void }).set({
        left: ((o as unknown as { left?: number }).left ?? 0) + 24,
        top: ((o as unknown as { top?: number }).top ?? 0) + 24,
      });
      c.add(clone);
      c.setActiveObject(clone);
      c.requestRenderAll();
      refreshLayers();
    });
  }, [refreshLayers]);
  const deleteLayer = useCallback((o: FabricObject) => {
    const c = fabricRef.current;
    if (!c) return;
    c.remove(o);
    c.requestRenderAll();
    refreshLayers();
  }, [refreshLayers]);
  // ✏️ 圖層改名 — set a custom `name` (persisted via FabricObject.customProperties). prompt() is
  // bulletproof across browsers; the layer panel + layerLabel read this name first.
  const renameLayer = useCallback((o: FabricObject) => {
    const cur = String((o as unknown as { name?: string }).name ?? "");
    const next = typeof window !== "undefined" ? window.prompt("圖層名稱", cur) : null;
    if (next === null) return; // cancelled
    (o as unknown as { set: (p: Record<string, unknown>) => void }).set({ name: next.trim() || undefined });
    snapshot(); // record an undo step (set() doesn't fire object:modified)
    refreshLayers();
  }, [refreshLayers]);

  function layerLabel(o: FabricObject): string {
    const custom = (o as unknown as { name?: string }).name;
    if (custom) return `🏷 ${custom.slice(0, 14)}`; // 改過名的圖層優先顯示名稱
    const t = (o as { type?: string }).type;
    if (t === "group") return `🗂 群組(${(o as unknown as { getObjects?: () => unknown[] }).getObjects?.().length ?? 0})`;
    if (t === "i-text" || t === "textbox" || t === "text") {
      const s = String((o as { text?: string }).text ?? "文字").slice(0, 12);
      return `📝 ${s}`;
    }
    if (t === "image") return "🖼 圖片";
    if (t === "path") {
      // destination-out paths are eraser strokes (they erase whatever is below them).
      return (o as { globalCompositeOperation?: string }).globalCompositeOperation === "destination-out" ? "🧹 擦除" : "✏️ 筆畫";
    }
    const zh: Record<string, string> = { rect: "矩形", circle: "圓", triangle: "三角", line: "線", polygon: "多邊形", polyline: "折線" };
    return `🔷 ${zh[t ?? ""] ?? t ?? "物件"}`;
  }

  // 🖥 自動把畫布「顯示」縮放到塞進可用視窗（寬+高），實際輸出尺寸(canvasMetaRef.realW/H)不變 →
  // 畫布永遠不超過一頁高（參考 Banner Studio）。export 仍走 realW/realH 全解析度。
  const relayoutCanvas = useCallback(() => {
    const canvas = fabricRef.current as unknown as {
      setZoom: (z: number) => void; setDimensions: (d: { width: number; height: number }) => void; requestRenderAll: () => void;
    } | null;
    const m = canvasMetaRef.current;
    const el = canvasContainerRef.current;
    if (!canvas || !m || !el || typeof window === "undefined") return;
    // Fit inside the workspace container (fixed height) leaving a margin → the artboard floats with
    // grey checker around it, so its real bounds are visible (not mistaken for the whole white area).
    const availW = Math.max(200, el.clientWidth - 36);
    const availH = Math.max(220, el.clientHeight - 36);
    const dispScale = fitDisplayScale(m.realW, m.realH, availW, availH);
    canvas.setZoom(dispScale);
    canvas.setDimensions({ width: Math.round(m.realW * dispScale), height: Math.round(m.realH * dispScale) });
    canvasMetaRef.current = { ...m, dispScale };
    setViewPct(Math.round(dispScale * 100));
    canvas.requestRenderAll();
  }, []);

  // 🔍 檢視縮放 −／＋／100% — display scale only (objects + export stay in real px); 符合 = relayoutCanvas().
  const setViewScale = useCallback((s: number) => {
    const canvas = fabricRef.current;
    const m = canvasMetaRef.current;
    if (!canvas || !m) return;
    const z = Math.min(5, Math.max(0.05, s));
    canvas.setZoom(z);
    canvas.setDimensions({ width: Math.round(m.realW * z), height: Math.round(m.realH * z) });
    canvasMetaRef.current = { ...m, dispScale: z };
    setViewPct(Math.round(z * 100));
    canvas.requestRenderAll();
  }, []);

  // 📐 畫布尺寸 / DPI — cm/mm → px (round(cm·dpi/2.54)); set the real document size + rescale objects,
  // then relayoutCanvas() fits the display to the viewport. Export renders at full DPI (realW/realH).
  const applyCanvasSize = useCallback(() => {
    const canvas = fabricRef.current as unknown as {
      getWidth: () => number;
      getZoom: () => number;
      getObjects: () => FabricObject[];
      setZoom: (z: number) => void;
      setDimensions: (d: { width: number; height: number }) => void;
      requestRenderAll: () => void;
    } | null;
    if (!canvas) return;
    sizedByCanvasApply.current = true;
    // px unit = the value IS the real pixel size (no DPI conversion); cm/mm → px via DPI.
    const toPx = (v: number) => (szUnit === "px" ? Math.round(v) : Math.round(((szUnit === "mm" ? v / 10 : v) * szDpi) / 2.54));
    const realW = Math.max(1, toPx(szW));
    const realH = Math.max(1, toPx(szH));

    // The OLD working width in real-coordinate space (before this resize). First time = the
    // current element width ÷ current zoom; after a prior sizing = the stored realW.
    const prev = canvasMetaRef.current;
    const oldRealW = prev ? prev.realW : canvas.getWidth() / (canvas.getZoom() || 1);
    const factor = oldRealW > 0 ? realW / oldRealW : 1;
    // Rescale existing objects proportionally so the design keeps its relative layout
    // (setDimensions alone would NOT scale content — critic Critical 2026-06-14).
    if (Math.abs(factor - 1) > 1e-4) {
      canvas.getObjects().forEach((o) => {
        const oo = o as unknown as { left?: number; top?: number; scaleX?: number; scaleY?: number; set: (p: Record<string, unknown>) => void; setCoords: () => void };
        oo.set({
          left: (oo.left ?? 0) * factor,
          top: (oo.top ?? 0) * factor,
          scaleX: (oo.scaleX ?? 1) * factor,
          scaleY: (oo.scaleY ?? 1) * factor,
        });
        oo.setCoords();
      });
    }
    // Store the real document size, then fit the display to the viewport (width+height).
    canvasMetaRef.current = { realW, realH, dispScale: canvasMetaRef.current?.dispScale ?? 1, dpi: szDpi };
    relayoutCanvas();
    const ds = canvasMetaRef.current?.dispScale ?? 1;
    const cmW = +((realW / szDpi) * 2.54).toFixed(2);
    const cmH = +((realH / szDpi) * 2.54).toFixed(2);
    setSzInfo(`真實 ${realW}×${realH}px @${szDpi}DPI = ${cmW}×${cmH}cm（預覽 ${Math.round(ds * 100)}%）`);
  }, [szW, szH, szUnit, szDpi, relayoutCanvas]);

  // 📐 符合畫布 / 填滿畫布 — snap the selected image to the artboard (contain / cover). The artboard
  // (canvas) is the authoritative output size; images are content that conform to it. Fixes the
  // "畫布有畫布尺寸、圖有自己尺寸" disconnect the user hit.
  // 符合 / 填滿畫布 — the selection (any type, rotation kept) or, with nothing selected, every visible object as one block.
  // Same rule as vector-editor.html fitSel (operator 2026-11-04: the image-only version was unusable).
  const fitImageToCanvas = useCallback((mode: "fit" | "fill") => {
    type Box = { left: number; top: number; width: number; height: number };
    type Fit = FabricObject & { scaleX?: number; scaleY?: number; left?: number; top?: number; visible?: boolean; lockMovementX?: boolean;
      set: (p: Record<string, unknown>) => void; setCoords: () => void; getBoundingRect: () => Box; getObjects?: () => Fit[] };
    const canvas = fabricRef.current as unknown as {
      getActiveObject: () => Fit | null; getObjects: () => Fit[]; setActiveObject: (o: FabricObject) => void; discardActiveObject: () => void;
      getWidth: () => number; getHeight: () => number; getZoom: () => number; requestRenderAll: () => void;
    } | null;
    const fb = fabricNsRef.current;
    if (!canvas || !fb) return;
    let target = canvas.getActiveObject();
    let temp = false;
    if (!target) {
      const all = canvas.getObjects().filter((o) => o.visible !== false);
      if (!all.length) { setError("畫布上還沒有物件"); return; }
      if (all.length === 1) target = all[0];
      else {
        target = new fb.ActiveSelection(all as unknown as FabricObject[], { canvas: canvas as unknown as InstanceType<typeof fb.Canvas> }) as unknown as Fit;
        canvas.setActiveObject(target);
        temp = true;
      }
    }
    const locked = (o: Fit): boolean => !!o.lockMovementX || (o.getObjects?.() ?? []).some(locked);
    if (locked(target)) {
      if (temp) canvas.discardActiveObject();
      setError("有圖層已鎖定，先解鎖再貼合畫布"); // 🔒 programmatic moves honour the lock
      canvas.requestRenderAll();
      return;
    }
    setError(null);
    const m = canvasMetaRef.current;
    const z = canvas.getZoom() || 1;
    const aw = m ? m.realW : canvas.getWidth() / z; // artboard real width (px)
    const ah = m ? m.realH : canvas.getHeight() / z;
    target.setCoords();
    const b0 = target.getBoundingRect();
    const s = mode === "fill" ? Math.max(aw / (b0.width || 1), ah / (b0.height || 1)) : Math.min(aw / (b0.width || 1), ah / (b0.height || 1));
    target.set({ scaleX: (target.scaleX ?? 1) * s, scaleY: (target.scaleY ?? 1) * s });
    target.setCoords();
    const b = target.getBoundingRect();
    target.set({ left: (target.left ?? 0) + (aw - b.width) / 2 - b.left, top: (target.top ?? 0) + (ah - b.height) / 2 - b.top });
    target.setCoords();
    if (temp) canvas.discardActiveObject();
    canvas.requestRenderAll();
    setSaveState("idle");
    snapshot();
  }, [snapshot]);

  // ✂️ 裁切 Crop — overlay a draggable rect on the selected image; apply sets native cropX/cropY/
  // width/height (a window into the source) so it's non-destructive and undoable. Requires angle 0
  // (mirrors inpaint) so the box is axis-aligned. All math in object/real coords → zoom-independent.
  const enterCrop = useCallback(() => {
    const canvas = fabricRef.current;
    const img = canvas?.getActiveObject() as
      | (FabricObject & { type?: string; width?: number; height?: number; scaleX?: number; scaleY?: number; angle?: number; left?: number; top?: number; originX?: string; originY?: string; set: (p: Record<string, unknown>) => void })
      | null;
    if (!canvas || !img || img.type !== "image") { setError("請先點選一張圖片再裁切"); return; }
    if (((img.angle ?? 0) % 360) !== 0) { setError("請先把圖轉正（角度歸零）再裁切"); return; }
    // Flip mirrors the displayed pixels but cropX/cropY index the UNFLIPPED source → boxing the
    // flipped view would grab the mirror-image region. Block it (critic N3).
    if ((img as { flipX?: boolean; flipY?: boolean }).flipX || (img as { flipX?: boolean; flipY?: boolean }).flipY) {
      setError("請先取消翻轉再裁切"); return;
    }
    applyDrawMode("off");
    cropImgRef.current = img;
    const w = (img.width ?? 0) * (img.scaleX ?? 1);
    const h = (img.height ?? 0) * (img.scaleY ?? 1);
    const ox = img.originX === "center" ? 0.5 : img.originX === "right" ? 1 : 0;
    const oy = img.originY === "center" ? 0.5 : img.originY === "bottom" ? 1 : 0;
    const tlx = (img.left ?? 0) - w * ox;
    const tly = (img.top ?? 0) - h * oy;
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return;
      const rect = new fabric.Rect({
        left: tlx + w * 0.1, top: tly + h * 0.1, width: w * 0.8, height: h * 0.8,
        fill: "rgba(99,102,241,0.12)", stroke: "#6366f1", strokeWidth: 2, strokeDashArray: [6, 4],
        cornerColor: "#6366f1", transparentCorners: false, originX: "left", originY: "top", lockRotation: true,
      });
      (rect as unknown as { set: (p: Record<string, unknown>) => void }).set({ name: "__cropRect" });
      cropRectRef.current = rect as unknown as FabricObject;
      img.set({ selectable: false });
      restoringRef.current = true; // don't record the helper rect as an undo step
      canvas.add(rect as unknown as FabricObject);
      restoringRef.current = false;
      canvas.setActiveObject(rect as unknown as FabricObject);
      setCropMode(true);
      canvas.requestRenderAll();
    });
    // applyDrawMode declared below; body-only ref is fine, and "off" is stable regardless of its deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelCrop = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const rect = cropRectRef.current;
    if (rect) { restoringRef.current = true; canvas.remove(rect); restoringRef.current = false; }
    (cropImgRef.current as unknown as { set?: (p: Record<string, unknown>) => void } | null)?.set?.({ selectable: true });
    cropRectRef.current = null;
    cropImgRef.current = null;
    setCropMode(false);
    canvas.requestRenderAll();
  }, []);

  const applyCrop = useCallback(() => {
    const canvas = fabricRef.current;
    const img = cropImgRef.current as
      | (FabricObject & { width?: number; height?: number; scaleX?: number; scaleY?: number; cropX?: number; cropY?: number; left?: number; top?: number; originX?: string; originY?: string; set: (p: Record<string, unknown>) => void; _element?: { naturalWidth?: number; naturalHeight?: number } })
      | null;
    const rect = cropRectRef.current as
      | (FabricObject & { width?: number; height?: number; scaleX?: number; scaleY?: number; left?: number; top?: number })
      | null;
    if (!canvas || !img || !rect) return;
    const sx = img.scaleX ?? 1, sy = img.scaleY ?? 1;
    const rW = (rect.width ?? 0) * (rect.scaleX ?? 1);
    const rH = (rect.height ?? 0) * (rect.scaleY ?? 1);
    const rLeft = rect.left ?? 0, rTop = rect.top ?? 0; // crop rect has origin left/top
    // image rendered top-left in object coords (origin-agnostic)
    const iw = (img.width ?? 0) * sx, ih = (img.height ?? 0) * sy;
    const iox = img.originX === "center" ? 0.5 : img.originX === "right" ? 1 : 0;
    const ioy = img.originY === "center" ? 0.5 : img.originY === "bottom" ? 1 : 0;
    const iTLx = (img.left ?? 0) - iw * iox;
    const iTLy = (img.top ?? 0) - ih * ioy;
    const curCropX = img.cropX ?? 0, curCropY = img.cropY ?? 0;
    let ncx = curCropX + (rLeft - iTLx) / sx;
    let ncy = curCropY + (rTop - iTLy) / sy;
    let nw = rW / sx;
    let nh = rH / sy;
    // clamp the crop window to the source element bounds. If natural dims are unavailable, use
    // Infinity (no upper clamp) rather than a fabricated bound — for an already-cropped image
    // (curCropX≠0) `curCropX + width` is NOT the natural width and would silently shrink the crop.
    const elW = img._element?.naturalWidth || Infinity;
    const elH = img._element?.naturalHeight || Infinity;
    ncx = Math.max(0, Math.min(ncx, elW - 1));
    ncy = Math.max(0, Math.min(ncy, elH - 1));
    nw = Math.max(1, Math.min(nw, elW - ncx));
    nh = Math.max(1, Math.min(nh, elH - ncy));
    // normalise origin to top-left so left/top == the crop rect's top-left (display matches the box)
    img.set({ cropX: ncx, cropY: ncy, width: nw, height: nh, originX: "left", originY: "top", left: rLeft, top: rTop, selectable: true });
    (img as unknown as { setCoords: () => void }).setCoords();
    restoringRef.current = true; canvas.remove(rect); restoringRef.current = false;
    cropRectRef.current = null;
    cropImgRef.current = null;
    canvas.setActiveObject(img);
    setCropMode(false);
    canvas.requestRenderAll();
    refreshLayers();
    snapshot();
  }, [refreshLayers, snapshot]);

  // Auto-apply when DPI dropdown changes — only if the user has engaged 套用畫布尺寸 (otherwise the
  // default/handoff canvas would be reshaped to the 9×5.4cm szW/szH on a mere DPI tweak).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready && canvasMetaRef.current && sizedByCanvasApply.current) applyCanvasSize(); }, [szDpi]);

  // 🖥 Measure the workspace height = container top → viewport bottom (dynamic; replaces the
  // hardcoded calc(100vh-110px) so it self-adjusts to header reflow / an error banner appearing).
  const measureWorkspaceH = useCallback(() => {
    const el = canvasContainerRef.current;
    if (!el || typeof window === "undefined") return;
    const top = el.getBoundingClientRect().top;
    setWorkspaceH(Math.max(280, Math.round(window.innerHeight - top - 16)));
  }, []);
  // Re-measure on ready, when the error banner toggles (shifts the container top), and on resize.
  useEffect(() => { if (ready) measureWorkspaceH(); }, [ready, error, measureWorkspaceH]);
  // Re-fit the canvas display whenever it becomes ready or the workspace height changes.
  useEffect(() => {
    if (ready && canvasMetaRef.current) relayoutCanvas();
  }, [ready, workspaceH, relayoutCanvas]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => { measureWorkspaceH(); if (canvasMetaRef.current) relayoutCanvas(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measureWorkspaceH, relayoutCanvas]);

  // ResizeObserver: track canvas container width so MAX_DISP stays within viewport.
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(200, Math.floor(entry.contentRect.width));
        setContainerWidth((prev) => (Math.abs(prev - w) > 4 ? w : prev));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit display when the canvas container width changes (sidebar/window). Real size unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ready && canvasMetaRef.current) relayoutCanvas();
  }, [containerWidth]);

  // ✏️ 自由繪筆 / 🧹 橡皮擦 — change the canvas interaction mode. Eraser = a PencilBrush path
  // with globalCompositeOperation 'destination-out' (Fabric v7 has no EraserBrush), so the
  // stroke punches through whatever is below it. Mutually exclusive with inpaint mode.
  const applyDrawMode = useCallback((mode: "off" | "draw" | "erase") => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // detach any previous erase path:created handler
    if (drawHandlerRef.current) {
      canvas.off("path:created", drawHandlerRef.current as never);
      drawHandlerRef.current = null;
    }
    if (mode === "off") {
      canvas.isDrawingMode = false;
      setDrawMode("off");
      return;
    }
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return;
      // Re-detach post-await: a cold import could let a fast toggle attach two handlers (critic M1).
      if (drawHandlerRef.current) {
        canvas.off("path:created", drawHandlerRef.current as never);
        drawHandlerRef.current = null;
      }
      const brush = new fabric.PencilBrush(canvas);
      brush.width = drawWidth;
      brush.color = mode === "erase" ? "rgba(0,0,0,1)" : drawColor;
      canvas.freeDrawingBrush = brush;
      canvas.isDrawingMode = true;
      if (mode === "erase") {
        const h = (e: { path?: FabricObject }) => {
          if (e.path) {
            // destination-out erases below; non-selectable + non-evented so it doesn't sit on
            // top intercepting clicks (otherwise you can't select/edit the text underneath).
            (e.path as unknown as { set: (p: Record<string, unknown>) => void }).set({
              globalCompositeOperation: "destination-out",
              selectable: false,
              evented: false,
            });
            canvas.requestRenderAll();
          }
        };
        canvas.on("path:created", h as never);
        drawHandlerRef.current = h;
      }
      setDrawMode(mode);
    });
  }, [drawColor, drawWidth]);

  const uploadImage = useCallback((file: File | null) => {
    const canvas = fabricRef.current;
    if (!canvas || !file) return;
    // Use uploaded filename as the download base (strips extension, user can override in the input).
    setEditName(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      void import("fabric").then(async (fabric) => {
        const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });
        if (fabricRef.current !== canvas) return; // unmounted/disposed mid-import/decode
        // Fresh untouched canvas (no objects, no explicit 套用畫布尺寸) → adopt the image's native
        // size as the artboard so export is FULL resolution ("new from image"), not the 800 default.
        const fresh = canvas.getObjects().length === 0 && !sizedByCanvasApply.current;
        if (fresh && img.width && img.height) {
          canvasMetaRef.current = { realW: img.width, realH: img.height, dispScale: 1, dpi: szDpi };
          img.set({ left: img.width / 2, top: img.height / 2, originX: "center", originY: "center" });
          canvas.add(img);
          canvas.setActiveObject(img);
          relayoutCanvas(); // fit the now image-sized artboard into the viewport
          // 畫布尺寸 panel 反映圖片 px 尺寸（一致 + 按套用不會縮回預設）
          setSzUnit("px");
          setSzW(img.width);
          setSzH(img.height);
          setSzInfo(`來源 ${img.width}×${img.height}px（預覽 ${Math.round((canvasMetaRef.current?.dispScale ?? 1) * 100)}%）`);
          return;
        }
        // Otherwise place into the EXISTING artboard at ~70%, centred in real coords (zoom-independent).
        const m = canvasMetaRef.current;
        const z = canvas.getZoom() || 1;
        const aw = m ? m.realW : canvas.getWidth() / z;
        const ah = m ? m.realH : canvas.getHeight() / z;
        const scale = Math.min((aw * 0.7) / (img.width || 1), (ah * 0.7) / (img.height || 1), 1);
        img.scale(scale);
        canvas.add(img);
        img.set({ left: aw / 2, top: ah / 2, originX: "center", originY: "center" });
        (img as unknown as { setCoords: () => void }).setCoords();
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
      });
    };
    reader.readAsDataURL(file);
  }, [relayoutCanvas, szDpi]);

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.getActiveObjects().forEach((o: FabricObject) => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, []);

  // 🔒 物件鎖定積木 — lock/unlock the selected object's move/scale/rotate (防客人弄壞底圖).
  const toggleLock = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const o = canvas.getActiveObject();
    if (o) toggleLayerLock(o);
  }, [toggleLayerLock]);

  // 🔷 形狀積木 — add a basic shape (rect / circle / line) at canvas centre.
  const addShape = useCallback((kind: "rect" | "circle" | "line") => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return;
      // Center in REAL/object space (zoom-independent) so shapes land centered on the auto-fit canvas.
      const m = canvasMetaRef.current;
      const z = canvas.getZoom() || 1;
      const cx = m ? m.realW / 2 : canvas.getWidth() / z / 2;
      const cy = m ? m.realH / 2 : canvas.getHeight() / z / 2;
      let shape: FabricObject;
      if (kind === "rect") {
        shape = new fabric.Rect({ left: cx, top: cy, originX: "center", originY: "center", width: 200, height: 140 });
      } else if (kind === "circle") {
        shape = new fabric.Circle({ left: cx, top: cy, originX: "center", originY: "center", radius: 90 });
      } else {
        shape = new fabric.Line([cx - 120, cy, cx + 120, cy], {});
      }
      // the 外觀 panel's next-shape default (nothing selected → the controls edit this)
      applyStyleTo(fabric, shape as unknown as StyleObj, nextStyleRef.current, STYLE_KEYS);
      if ((kind === "line" || nextStyleRef.current.dash) && !((shape as unknown as StyleObj).strokeWidth! >= 1)) (shape as unknown as StyleObj).set({ strokeWidth: 2 }); // a 0-width line / dashed outline would be invisible
      canvas.add(shape);
      canvas.setActiveObject(shape);
      setAnySelected(true);
      canvas.requestRenderAll();
    });
  }, []);

  // 🗂 群組 — convert an ActiveSelection (≥2 objects) into a persistent Group. Fabric v6/v7
  // removed activeSelection.toGroup(); the manual recipe is discard (children → world coords) →
  // remove from canvas → new Group(objects) (re-parents into group-local coords) → add.
  // (web-researcher confirmed against fabricjs #7670 / source 2026-06-15.)
  const groupSelection = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as unknown as { type?: string; getObjects?: () => FabricObject[] } | null;
    if (!active || active.type !== "activeselection" || !active.getObjects) return;
    const objects = active.getObjects();
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return;
      // Gate the object:removed×N + object:added burst so the whole group op = ONE undo step.
      restoringRef.current = true;
      canvas.discardActiveObject();
      objects.forEach((o) => canvas.remove(o));
      const group = new fabric.Group(objects);
      canvas.add(group);
      canvas.setActiveObject(group);
      restoringRef.current = false;
      setGroupSelected(true);
      setMultiSelected(false);
      canvas.requestRenderAll();
      refreshLayers();
      snapshot();
    });
  }, [refreshLayers, snapshot]);

  // 🗂 解散群組 — Fabric v6/v7 removed group.toActiveSelection(); removeAll() restores each child's
  // world coords, then destroy() tears the group down (fabricjs discussion #10028).
  const ungroupSelection = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const group = canvas.getActiveObject() as unknown as
      | { type?: string; removeAll?: () => FabricObject[]; destroy?: () => void }
      | null;
    if (!group || group.type !== "group" || !group.removeAll) return;
    // Gate the burst so ungroup = ONE undo step (mirrors groupSelection).
    restoringRef.current = true;
    const children = group.removeAll();
    canvas.remove(group as unknown as FabricObject);
    group.destroy?.();
    children.forEach((o) => canvas.add(o));
    canvas.discardActiveObject();
    restoringRef.current = false;
    setGroupSelected(false);
    canvas.requestRenderAll();
    refreshLayers();
    snapshot();
  }, [refreshLayers, snapshot]);

  // 🎚 色調分離 Posterize — Fabric has no Posterize filter, so bake it: render the selected image
  // (filters included) at NATURAL resolution + no transform, quantize on a 2D canvas, then swap the
  // pixels back keeping the object's scale/angle/name. Non-destructive to layout; undoable.
  const posterizeSelected = useCallback(async () => {
    const canvas = fabricRef.current;
    const img = canvas?.getActiveObject() as
      | (FabricObject & {
          left?: number; top?: number; scaleX?: number; scaleY?: number; angle?: number;
          originX?: string; originY?: string; name?: string;
          toDataURL?: (o?: Record<string, unknown>) => string;
        })
      | null;
    if (!canvas || !img || img.type !== "image" || !img.toDataURL) return;
    setGenBusy(true);
    setError(null);
    try {
      const src = img.toDataURL({ format: "png", multiplier: 1, withoutTransform: true });
      const out = await posterizeDataUrl(src, posterLevels);
      const fabric = await import("fabric");
      // Selection may have moved/deleted during the CPU bake — don't replace a stale object
      // (mirrors toggleShadow's guard: check canvas AND that img is still the active object).
      if (fabricRef.current !== canvas || canvas.getActiveObject() !== img) return;
      const baked = await fabric.FabricImage.fromURL(out, { crossOrigin: "anonymous" });
      // withoutTransform gave natural pixels → reapply the original scale/angle/origin to land it
      // exactly where the old object sat.
      baked.set({
        left: img.left, top: img.top, angle: img.angle,
        scaleX: img.scaleX, scaleY: img.scaleY,
        originX: img.originX, originY: img.originY, name: img.name,
      });
      canvas.remove(img);
      canvas.add(baked);
      canvas.setActiveObject(baked);
      resetAdjToNeutral(); // baked pixels include the look → sliders/adj reset (no stale carry-over)
      canvas.requestRenderAll();
      refreshLayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenBusy(false);
    }
  }, [posterLevels, refreshLayers, resetAdjToNeutral]);

  // 🖼 擴圖 Outpaint — extend the selected image with flux-fill-pro's outpaint presets (no mask,
  // no coordinate math). Sends the natural-res image + prompt + preset; replaces with the larger
  // result at the SAME per-pixel scale so original content keeps size and the new area extends out.
  const applyOutpaint = useCallback(async () => {
    const canvas = fabricRef.current;
    const img = canvas?.getActiveObject() as
      | (FabricObject & { scaleX?: number; scaleY?: number; name?: string; toDataURL?: (o?: Record<string, unknown>) => string })
      | null;
    if (!canvas || !img || img.type !== "image" || !img.toDataURL) return;
    if (outpaintPrompt.trim().length < 2) {
      setError("請先描述要生成的內容（prompt）");
      return;
    }
    setGenBusy(true);
    setError(null);
    try {
      const src = img.toDataURL({ format: "png", multiplier: 1, withoutTransform: true });
      const res = await fetch("/api/tools/studio/genfill", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({ image: src, prompt: outpaintPrompt.trim(), outpaint: outpaintDir }),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
      if (!json.ok || !json.image) {
        setError(json.error ?? "擴圖失敗，請重試");
        return;
      }
      const fabric = await import("fabric");
      // Replicate poll is multi-second — bail if the user changed/deleted the selection meanwhile.
      if (fabricRef.current !== canvas || canvas.getActiveObject() !== img) return;
      const ext = await fabric.FabricImage.fromURL(json.image, { crossOrigin: "anonymous" });
      ext.set({ scaleX: img.scaleX ?? 1, scaleY: img.scaleY ?? 1, originX: "center", originY: "center", name: img.name });
      canvas.remove(img);
      canvas.add(ext);
      canvas.centerObject(ext);
      canvas.setActiveObject(ext);
      resetAdjToNeutral(); // outpainted result is fresh pixels → reset sliders/adj
      canvas.requestRenderAll();
      refreshLayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenBusy(false);
    }
  }, [outpaintPrompt, outpaintDir, refreshLayers, resetAdjToNeutral]);

  // ✂️ 邊緣遮罩 — mask the selected image through a brush/grunge shape → transparent PNG. Mirrors
  // posterizeSelected (natural-res dataURL → process → swap, keep transform). Masks from a stored
  // `edgeOriginal` so switching brushes REPLACES the edge instead of stacking masks. Client-only.
  const applyEdgeMaskToSelected = useCallback(async (styleId: EdgeMaskId) => {
    const canvas = fabricRef.current;
    const img = canvas?.getActiveObject() as
      | (FabricObject & {
          left?: number; top?: number; scaleX?: number; scaleY?: number; angle?: number;
          originX?: string; originY?: string; name?: string; edgeOriginal?: string;
          toDataURL?: (o?: Record<string, unknown>) => string;
        })
      | null;
    if (!canvas || !img || img.type !== "image" || !img.toDataURL) {
      setError("請先點選一張圖片，再套邊緣");
      return;
    }
    setGenBusy(true);
    setError(null);
    try {
      const base = img.edgeOriginal ?? img.toDataURL({ format: "png", multiplier: 1, withoutTransform: true });
      const res = await applyEdgeMask(base, styleId, { amount: edgeAmount, seed: 7 });
      if (!res.ok) {
        setError(`套邊失敗：${(res as { ok: false; error: string }).error}`);
        return;
      }
      const fabric = await import("fabric");
      // Selection may have changed during the async composite — don't replace a stale object.
      if (fabricRef.current !== canvas || canvas.getActiveObject() !== img) return;
      const baked = await fabric.FabricImage.fromURL(res.image, { crossOrigin: "anonymous" });
      baked.set({
        left: img.left, top: img.top, angle: img.angle,
        scaleX: img.scaleX, scaleY: img.scaleY,
        originX: img.originX, originY: img.originY, name: img.name,
      });
      (baked as unknown as Record<string, unknown>).edgeOriginal = base;
      (baked as unknown as Record<string, unknown>).edgeStyle = styleId;
      canvas.remove(img);
      canvas.add(baked);
      canvas.setActiveObject(baked);
      resetAdjToNeutral(); // edge-masked result is fresh pixels → reset sliders/adj
      canvas.requestRenderAll();
      refreshLayers();
      setEdgeStyleApplied(styleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenBusy(false);
    }
  }, [edgeAmount, refreshLayers, resetAdjToNeutral]);

  // 🪄 去背 — 去除此色 = adj.removeColor (a RemoveColor filter built from adj like every other entry, rebuilt by the [adj] effect);
  // AI 去背 swaps the image's own source in place (same object → left/top/scale/angle/flip/name/lock/adj stay) and keeps the first
  // pre-removal source in img.bgOriginal (customProperties → undo / save / load). 還原 clears the key + puts bgOriginal back; 調色 is not touched.
  type BgImg = FabricObject & {
    type?: string; cropX?: number; cropY?: number; width: number; height: number; scaleX: number; scaleY: number; bgOriginal?: string;
    _originalElement?: HTMLImageElement | HTMLCanvasElement; getElement: () => HTMLImageElement | HTMLCanvasElement;
    setSrc: (src: string, o?: { crossOrigin?: string }) => Promise<unknown>; set: (p: Record<string, unknown>) => void; setCoords: () => void; dirty?: boolean;
  };
  const bgEl = (img: BgImg) => (img._originalElement ?? img.getElement()) as HTMLImageElement & HTMLCanvasElement; // the unfiltered pixels, never the filtered copy
  const bgSourceUrl = (img: BgImg): string => {
    const el = bgEl(img);
    if (isRouteImage(el.src)) return el.src;
    const cv = document.createElement("canvas");
    cv.width = el.naturalWidth || el.width; cv.height = el.naturalHeight || el.height;
    cv.getContext("2d")?.drawImage(el, 0, 0);
    return cv.toDataURL("image/png");
  };
  const bgNaturalW = (img: BgImg) => { const el = bgEl(img); return el.naturalWidth || el.width || img.width; };
  const bgSwapSource = async (img: BgImg, url: string) => {
    const oldW = bgNaturalW(img);
    const before = { cropX: img.cropX, cropY: img.cropY, width: img.width, height: img.height, scaleX: img.scaleX, scaleY: img.scaleY };
    await img.setSrc(url, { crossOrigin: "anonymous" });
    img.set(keepViewAfterSwap(before, oldW, bgNaturalW(img))); // crop window + display size keep their meaning if the pixel size changed (a shrunk upload)
    img.dirty = true;
    img.setCoords();
  };
  const applyBgAi = useCallback(async () => {
    const canvas = fabricRef.current;
    const img = canvas?.getActiveObject() as BgImg | null;
    if (!canvas || !img || img.type !== "image" || bgBusyRef.current) return;
    bgBusyRef.current = true;
    setBgBusy(true);
    setBgMsg({ text: BG_MSG.busy, busy: true });
    try {
      const src = bgSourceUrl(img);
      const r = await requestRemoveBg(await uploadableDataUrl(src));
      if (!r.ok) { setBgMsg({ text: BG_MSG.failed((r as { ok: false; error: string }).error), busy: false }); return; }
      if (fabricRef.current !== canvas || !canvas.getObjects().includes(img)) return; // deleted / disposed while the cloud worked
      await bgSwapSource(img, (r as { ok: true; image: string }).image);
      if (!img.bgOriginal) img.bgOriginal = src;
      setHasBgOriginal(true);
      canvas.requestRenderAll();
      setSaveState("idle");
      snapshot(); // setSrc fires no object:modified → ONE undo step recorded here
      setBgMsg({ text: BG_MSG.ok, busy: false });
    } catch (err) {
      setBgMsg({ text: BG_MSG.failed(err instanceof Error ? err.message : String(err)), busy: false });
    } finally {
      bgBusyRef.current = false;
      setBgBusy(false);
    }
  // bgSourceUrl / bgSwapSource only read their arguments
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);
  // adj → filters on ONE given image (not the selection): for async work whose selection may have moved meanwhile
  const applyAdjToImage = useCallback(async (image: unknown, next: AdjState) => {
    const fabric = await import("fabric");
    const F = (fabric as unknown as { filters: Record<string, new (o?: Record<string, unknown>) => object> }).filters;
    const aw = ensureAwFilters(fabric);
    const t = image as { filters: object[]; applyFilters: () => void; adj?: AdjState };
    t.filters = makeFilters((cls) => aw[cls] ?? F[cls], buildFilterSpecs(next));
    t.applyFilters();
    t.adj = sanitizeAdj(next);
  }, []);
  const revertBg = useCallback(async () => {
    const canvas = fabricRef.current;
    const img = canvas?.getActiveObject() as BgImg | null;
    if (!canvas || !img || img.type !== "image" || bgBusyRef.current) return;
    const baseAdj = adj; // THIS image's adj — the selection (and the adj state) may move while the original decodes
    const hasKey = !!baseAdj.removeColor, orig = img.bgOriginal;
    if (!hasKey && !orig) { setBgMsg({ text: BG_MSG.nothingToRevert, busy: false }); return; }
    bgBusyRef.current = true;
    setBgBusy(true);
    try {
      if (orig) {
        await bgSwapSource(img, orig);
        delete img.bgOriginal;
        setHasBgOriginal(false);
      }
      if (hasKey && canvas.getActiveObject() === img) { markEdit(); setAdj(clearRemoveColor(baseAdj)); } // the [adj] effect rebuilds the filters; its debounced undo step covers the swap too
      else if (hasKey) { await applyAdjToImage(img, clearRemoveColor(baseAdj)); canvas.requestRenderAll(); setSaveState("idle"); snapshot(); } // selection moved (Codex 697e7d45 F2)
      else { canvas.requestRenderAll(); setSaveState("idle"); snapshot(); }
      setBgMsg({ text: BG_MSG.reverted, busy: false });
    } catch (err) {
      setBgMsg({ text: BG_MSG.revertFailed(err instanceof Error ? err.message : String(err)), busy: false });
    } finally {
      bgBusyRef.current = false;
      setBgBusy(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adj, markEdit, snapshot, applyAdjToImage]);
  // 💧 從圖片吸色: native EyeDropper where the browser has it; otherwise the next click on the artboard picks that pixel (same as 外觀 吸色)
  const pickKeyColor = useCallback(async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    const got = (hex: string) => { setKeyColor(hex); setBgMsg({ text: BG_MSG.picked(hex), busy: false }); };
    if (ED) {
      try { got((await new ED().open()).sRGBHex); } catch { /* cancelled (Esc) */ }
      return;
    }
    const c = fabricRef.current as unknown as {
      defaultCursor: string; lowerCanvasEl: HTMLCanvasElement;
      on: (ev: string, fn: (o: { e: MouseEvent }) => void) => void; off: (ev: string, fn: (o: { e: MouseEvent }) => void) => void;
      getActiveObjects: () => FabricObject[]; discardActiveObject: () => void; setActiveObject: (o: FabricObject) => void; requestRenderAll: () => void;
    } | null;
    if (!c) return;
    const targets = c.getActiveObjects(); // the pick click may deselect the image → put it back
    const prevCursor = c.defaultCursor;
    c.defaultCursor = "crosshair";
    setBgMsg({ text: BG_MSG.pickHint, busy: true });
    const once = (opt: { e: MouseEvent }) => {
      c.off("mouse:down", once);
      c.defaultCursor = prevCursor;
      c.discardActiveObject();
      if (targets.length === 1) c.setActiveObject(targets[0]);
      try { got(hexAtClient(c.lowerCanvasEl, opt.e.clientX, opt.e.clientY)); }
      catch (err) { setBgMsg({ text: BG_MSG.pickFailed(err instanceof Error ? err.message : String(err)), busy: false }); }
    };
    c.on("mouse:down", once);
  }, []);
  // the applied colour key shows in the controls when its image is selected
  useEffect(() => { if (adj.removeColor) { setKeyColor(adj.removeColor.color); setKeyDist(adj.removeColor.distance); } }, [adj.removeColor]);

  // 💾 設計檔（可再編輯）— export the full canvas JSON (custom `name` included via customProperties)
  // so a design can be reloaded and keep editing. Client-only: download a .design.json blob.
  // Shared with public/vector-editor.html: { format: "awarewave-design/1", json: <fabric toJSON incl. name + background>,
  // meta: { wv, hv, unit, dpi, bgColor, transparent } }. Load also accepts the old canvas shape (bare toJSON) and the
  // old vector shape ({ _proj, meta, w, h, canvas }).
  const exportDesign = useCallback(() => {
    const c = fabricRef.current as unknown as { toJSON: () => unknown; backgroundColor?: unknown } | null;
    if (!c) return;
    const { wv, hv, unit, dpi } = docMeta();
    const meta = { wv, hv, unit, dpi };
    const bg = typeof c.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(c.backgroundColor) ? c.backgroundColor : bgColor;
    const doc = { format: DESIGN_FORMAT, json: c.toJSON(), meta: { ...meta, bgColor: bg, transparent: exportTransparent } };
    triggerDownload(URL.createObjectURL(new Blob([JSON.stringify(doc)], { type: "application/json" })), `${fileBase()}.design.json`, true);
  }, [docMeta, bgColor, exportTransparent, fileBase]);

  const importDesign = useCallback(
    (file: File | null) => {
      const c = fabricRef.current as unknown as
        | { loadFromJSON: (j: unknown) => Promise<unknown>; requestRenderAll: () => void; getObjects: () => FabricObject[] }
        | null;
      if (!c || !file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let json: unknown;
        let meta: DesignMeta | null = null;
        try {
          const data = JSON.parse(reader.result as string) as Record<string, unknown>;
          json = data.json ?? data.canvas ?? data; // new envelope | old vector | old canvas (bare toJSON)
          meta = readDesignMeta(data.meta);
        } catch {
          setError("設計檔格式錯誤，無法載入");
          return;
        }
        restoringRef.current = true; // block snapshot() during the load's object:added burst
        void c.loadFromJSON(json).then(() => {
          c.getObjects().forEach((o) => {
            const im = o as unknown as { type?: string; filters?: unknown[]; applyFilters?: () => void };
            if (im.type === "image" && im.filters && im.filters.length > 0 && im.applyFilters) im.applyFilters();
          });
          if (meta) {
            // restore the real document size / unit / DPI / bg / transparent flag the file was saved with
            const toPxN = (v: number) => (meta!.unit === "px" ? Math.round(v) : Math.round(((meta!.unit === "mm" ? v / 10 : v) * meta!.dpi) / 2.54));
            const prev = canvasMetaRef.current;
            canvasMetaRef.current = { realW: Math.max(1, toPxN(meta.wv)), realH: Math.max(1, toPxN(meta.hv)), dispScale: prev?.dispScale ?? 1, dpi: meta.dpi };
            sizedByCanvasApply.current = true;
            setSzW(meta.wv); setSzH(meta.hv); setSzUnit(meta.unit); setSzDpi(meta.dpi);
            if (typeof meta.transparent === "boolean") setExportTransparent(meta.transparent);
            if (meta.bgColor) (c as unknown as { backgroundColor?: string }).backgroundColor = meta.bgColor;
            relayoutCanvas();
            const m2 = canvasMetaRef.current;
            setSzInfo(`真實 ${m2.realW}×${m2.realH}px @${meta.dpi}DPI = ${+((m2.realW / meta.dpi) * 2.54).toFixed(2)}×${+((m2.realH / meta.dpi) * 2.54).toFixed(2)}cm（預覽 ${Math.round(m2.dispScale * 100)}%）`);
          }
          c.requestRenderAll();
          refreshLayers();
          syncBgFromCanvas();
          setSaveState("idle");
          restoringRef.current = false;
          snapshot(); // record the loaded design as an undo baseline
        }).catch(() => {
          // A structurally-valid-but-bad fabric JSON can reject inside loadFromJSON — don't strand
          // restoringRef=true (that would silently disable ALL future undo snapshots).
          restoringRef.current = false;
          setError("設計檔載入失敗（內容無法解析）");
        });
      };
      reader.readAsText(file);
    },
    [refreshLayers, snapshot, relayoutCanvas, syncBgFromCanvas]
  );

  // 🪄 AI 去除不要的部分 — paint a mask over the unwanted region, send image+mask to bria/eraser.
  const startInpaint = useCallback((mode: "remove" | "fill") => {
    setMaskMode(mode);
    const canvas = fabricRef.current;
    if (!canvas) return;
    const img = canvas.getActiveObject();
    if (!img || img.type !== "image") return;
    applyDrawMode("off"); // inpaint and free-draw both use isDrawingMode — keep them exclusive
    inpaintImgRef.current = img;
    inpaintPathsRef.current = [];
    img.set({ selectable: false });
    canvas.discardActiveObject();
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return;
      const brush = new fabric.PencilBrush(canvas);
      brush.color = "rgba(220,40,40,0.55)"; // visible red while painting; recoloured white for the mask
      brush.width = brushSize;
      canvas.freeDrawingBrush = brush;
      canvas.isDrawingMode = true;
      const onPath = (e: { path?: FabricObject }) => {
        if (e.path) inpaintPathsRef.current.push(e.path);
      };
      (canvas as unknown as { __inpaintOnPath?: typeof onPath }).__inpaintOnPath = onPath;
      canvas.on("path:created", onPath as never);
      setInpaintMode(true);
      canvas.requestRenderAll();
    });
  }, [brushSize, applyDrawMode]);

  const exitInpaint = useCallback((keepPaths: boolean) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = false;
    const handler = (canvas as unknown as { __inpaintOnPath?: (e: unknown) => void }).__inpaintOnPath;
    if (handler) canvas.off("path:created", handler as never);
    if (!keepPaths) {
      inpaintPathsRef.current.forEach((p) => canvas.remove(p));
    }
    inpaintPathsRef.current = [];
    inpaintImgRef.current?.set({ selectable: true });
    inpaintImgRef.current = null;
    setInpaintMode(false);
    canvas.requestRenderAll();
  }, []);

  const applyInpaint = useCallback(async () => {
    const canvas = fabricRef.current;
    const img = inpaintImgRef.current as
      | (FabricObject & { width?: number; getBoundingRect: () => { left: number; top: number; width: number; height: number } })
      | null;
    if (!canvas || !img) return;
    if (inpaintPathsRef.current.length === 0) {
      setError("請先在要去除的地方塗抹一下");
      return;
    }
    // getBoundingRect returns an axis-aligned box; a rotated image would mis-crop the mask and
    // double-rotate the replacement (critic Major). Require an upright image (angle 0).
    if (((img as { angle?: number }).angle ?? 0) % 360 !== 0) {
      setError("請先把這張圖轉正（角度歸零）再處理");
      return;
    }
    if (maskMode === "fill" && fillPrompt.trim().length < 2) {
      setError("請先描述要生成的內容（prompt）");
      return;
    }
    setInpaintBusy(true);
    setError(null);
    try {
      const bbox = img.getBoundingRect();
      const mult = Math.min(4, Math.max(1, (img.width ?? bbox.width) / Math.max(1, bbox.width)));
      const crop = { left: bbox.left, top: bbox.top, width: bbox.width, height: bbox.height, multiplier: mult, format: "png" as const };

      // Source = the image as seen (filters baked), strokes hidden.
      inpaintPathsRef.current.forEach((p) => p.set({ visible: false }));
      canvas.requestRenderAll();
      const sourceUrl = canvas.toDataURL(crop);

      // Mask = white strokes on black, image hidden, same crop+multiplier → matches source size.
      const prevBg = (canvas as unknown as { backgroundColor?: string }).backgroundColor;
      img.set({ visible: false });
      inpaintPathsRef.current.forEach((p) => p.set({ visible: true, stroke: "#ffffff", fill: "" }));
      (canvas as unknown as { backgroundColor: string }).backgroundColor = "#000000";
      canvas.requestRenderAll();
      const maskUrl = canvas.toDataURL(crop);

      // restore visual state before the (slow) network call
      img.set({ visible: true });
      (canvas as unknown as { backgroundColor: string | undefined }).backgroundColor = prevBg;
      inpaintPathsRef.current.forEach((p) => p.set({ visible: false }));
      canvas.requestRenderAll();

      const endpoint = maskMode === "fill" ? "/api/tools/studio/genfill" : "/api/tools/studio/inpaint";
      const payload =
        maskMode === "fill"
          ? { image: sourceUrl, mask: maskUrl, prompt: fillPrompt.trim() }
          : { image: sourceUrl, mask: maskUrl };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
      if (!json.ok || !json.image) {
        setError(json.error ?? (maskMode === "fill" ? "生成失敗，請重試" : "去除失敗，請重試"));
        inpaintPathsRef.current.forEach((p) => p.set({ visible: true, stroke: "rgba(220,40,40,0.55)" }));
        canvas.requestRenderAll();
        return;
      }
      // Replace the edited image's pixels with the cleaned result (keep position/scale).
      const fabric = await import("fabric");
      if (fabricRef.current !== canvas) return;
      const cleaned = await fabric.FabricImage.fromURL(json.image, { crossOrigin: "anonymous" });
      cleaned.set({ left: img.left, top: img.top, scaleX: img.scaleX, scaleY: img.scaleY, angle: img.angle, originX: img.originX, originY: img.originY });
      inpaintPathsRef.current.forEach((p) => canvas.remove(p));
      inpaintPathsRef.current = [];
      canvas.remove(img);
      canvas.add(cleaned);
      canvas.setActiveObject(cleaned);
      resetAdjToNeutral(); // inpaint result is fresh pixels → reset sliders/adj
      inpaintImgRef.current = null;
      canvas.isDrawingMode = false;
      // Detach the path:created listener (critic Major #1 — success path must not leak it).
      const handler = (canvas as unknown as { __inpaintOnPath?: (e: unknown) => void }).__inpaintOnPath;
      if (handler) {
        canvas.off("path:created", handler as never);
        delete (canvas as unknown as { __inpaintOnPath?: unknown }).__inpaintOnPath;
      }
      setInpaintMode(false);
      canvas.requestRenderAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Restore the red strokes so a thrown error is retryable (critic Minor #3).
      const c = fabricRef.current;
      inpaintPathsRef.current.forEach((p) => p.set({ visible: true, stroke: "rgba(220,40,40,0.55)", fill: "" }));
      c?.requestRenderAll();
    } finally {
      setInpaintBusy(false);
    }
  }, [maskMode, fillPrompt, resetAdjToNeutral]);

  /** Run `fn` with the artboard in export state: selection dropped, 匯出透明底 honoured, zoom 1 at full real px
   *  (export is full-DPI), then the display restored. Every export below (PNG/WebP/SVG/PDF/存入) goes through this. */
  const withRealExport = useCallback(<T,>(fn: (c: FabricCanvas) => T): T | null => {
    const canvas = fabricRef.current as unknown as (FabricCanvas & {
      setZoom: (z: number) => void; getZoom: () => number;
      setDimensions: (d: { width: number; height: number }) => void; backgroundColor?: string;
    }) | null;
    if (!canvas) return null;
    canvas.discardActiveObject(); // drop selection handles from the export
    const prevBg = canvas.backgroundColor;
    if (exportTransparent) canvas.backgroundColor = "";
    const m = canvasMetaRef.current;
    const zoom = canvas.getZoom();
    if (m) { canvas.setZoom(1); canvas.setDimensions({ width: m.realW, height: m.realH }); }
    try {
      return fn(canvas);
    } finally {
      if (exportTransparent) canvas.backgroundColor = prevBg;
      if (m) { canvas.setZoom(zoom); canvas.setDimensions({ width: Math.round(m.realW * m.dispScale), height: Math.round(m.realH * m.dispScale) }); }
      canvas.requestRenderAll();
    }
  }, [exportTransparent]);

  /** Flatten the canvas to a PNG data URL (codebase convention — see file header). */
  const exportPng = useCallback((): string | null => withRealExport((c) => c.toDataURL({ format: "png", multiplier: 1 })), [withRealExport]);

  /** SVG of the artboard; width/height in real cm (from the document DPI) so print tools open it at true size. */
  const exportSvgString = useCallback((pdf: boolean): string | null => withRealExport((c) => {
    const m = canvasMetaRef.current;
    const rw = m?.realW ?? c.getWidth(), rh = m?.realH ?? c.getHeight();
    const dm = docMeta();
    const size = pdf ? { width: rw, height: rh } : { width: `${dm.cmW}cm`, height: `${dm.cmH}cm` };
    return (c as unknown as { toSVG: (o: unknown) => string }).toSVG({ ...size, viewBox: { x: 0, y: 0, width: rw, height: rh } });
  }), [withRealExport, docMeta]);

  const downloadSvg = useCallback(() => {
    const svg = exportSvgString(false);
    if (!svg) return;
    triggerDownload(URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), `${fileBase()}.svg`, true);
  }, [exportSvgString, fileBase]);

  // jspdf + svg2pdf.js load on click only → no bundle growth for the other pages.
  const downloadPdf = useCallback(async () => {
    const svg = exportSvgString(true);
    const m = canvasMetaRef.current;
    if (!svg || !m) return;
    setExportBusy(true);
    setError(null);
    let host: HTMLElement | null = null;
    try {
      const [{ jsPDF }, { svg2pdf }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
      const dm = docMeta();
      const wMm = dm.cmW * 10, hMm = dm.cmH * 10;
      const el = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement as unknown as SVGElement;
      host = document.createElement("div"); // svg2pdf reads computed styles → the element must be in the document
      host.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden";
      host.appendChild(document.importNode(el, true));
      document.body.appendChild(host);
      const doc = new jsPDF({ unit: "mm", format: [wMm, hMm], orientation: wMm >= hMm ? "landscape" : "portrait" });
      await svg2pdf(host.firstElementChild as SVGElement, doc, { x: 0, y: 0, width: wMm, height: hMm });
      doc.save(`${fileBase()}.pdf`);
    } catch (err) {
      setError(`PDF 失敗：${err instanceof Error ? err.message : String(err)}（改用 SVG 下載）`);
    } finally {
      host?.remove();
      setExportBusy(false);
    }
  }, [exportSvgString, fileBase, docMeta]);

  const download = useCallback(() => {
    const png = exportPng();
    if (!png) return;
    triggerDownload(png, `${fileBase()}.png`);
  }, [exportPng, fileBase]);

  const saveToDesigns = useCallback(async () => {
    const full = exportPng();
    if (!full) return;
    setSaveState("saving");
    setError(null);
    const seq = editSeqRef.current;
    try {
      const png = await uploadableDataUrl(full);
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({ image: png, prompt: "canvas edit", modelName: "canvas", source: "canvas" }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      setSaveState(json.ok ? (editSeqRef.current === seq ? "saved" : "idle") : "error");
      if (!json.ok) setError(json.error ?? "儲存失敗");
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [exportPng]);

  // 🔄 自動對比 / 自動色彩 / 自動色調 — pixel analysis of the selected image → sliders (analysis = shared applyAuto)
  const runAuto = useCallback((kind: AutoKind) => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject() as { type?: string; toDataURL?: (o?: Record<string, unknown>) => string } | null;
    if (!canvas || !obj || obj.type !== "image" || !obj.toDataURL) return;
    markEdit(); // auto-adjust is a user edit → undoable + persisted to img.adj
    const dataUrl = obj.toDataURL({ format: "png", multiplier: 1, withoutTransform: true });
    const img = new Image();
    img.onerror = () => setError("自動調整失敗：無法解碼圖片");
    img.onload = () => {
      // setAdj writes to whatever image is selected NOW → if the selection moved while decoding, drop it (same as vector-editor)
      if (fabricRef.current !== canvas || canvas.getActiveObject() !== (obj as unknown)) { setError("選取已變更，自動調整已取消"); return; }
      const oc = document.createElement("canvas");
      oc.width = img.width; oc.height = img.height;
      const ctx = oc.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      setAdj((a) => applyAuto(a, kind, d));
    };
    img.src = dataUrl;
  }, [markEdit]);

  // 💾 下載 WebP — export full-DPI canvas then compress to target size (≤ 200 KB).
  const downloadWebP = useCallback(async () => {
    const png = exportPng();
    if (!png) return;
    const img = new Image();
    await new Promise<void>((res) => { img.onload = () => res(); img.src = png; });
    const oc = document.createElement("canvas");
    oc.width = img.width; oc.height = img.height;
    const ctx2d = oc.getContext("2d");
    if (!ctx2d) { setError("WebP 下載失敗：無法建立畫布"); return; }
    ctx2d.drawImage(img, 0, 0);
    let quality = 0.9;
    let dataUrl = oc.toDataURL("image/webp", quality);
    // Base64 → bytes ratio: length × 0.75; iterate down until ≤ 200 KB.
    while (dataUrl.length * 0.75 > 200 * 1024 && quality > 0.6) {
      quality = Math.round((quality - 0.1) * 10) / 10;
      dataUrl = oc.toDataURL("image/webp", quality);
    }
    // still >200KB at quality 0.6 → fewer pixels, so the ≤200KB promise holds (Codex 32bc17ad F3)
    let sc = 1;
    while (dataUrl.startsWith("data:image/webp") && dataUrl.length * 0.75 > 200 * 1024 && sc > 0.05) {
      sc = Math.round(sc * 0.85 * 1000) / 1000;
      oc.width = Math.max(1, Math.round(img.width * sc));
      oc.height = Math.max(1, Math.round(img.height * sc));
      ctx2d.drawImage(img, 0, 0, oc.width, oc.height);
      dataUrl = oc.toDataURL("image/webp", quality);
    }
    triggerDownload(dataUrl, `${fileBase()}.webp`);
  }, [exportPng, fileBase]);

  // ⌨️ Adobe 風快捷鍵：Ctrl/⌘+Z 復原、Ctrl+Shift+Z / Ctrl+Y 重做、Delete/Backspace 刪除、Esc 取消
  // 當前模式。防呆：在輸入框/下拉打字、或畫布內編輯文字(i-text editing)時不攔截，讓打字/刪字正常。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      const ao = fabricRef.current?.getActiveObject() as { isEditing?: boolean } | null;
      if (ao?.isEditing) return; // editing canvas text → let keys reach the text
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z" && !e.shiftKey) {
        e.preventDefault();
        if (ready && canUndo && drawMode === "off" && !inpaintMode && !cropMode) undo();
      } else if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
        e.preventDefault();
        if (ready && canRedo && drawMode === "off" && !inpaintMode && !cropMode) redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (cropMode || inpaintMode || drawMode !== "off") return;
        if (ready && anySelected) { e.preventDefault(); deleteSelected(); }
      } else if (e.key === "Escape") {
        if (cropMode) cancelCrop();
        else if (inpaintMode) exitInpaint(false);
        else if (drawMode !== "off") applyDrawMode("off");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, canUndo, canRedo, drawMode, inpaintMode, cropMode, anySelected, undo, redo, deleteSelected, cancelCrop, exitInpaint, applyDrawMode]);

  // selecting on the canvas scrolls the first selected layer row into view (list box only, never the page)
  useEffect(() => {
    const box = layersListRef.current;
    const row = box?.querySelector<HTMLElement>('[data-sel="1"]');
    if (!box || !row) return;
    if (row.offsetTop < box.scrollTop) box.scrollTop = row.offsetTop - 4;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + 4;
  }, [selLayers, layers]);

  const canvasBusy = cropMode || inpaintMode;
  const objectToolsDisabled = !ready || canvasBusy || !anySelected;
  const imageToolsDisabled = !ready || canvasBusy || !imageSelected;
  const imageToolHint = !imageSelected ? "先選取圖片後才能使用。" : canvasBusy ? "先完成或取消目前的編輯模式。" : null;
  const objectToolHint = !anySelected ? "先選取畫布上的物件後才能使用。" : canvasBusy ? "先完成或取消目前的編輯模式。" : null;

  return (
    <div style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {/* compact one-line title (operator 2026-11-04: the header stole workspace height) */}
      <h1 style={{ fontSize: 14, margin: 0, lineHeight: 1.3 }}>✏️ Canvas Editor</h1>

      {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}

      {/* 畫布 + 右側可捲動工具欄（vector-trace-demo 風格）。面板垂直堆疊、可收合。 */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%" }}>
        <div
          ref={canvasContainerRef}
          style={{
            border: "1px solid var(--card-border)", borderRadius: 8, flex: 1, minWidth: 0,
            height: workspaceH, // dynamic workspace height (measured) → artboard floats centred inside it
            display: "flex", overflow: "auto", // the artboard wrapper has margin:auto → centred, and scrolls at 100%/zoom-in
            // 工作區 = 淡灰棋盤格（半透明灰，明暗主題皆可讀）。白色畫板(=匯出範圍)浮在上面、有陰影邊框 →
            // 一眼看出「灰格=非畫布、不可用」「白卡=真正可用範圍」。
            backgroundColor: "var(--card-bg)",
            backgroundImage:
              "linear-gradient(45deg, rgba(128,128,128,0.16) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.16) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.16) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.16) 75%)",
            backgroundSize: "22px 22px",
            backgroundPosition: "0 0, 0 11px, 11px -11px, -11px 0",
          }}
        >
          <canvas ref={canvasElRef} width={800} height={800} />
        </div>

        {/* 右側工具欄：固定寬、sticky 黏住視窗。maxHeight 綁同一個 workspaceH(=工作區可用高),
            這樣工具欄不會比工作區高 → 不撐出整頁捲軸;面板多時欄內自行捲動。 */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            position: "sticky",
            top: 12,
            alignSelf: "flex-start",
            maxHeight: workspaceH,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            paddingRight: 4,
          }}
        >
        {/* 🧰 常用快捷列（常駐，不收合）— 高頻動作一鍵到 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button className="btn-secondary" disabled={!ready || !canUndo || drawMode !== "off" || inpaintMode || cropMode} onClick={undo} title="復原 (Ctrl+Z)">↩️</button>
          <button className="btn-secondary" disabled={!ready || !canRedo || drawMode !== "off" || inpaintMode || cropMode} onClick={redo} title="重做 (Ctrl+Shift+Z)">↪️</button>
          <button className="btn-secondary" disabled={!ready} onClick={addText} title="加文字">＋文字</button>
          <label className="btn-secondary" style={{ cursor: ready ? "pointer" : "default" }} title="上傳圖案">
            ＋圖
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} disabled={!ready} onChange={(e) => { uploadImage(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          <button className="btn-secondary" disabled={!ready || !anySelected} onClick={deleteSelected} title="刪除選取 (Delete)">🗑</button>
          <button className="btn-secondary" disabled={!ready || inpaintMode || cropMode || !imageSelected} onClick={enterCrop} title="裁切選取的圖片">✂️ 裁切</button>
          {cropMode ? (
            <>
              <button className="btn-primary" onClick={applyCrop} title="套用裁切">✅ 套用</button>
              <button className="btn-secondary" onClick={cancelCrop} title="取消裁切 (Esc)">✖ 取消</button>
            </>
          ) : null}
        </div>

        {/* 🔍 檢視縮放 — same four controls as vector-editor.html 8. 檢視（−／符合／＋／100%）；只改預覽，匯出永遠是真實 px */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12, whiteSpace: "nowrap" }}>
          <span style={{ opacity: 0.6 }}>縮放</span>
          <span data-testid="view-pct" style={{ minWidth: 38, fontVariantNumeric: "tabular-nums" }}>{viewPct}%</span>
          <button className="btn-secondary" disabled={!ready} onClick={() => setViewScale((canvasMetaRef.current?.dispScale ?? 1) / 1.2)} title="縮小預覽">－</button>
          <button className="btn-secondary" disabled={!ready} onClick={relayoutCanvas} title="符合工作區">符合</button>
          <button className="btn-secondary" disabled={!ready} onClick={() => setViewScale((canvasMetaRef.current?.dispScale ?? 1) * 1.2)} title="放大預覽">＋</button>
          <button className="btn-secondary" disabled={!ready} onClick={() => setViewScale(1)} title="100%（實際像素）">100%</button>
        </div>

        {/* 📐 畫布尺寸 / DPI — 公分/公釐 + DPI 自設（參考 vector-trace-demo）。 */}
        <SidebarPanel id="canvas-size" title="📐 畫布尺寸 / DPI" defaultPos={{ x: 816, y: 0 }} width={236} defaultCollapsed>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                寬
                <input className="btn-secondary" type="number" min={szUnit === "px" ? 1 : 0.1} step={szUnit === "px" ? 1 : 0.1} value={szW} onChange={(e) => setSzW(Number(e.target.value))} style={{ width: "100%" }} />
              </label>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                高
                <input className="btn-secondary" type="number" min={szUnit === "px" ? 1 : 0.1} step={szUnit === "px" ? 1 : 0.1} value={szH} onChange={(e) => setSzH(Number(e.target.value))} style={{ width: "100%" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                單位
                <select className="btn-secondary" value={szUnit} onChange={(e) => {
                  const next = e.target.value as "cm" | "mm" | "px";
                  // Convert the displayed values so the size is preserved (e.g. 1234px → 10.45cm, not 1234cm).
                  setSzW(convertUnit(szW, szUnit, next, szDpi));
                  setSzH(convertUnit(szH, szUnit, next, szDpi));
                  setSzUnit(next);
                }}>
                  <option value="cm">公分 cm</option>
                  <option value="mm">公釐 mm</option>
                  <option value="px">像素 px</option>
                </select>
              </label>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                DPI
                <select className="btn-secondary" value={szDpi} onChange={(e) => setSzDpi(Number(e.target.value))}>
                  {[72, 150, 300, 600].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
            </div>
            <button className="btn-primary" onClick={applyCanvasSize}>套用畫布尺寸</button>
            {/* 📐 把選取的圖貼合畫布（畫布＝輸出尺寸，圖是內容） */}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} disabled={!ready || canvasBusy} onClick={() => fitImageToCanvas("fit")} title="選取物件（沒選＝全部）縮放到剛好放進畫布">符合畫布</button>
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} disabled={!ready || canvasBusy} onClick={() => fitImageToCanvas("fill")} title="選取物件（沒選＝全部）放大到填滿畫布（超出裁掉）">填滿畫布</button>
            </div>
            <span style={{ fontSize: 10, opacity: 0.5, lineHeight: 1.4 }}>畫布＝最終輸出尺寸。選物件（沒選＝全部）後用上面兩鍵貼合畫布。</span>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                畫布底色
                <input type="color" value={bgColor} disabled={!ready} title="畫布底色（匯出時也會帶上，除非勾透明底）" onChange={(e) => {
                  const v = e.target.value;
                  setBgColor(v);
                  const c = fabricRef.current as unknown as { backgroundColor?: string; requestRenderAll: () => void } | null;
                  if (!c) return;
                  c.backgroundColor = v;
                  c.requestRenderAll();
                  setSaveState("idle"); // a user edit → 存入 My Designs enabled again (Codex F1)
                  snapshot(); // background is canvas state, no object:modified fires (Codex F2)
                }} style={{ width: "100%", height: 30, padding: 2, border: "1px solid var(--card-border)", borderRadius: 4, cursor: "pointer" }} />
              </label>
              <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, paddingBottom: 6 }}>
                <input type="checkbox" checked={exportTransparent} onChange={(e) => { setExportTransparent(e.target.checked); editSeqRef.current++; setSaveState("idle"); }} />
                匯出透明底
              </label>
            </div>
            {szInfo ? <span style={{ fontSize: 11, opacity: 0.7 }}>{szInfo}</span> : null}
          </div>
        </SidebarPanel>

        {/* 🧰 更多工具 — 形狀 / 鎖定 / 群組 / 畫筆 / 橡皮擦 / 設計檔（低頻，收合省空間）*/}
        <SidebarPanel id="more-tools" title="🧰 形狀 / 畫筆 / 設計檔" defaultPos={{ x: 816, y: 0 }} width={280} defaultCollapsed>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, opacity: 0.6 }}>形狀</span>
              <button className="btn-secondary" disabled={!ready} onClick={() => addShape("rect")} title="加方框">▭</button>
              <button className="btn-secondary" disabled={!ready} onClick={() => addShape("circle")} title="加圓形">◯</button>
              <button className="btn-secondary" disabled={!ready} onClick={() => addShape("line")} title="加線條">／</button>
              <button className="btn-secondary" disabled={objectToolsDisabled} onClick={toggleLock} title={objectToolHint ?? "鎖定／解鎖選取物件（防誤移）"}>{lockSelected ? "🔒 已鎖定" : "🔓 鎖定"}</button>
              {multiSelected ? (<button className="btn-secondary" disabled={!ready || canvasBusy} onClick={groupSelection} title="把選取的多個物件組成群組">🗂 群組</button>) : null}
              {groupSelected ? (<button className="btn-secondary" disabled={!ready || canvasBusy} onClick={ungroupSelection} title="把群組拆回個別物件">🗂 解散</button>) : null}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <button className="btn-secondary" disabled={!ready || inpaintMode || cropMode} style={{ fontWeight: drawMode === "draw" ? 700 : 400 }} onClick={() => applyDrawMode(drawMode === "draw" ? "off" : "draw")} title="自由繪筆">✏️ 畫筆</button>
              <button className="btn-secondary" disabled={!ready || inpaintMode || cropMode} style={{ fontWeight: drawMode === "erase" ? 700 : 400 }} onClick={() => applyDrawMode(drawMode === "erase" ? "off" : "erase")} title="橡皮擦（擦掉畫到的地方）">🧹 橡皮擦</button>
              {drawMode !== "off" ? (
                <>
                  {drawMode === "draw" ? (<input type="color" value={drawColor} title="畫筆顏色" onChange={(e) => { setDrawColor(e.target.value); const c = fabricRef.current; if (c?.freeDrawingBrush) c.freeDrawingBrush.color = e.target.value; }} style={{ width: 30, height: 24, padding: 0 }} />) : null}
                  <input type="range" min={1} max={80} value={drawWidth} title="筆刷大小" onChange={(e) => { const w = Number(e.target.value); setDrawWidth(w); const c = fabricRef.current; if (c?.freeDrawingBrush) c.freeDrawingBrush.width = w; }} />
                </>
              ) : null}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 11, opacity: 0.6 }}>設計檔</span>
              <button className="btn-secondary" disabled={!ready || canvasBusy} onClick={exportDesign} title="匯出可再編輯的設計檔（.design.json）">💾 匯出</button>
              <label className="btn-secondary" style={{ cursor: ready ? "pointer" : "default" }} title="載入先前匯出的設計檔">
                📂 載入
                <input type="file" accept="application/json,.json" style={{ display: "none" }} disabled={!ready} onChange={(e) => { importDesign(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        </SidebarPanel>

        {/* 🔤 文字 — 整合：字型/顏色/字級 + 樣式切換(B/I/U/弧形) + 進階字型庫。放在圖層下方。
            (原「文字樣式」+「字型庫」兩面板合併,避免重複混淆。) */}
        <SidebarPanel id="text-style" title="🔤 文字" defaultPos={{ x: 816, y: 0 }} width={280} defaultCollapsed>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="btn-secondary" type="text" title="新文字內容" placeholder="輸入文字…" value={textInput} disabled={!ready} onChange={(e) => setTextInput(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              <button className="btn-primary" disabled={!ready || canvasBusy} onClick={addText} title="加文字" style={{ flex: "none" }}>加文字</button>
            </div>
            <span style={{ opacity: 0.6 }}>{textSelected ? "套用到選取文字" : "新文字預設（選取文字後改成套用到該文字）"}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 30 }}>顏色</span>
              <input type="color" title="文字顏色" value={textColor} disabled={!ready} onChange={(e) => { setTextColor(e.target.value); applyTextStyle({ fill: e.target.value }); }} style={{ width: 36, height: 24, padding: 0, border: "1px solid var(--card-border)", borderRadius: 4, cursor: "pointer" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 30 }}>字級</span>
              <input type="range" title="字級滑桿" min={8} max={200} step={1} value={Math.min(200, Math.max(8, textSize))} disabled={!ready} onChange={(e) => { const v = Number(e.target.value); setTextSize(v); applyTextStyle({ fontSize: v }); }} style={{ flex: 1 }} />
              <input className="btn-secondary" type="number" title="字級 px" min={2} step={1} value={textSize} disabled={!ready} onChange={(e) => { const v = Math.max(2, Number(e.target.value) || 2); setTextSize(v); applyTextStyle({ fontSize: v }); }} style={{ width: 76, padding: "4px 6px", fontVariantNumeric: "tabular-nums" }} />
            </div>
            {/* 樣式切換 */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn-secondary" disabled={!ready || canvasBusy} style={{ fontSize: 13, fontWeight: 700, outline: textBold ? "2px solid var(--accent)" : undefined }} title="粗體（切換）" onClick={() => toggleText("fontWeight")}>B</button>
              <button className="btn-secondary" disabled={!ready || canvasBusy} style={{ fontSize: 13, fontStyle: "italic", outline: textItalic ? "2px solid var(--accent)" : undefined }} title="斜體（切換）" onClick={() => toggleText("fontStyle")}>I</button>
              <button className="btn-secondary" disabled={!ready || canvasBusy} style={{ fontSize: 13, textDecoration: "underline", outline: textUnderline ? "2px solid var(--accent)" : undefined }} title="底線（切換）" onClick={() => toggleText("underline")}>U</button>
              <button className="btn-secondary" disabled={!ready || canvasBusy} style={{ fontSize: 12, outline: textArc ? "2px solid var(--accent)" : undefined }} title="弧形文字 開／關" onClick={() => applyTextArc(!textArc)}>〽️ 弧形</button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {([["left", "靠左"], ["center", "置中"], ["right", "靠右"]] as const).map(([k, label]) => (
                <button key={k} className="btn-secondary" disabled={!ready || canvasBusy} style={{ flex: 1, fontSize: 12, outline: textAlign === k ? "2px solid var(--accent)" : undefined }} title={`對齊：${label}`} onClick={() => { setTextAlign(k); applyTextStyle({ textAlign: k }); }}>{label}</button>
              ))}
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>字距</span><span style={{ opacity: 0.7 }}>{textSpacing}</span></span>
              <input type="range" title="字距" min={-100} max={800} step={1} value={textSpacing} disabled={!ready} onChange={(e) => { const v = Number(e.target.value); setTextSpacing(v); applyTextStyle({ charSpacing: v }); }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>行距</span><span style={{ opacity: 0.7 }}>{textLineH.toFixed(2)}</span></span>
              <input type="range" title="行距" min={0.8} max={3} step={0.02} value={textLineH} disabled={!ready} onChange={(e) => { const v = Number(e.target.value); setTextLineH(v); applyTextStyle({ lineHeight: v }); }} />
            </label>
            {/* 字型：搜尋＋中文／英文／全部＋預覽清單＋上傳；原內建字型堆疊列在最上方 */}
            <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ opacity: 0.6, fontSize: 11 }}>字型（搜尋 Google Fonts · 上傳字型檔）</span>
              <FontLibrary
                current={textFont}
                presets={FONT_OPTIONS}
                onPick={(family) => {
                  setTextFont(family);
                  applyTextStyle({ fontFamily: family });
                }}
              />
            </div>
          </div>
        </SidebarPanel>

        {/* 🎨 外觀 / 物件效果 — fill / stroke / dash / corner / opacity / blend / gradient / effect / flip / mask in ONE panel
            (same controls as public/vector-editor.html 3. 外觀). Nothing selected → edits the style of the next new shape. */}
        <SidebarPanel id="effects" title="🎨 外觀 / 物件效果" defaultPos={{ x: 816, y: 286 }} width={260} defaultCollapsed>
          <fieldset disabled={!ready || canvasBusy} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
            <span style={{ opacity: 0.6 }}>{anySelected ? "套用到選取物件" : "新物件預設（選取物件後改成套用到該物件）"}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                填色
                <input type="color" title="填色" value={toHex6(objStyle.fill) ?? fillPick} onChange={(e) => { setFillPick(e.target.value); styleSet({ fill: e.target.value, grad: null }, ["fill"]); }} style={{ width: "100%", height: 30, padding: 2, cursor: "pointer" }} />
              </label>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                描邊色
                <input type="color" title="描邊色" value={toHex6(objStyle.stroke) ?? "#111111"} onChange={(e) => styleSet({ stroke: e.target.value }, ["stroke"])} style={{ width: "100%", height: 30, padding: 2, cursor: "pointer" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12, outline: !objStyle.grad && (objStyle.fill === "" || objStyle.fill === "transparent") ? "2px solid var(--accent)" : undefined }} title="無填色" onClick={() => styleSet({ fill: "transparent", grad: null }, ["fill"], true)}>⊘ 無填色</button>
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} title="吸色（支援的瀏覽器可吸螢幕任一點；否則點畫布取色）" onClick={() => void pickColor()}>💧 吸色</button>
            </div>
            <div>
              <span style={{ opacity: 0.6 }}>色票（點選套用填色）</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4, marginTop: 4 }}>
                {SWATCHES.map((c) => (
                  <button key={c} title={c} aria-label={`色票 ${c}`} onClick={() => { setFillPick(c); styleSet({ fill: c, grad: null }, ["fill"], true); }} style={{ width: "100%", aspectRatio: "1", borderRadius: 5, border: "1px solid var(--card-border)", background: c, cursor: "pointer", padding: 0 }} />
                ))}
              </div>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>描邊寬度</span><span style={{ opacity: 0.7 }}>{objStyle.strokeWidth}</span></span>
              <input type="range" title="描邊寬度" min={0} max={40} value={Math.min(40, objStyle.strokeWidth)} onChange={(e) => styleSet({ strokeWidth: Number(e.target.value) }, ["strokeWidth"])} />
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" title="虛線" checked={objStyle.dash} onChange={(e) => setDash(e.target.checked, objStyle.dashGap)} /> 虛線
              </label>
              <input className="btn-secondary" type="number" title="虛線長度/間距" min={1} value={objStyle.dashGap} onChange={(e) => setDash(objStyle.dash, Number(e.target.value))} style={{ width: 70, padding: "4px 6px" }} />
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>圓角（矩形）</span><span style={{ opacity: 0.7 }}>{Math.round(objStyle.rx)}</span></span>
              <input type="range" title="圓角" min={0} max={200} value={Math.min(200, objStyle.rx)} onChange={(e) => styleSet({ rx: Number(e.target.value) }, ["rx"])} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>不透明度</span><span style={{ opacity: 0.7 }}>{objStyle.opacity}%</span></span>
              <input type="range" title="不透明度" min={0} max={100} value={objStyle.opacity} onChange={(e) => styleSet({ opacity: Number(e.target.value) }, ["opacity"])} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              混合模式
              <select className="btn-secondary" title="混合模式" value={objStyle.blend} onChange={(e) => styleSet({ blend: e.target.value }, ["blend"])}>
                {BLEND_MODES.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>漸層填色</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="color" title="漸層起色" value={gradCfg.a} onChange={(e) => setGradCfg((g) => ({ ...g, a: e.target.value }))} style={{ flex: 1, minWidth: 0, height: 30, padding: 2 }} />
                <input type="color" title="漸層終色" value={gradCfg.b} onChange={(e) => setGradCfg((g) => ({ ...g, b: e.target.value }))} style={{ flex: 1, minWidth: 0, height: 30, padding: 2 }} />
                <select className="btn-secondary" title="漸層類型" value={gradCfg.type} onChange={(e) => setGradCfg((g) => ({ ...g, type: e.target.value as GradCfg["type"] }))} style={{ width: 62 }}>
                  <option value="linear">線性</option><option value="radial">放射</option>
                </select>
                <select className="btn-secondary" title="漸層角度" value={gradCfg.angle} onChange={(e) => setGradCfg((g) => ({ ...g, angle: e.target.value as GradCfg["angle"] }))} style={{ width: 56 }}>
                  <option value="0">→</option><option value="90">↓</option><option value="45">↘</option><option value="135">↙</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" title="漸層中間色開關" checked={gradCfg.mid} onChange={(e) => setGradCfg((g) => ({ ...g, mid: e.target.checked }))} /> 中間色
                <input type="color" title="漸層中間色" value={gradCfg.c} onChange={(e) => setGradCfg((g) => ({ ...g, c: e.target.value }))} style={{ width: 48, height: 24, padding: 0 }} />
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} title="套用漸層" onClick={applyGradient}>套用漸層</button>
                <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} title="清除漸層" onClick={() => styleSet({ grad: null }, ["fill"], true)}>清除</button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>效果</span>
              <select className="btn-secondary" title="效果類型" value={objStyle.fx.type} onChange={(e) => styleSet({ fx: { ...objStyle.fx, type: e.target.value as FxCfg["type"] } }, ["fx"])}>
                <option value="none">無</option><option value="shadow">陰影 Drop shadow</option><option value="glow">光暈 Glow</option>
              </select>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  顏色
                  <input type="color" title="效果顏色" value={objStyle.fx.color} onChange={(e) => styleSet({ fx: { ...objStyle.fx, color: e.target.value } }, ["fx"])} style={{ width: "100%", height: 30, padding: 2 }} />
                </label>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ display: "flex", justifyContent: "space-between" }}><span>模糊</span><span style={{ opacity: 0.7 }}>{objStyle.fx.blur}</span></span>
                  <input type="range" title="效果模糊" min={0} max={60} value={objStyle.fx.blur} onChange={(e) => styleSet({ fx: { ...objStyle.fx, blur: Number(e.target.value) } }, ["fx"])} />
                </label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ display: "flex", justifyContent: "space-between" }}><span>位移</span><span style={{ opacity: 0.7 }}>{objStyle.fx.off}</span></span>
                <input type="range" title="效果位移" min={0} max={40} value={objStyle.fx.off} onChange={(e) => styleSet({ fx: { ...objStyle.fx, off: Number(e.target.value) } }, ["fx"])} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-secondary" disabled={!anySelected} style={{ flex: 1, fontSize: 12 }} title={anySelected ? "水平翻轉" : "先選取畫布上的物件後才能使用。"} onClick={() => flipActive("x")}>↔ 水平翻轉</button>
              <button className="btn-secondary" disabled={!anySelected} style={{ flex: 1, fontSize: 12 }} title={anySelected ? "垂直翻轉" : "先選取畫布上的物件後才能使用。"} onClick={() => flipActive("y")}>↕ 垂直翻轉</button>
            </div>
            {/* ✂️ 剪裁遮罩 clipPath */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ opacity: 0.6 }}>遮罩</span>
              {([["circle", "⬤", "圓形遮罩"], ["round", "▢", "圓角遮罩"], ["none", "無", "移除遮罩"]] as const).map(([k, label, title]) => (
                <button key={k} className="btn-secondary" style={{ fontSize: 12, outline: objStyle.clip === k ? "2px solid var(--accent)" : undefined }} title={title} onClick={() => styleSet({ clip: k }, ["clip"], true)}>{label}</button>
              ))}
            </div>
          </fieldset>
        </SidebarPanel>

        {/* 🗂 圖層面板 — 群組/解散 on top; rows (top layer first): show-hide, lock, name, rename, step/front/back, duplicate, delete. */}
        {layers.length > 0 ? (
          <SidebarPanel id="layers" title={`🗂 圖層（${layers.length}）`} defaultPos={{ x: 816, y: 244 }} width={280} defaultCollapsed>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} disabled={!ready || canvasBusy || !multiSelected} onClick={groupSelection} title="群組選取的多個物件">🗂 群組</button>
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} disabled={!ready || canvasBusy || !groupSelected} onClick={ungroupSelection} title="解散選取的群組">🗂 解散</button>
            </div>
            <div ref={layersListRef} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4, maxHeight: 520, overflowY: "auto" }}>
              {layers.map((o, i) => {
                const vis = (o as unknown as { visible?: boolean }).visible !== false;
                const locked = !!(o as unknown as { lockMovementX?: boolean }).lockMovementX;
                const sel = selLayers.includes(o);
                const ib = { background: "none", border: "none", cursor: "pointer", padding: 0 } as const;
                return (
                  <div key={i} data-layer-row="1" data-sel={sel ? "1" : "0"} data-hidden={vis ? "0" : "1"} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, border: `1px solid ${sel ? "var(--accent)" : "var(--card-border)"}`, background: sel ? "var(--accent-light)" : undefined, borderRadius: 4, padding: "3px 5px" }}>
                    <button title="顯示/隱藏" onClick={() => toggleLayerVisible(o)} style={ib}>{vis ? "👁" : "🚫"}</button>
                    <button title="鎖定/解鎖" onClick={() => toggleLayerLock(o)} style={ib}>{locked ? "🔒" : "🔓"}</button>
                    <button onClick={() => selectLayer(o)} onDoubleClick={() => renameLayer(o)} title="點選圖層（雙擊改名）" style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: vis ? 1 : 0.45 }}>{layerLabel(o)}</button>
                    <button title="改名" onClick={() => renameLayer(o)} style={ib}>✏️</button>
                    <button title="上移" onClick={() => moveLayer(o, "up")} style={ib}>↑</button>
                    <button title="下移" onClick={() => moveLayer(o, "down")} style={ib}>↓</button>
                    <button title="移至最前" onClick={() => moveLayer(o, "front")} style={ib}>⤒</button>
                    <button title="移至最後" onClick={() => moveLayer(o, "back")} style={ib}>⤓</button>
                    <button title="複製" onClick={() => duplicateLayer(o)} style={ib}>⧉</button>
                    <button title="刪除" onClick={() => deleteLayer(o)} style={{ ...ib, color: "var(--red)" }}>🗑</button>
                  </div>
                );
              })}
            </div>
          </SidebarPanel>
        ) : null}

        {/* 調色工具包 — always shown (collapsed); each tool acts on the active image when one is selected. */}
        {(
          <>
          {/* 🎨 調色 — ONE panel: presets · auto · levels · colour balance · basic sliders · Camera RAW · HSL mixer.
              Same sections / rows / ranges as public/vector-editor.html (both render public/editor-shared/color-grade.js). */}
          <SidebarPanel id="grade" title="🎨 調色" defaultPos={{ x: 816, y: 328 }} width={272} defaultCollapsed>
            <fieldset data-cg-panel disabled={imageToolsDisabled} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              {imageToolHint ? <span style={{ fontSize: 11, opacity: 0.65 }}>{imageToolHint}</span> : null}
              <button className="btn-secondary" data-cg-reset style={{ fontSize: 12 }} disabled={isGradeNeutral(adj)} onClick={() => { markEdit(); setAdj((a) => resetGradeAdj(a)); }} title="全部回到中性值（去背的去除顏色不動）">重設</button>
              {([
                ["presets", "預設風格 Presets"],
                ["auto", "自動 Auto"],
              ] as const).map(([id, title]) => (
                <details key={id} data-cg-sec={id} style={{ border: "1px solid var(--card-border)", borderRadius: 6, padding: "4px 8px" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>{title}</summary>
                  {id === "presets" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <button className="btn-secondary" data-cg-preset="" style={{ fontSize: 12, fontWeight: adj.presetId === null ? 700 : 400 }} onClick={() => { markEdit(); setAdj((a) => ({ ...a, presetId: null })); }}>原圖</button>
                        {PRESETS.map((p) => (
                          <button key={p.id} className="btn-secondary" data-cg-preset={p.id} style={{ fontSize: 12, fontWeight: adj.presetId === p.id ? 700 : 400 }} onClick={() => { markEdit(); setAdj((a) => ({ ...a, presetId: a.presetId === p.id ? null : p.id })); }}>{p.label}</button>
                        ))}
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" data-cg-removewhite checked={adj.removeWhite} onChange={(e) => { markEdit(); setAdj((a) => ({ ...a, removeWhite: e.target.checked })); }} />
                        ✂️ 去白底（免費，近白色變透明）
                      </label>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <button className="btn-secondary" data-cg-auto="contrast" style={{ fontSize: 12 }} onClick={() => runAuto("contrast")} title="分析畫素亮度範圍，自動設對比／曝光">自動對比</button>
                      <button className="btn-secondary" data-cg-auto="color" style={{ fontSize: 12 }} onClick={() => runAuto("color")} title="中性灰平衡，自動矯正偏色">自動色彩</button>
                      <button className="btn-secondary" data-cg-auto="tone" style={{ fontSize: 12 }} onClick={() => runAuto("tone")} title="同時套用自動對比 + 自動色彩">自動色調</button>
                    </div>
                  )}
                </details>
              ))}
              {GRADE_SECTIONS.map((sec) => (
                <details key={sec.id} data-cg-sec={sec.id} style={{ border: "1px solid var(--card-border)", borderRadius: 6, padding: "4px 8px" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>{sec.title}</summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {sec.rows.map((row) => {
                      const lim = limitOf(row.path);
                      const v = getPath(adj, row.path);
                      return (
                        <label key={row.path} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>{row.label}</span>
                            <span data-cg-val={row.path} style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{fmtValue(row.fmt, v)}</span>
                          </span>
                          <input type="range" data-cg={row.path} min={lim.min} max={lim.max} step={row.step} value={v} onChange={(e) => { markEdit(); setAdj((a) => setPath(a, row.path, Number(e.target.value))); }} style={{ width: "100%" }} />
                        </label>
                      );
                    })}
                  </div>
                </details>
              ))}
              <details data-cg-sec="hsl" style={{ border: "1px solid var(--card-border)", borderRadius: 6, padding: "4px 8px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>色彩混合器 HSL</summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {/* Tab strip: 全部 + 8 ranges */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    <button className="btn-secondary" data-cg-hsl-tab="all" style={{ fontSize: 11, padding: "2px 7px", fontWeight: hslTab === "all" ? 700 : 400, borderBottom: hslTab === "all" ? "2px solid var(--accent)" : "2px solid transparent" }} onClick={() => setHslTab("all")}>全部</button>
                    {HSL_RANGES.map((r) => (
                      <button key={r.key} className="btn-secondary" data-cg-hsl-tab={r.key} style={{ fontSize: 11, padding: "2px 5px", fontWeight: hslTab === r.key ? 700 : 400, borderBottom: hslTab === r.key ? `2px solid ${r.color}` : "2px solid transparent" }} onClick={() => setHslTab(r.key)}>
                        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: r.color, marginRight: 3, verticalAlign: "middle" }} />
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ opacity: 0.55, fontSize: 11 }}>
                    {hslTab === "all" ? "全部色相（整體偏移）" : `${HSL_RANGES.find((r) => r.key === hslTab)?.label ?? ""} 色段`}
                    {hasAnyHsl(adj.hslMixer) && <span style={{ color: "var(--accent-text)", marginLeft: 6 }}>已調整</span>}
                  </div>
                  {HSL_AXES.map((row) => {
                    const v = adj.hslMixer[hslTab][row.axis];
                    return (
                      <label key={row.axis} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>{row.label}</span>
                          <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums", color: v !== 0 ? "var(--accent-text)" : undefined }}>{v > 0 ? `+${v}` : `${v}`}</span>
                        </span>
                        <input type="range" data-cg-hsl={row.axis} min={row.min} max={row.max} value={v}
                          onChange={(e) => { markEdit(); const nv = Number(e.target.value); setAdj((a) => ({ ...a, hslMixer: { ...a.hslMixer, [hslTab]: { ...a.hslMixer[hslTab], [row.axis]: nv } } })); }}
                          style={{ width: "100%" }} />
                      </label>
                    );
                  })}
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <button className="btn-secondary" data-cg-hsl-reset="range" style={{ fontSize: 11 }} onClick={() => { markEdit(); setAdj((a) => ({ ...a, hslMixer: { ...a.hslMixer, [hslTab]: { h: 0, s: 0, l: 0 } } })); }}>重置此色段</button>
                    <button className="btn-secondary" data-cg-hsl-reset="all" style={{ fontSize: 11 }} onClick={() => { markEdit(); setAdj((a) => ({ ...a, hslMixer: hslNeutral() })); }}>全部重置</button>
                  </div>
                </div>
              </details>
            </fieldset>
          </SidebarPanel>

          {/* 🪄 去背 — ONE panel: 去除此色 (adj.removeColor) · 💧 吸色 · AI 去背 · 還原. Same data-bg-* hooks and messages as public/vector-editor.html (bg-remove.js). */}
          <SidebarPanel id="bg-remove" title="🪄 去背" defaultPos={{ x: 816, y: 370 }} width={272} defaultCollapsed>
            <fieldset data-bg-panel disabled={imageToolsDisabled || bgBusy} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              {imageToolHint ? <span data-bg-hint style={{ fontSize: 11, opacity: 0.65 }}>{imageToolHint}</span> : null}
              <span style={{ fontWeight: 600 }}>去除指定顏色 → 透明</span>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <label style={{ flex: "none", display: "flex", flexDirection: "column", gap: 2 }}>
                  要去除的顏色
                  <input type="color" data-bg-color value={keyColor} onChange={(e) => setKeyColor(e.target.value)} style={{ width: 56, height: 30, padding: 2, border: "1px solid var(--card-border)", borderRadius: 4, cursor: "pointer" }} />
                </label>
                <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ display: "flex", justifyContent: "space-between" }}><span>容差</span><span data-bg-dist-val style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{keyDist.toFixed(2)}</span></span>
                  <input type="range" data-bg-dist min={REMOVE_COLOR_LIMITS.min} max={REMOVE_COLOR_LIMITS.max} step={0.01} value={keyDist} onChange={(e) => setKeyDist(Number(e.target.value))} style={{ width: "100%" }} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-secondary" data-bg-pick style={{ flex: 1, fontSize: 12 }} onClick={() => void pickKeyColor()} title="吸取畫面任一點的顏色">💧 從圖片吸色</button>
                <button className="btn-primary" data-bg-go style={{ flex: 1, fontSize: 12 }} onClick={() => { markEdit(); setAdj((a) => setRemoveColor(a, keyColor, keyDist)); setBgMsg({ text: BG_MSG.keyOk, busy: false }); }}>去除此色 → 透明</button>
              </div>
              <span style={{ fontWeight: 600 }}>AI 去背（雲端）</span>
              <button className="btn-primary" data-bg-ai onClick={() => void applyBgAi()}>AI 去背（選圖片）</button>
              <button className="btn-secondary" data-bg-revert disabled={bgBusy || !(adj.removeColor || hasBgOriginal)} onClick={() => void revertBg()} title="清掉去除顏色，並把 AI 去背前的圖換回來；調色不動">還原</button>
              <span data-bg-msg style={{ fontSize: 11, opacity: bgMsg.busy ? 1 : 0.7, color: bgMsg.busy ? "var(--accent-text)" : undefined, lineHeight: 1.5 }}>{bgMsg.text}</span>
            </fieldset>
          </SidebarPanel>

          <SidebarPanel id="inpaint" title="🪄 去除 / 生成填色（AI）" defaultPos={{ x: 816, y: 412 }} width={272} defaultCollapsed>
            <fieldset disabled={!inpaintMode && imageToolsDisabled} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {!inpaintMode && imageToolHint ? <span style={{ fontSize: 11, opacity: 0.65 }}>{imageToolHint}</span> : null}
              {!inpaintMode ? (
                <>
                  <button className="btn-secondary" onClick={() => startInpaint("remove")}>🪄 去除不要的部分</button>
                  <button className="btn-secondary" onClick={() => startInpaint("fill")}>✨ 生成填色（塗哪生哪）</button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>
                    {maskMode === "fill" ? "用紅筆塗在要重新生成的區域，填描述後按套用。" : "用紅筆塗在想清掉的物件上，再按套用。"}
                  </p>
                  {maskMode === "fill" ? (
                    <input
                      className="btn-secondary"
                      placeholder="要生成什麼，例如：一片藍天 / 紅玫瑰"
                      value={fillPrompt}
                      onChange={(e) => setFillPrompt(e.target.value)}
                      style={{ fontSize: 12 }}
                    />
                  ) : null}
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    筆刷
                    <input
                      type="range"
                      min={8}
                      max={120}
                      value={brushSize}
                      onChange={(e) => {
                        const w = Number(e.target.value);
                        setBrushSize(w);
                        const c = fabricRef.current;
                        if (c?.freeDrawingBrush) c.freeDrawingBrush.width = w;
                      }}
                    />
                    <span style={{ width: 28, textAlign: "right" }}>{brushSize}</span>
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" disabled={inpaintBusy} onClick={() => void applyInpaint()}>
                      {inpaintBusy ? "AI 處理中…" : maskMode === "fill" ? "✨ 套用生成" : "✅ 套用去除"}
                    </button>
                    <button className="btn-secondary" disabled={inpaintBusy} onClick={() => exitInpaint(false)}>✖ 取消</button>
                  </div>
                </>
              )}
            </fieldset>
          </SidebarPanel>

          {/* 🖼 擴圖（flux-fill-pro outpaint）+ 🎚 色調分離（bake）— both replace the selected image. */}
          <SidebarPanel id="genfx" title="🖼 擴圖 / 🎚 色調分離" defaultPos={{ x: 816, y: 454 }} width={272} defaultCollapsed>
            <fieldset disabled={imageToolsDisabled || genBusy} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {imageToolHint ? <span style={{ fontSize: 11, opacity: 0.65 }}>{imageToolHint}</span> : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>🖼 擴圖 Outpaint（AI 往外補畫面）</span>
                <input
                  className="btn-secondary"
                  placeholder="描述整體場景，例如：海邊草地"
                  value={outpaintPrompt}
                  onChange={(e) => setOutpaintPrompt(e.target.value)}
                  style={{ fontSize: 12 }}
                />
                <select className="btn-secondary" value={outpaintDir} onChange={(e) => setOutpaintDir(e.target.value as OutpaintPreset)} style={{ fontSize: 12 }}>
                  {OUTPAINT_PRESETS.map((p) => (
                    <option key={p} value={p}>{OUTPAINT_LABELS[p]}</option>
                  ))}
                </select>
                <button className="btn-primary" disabled={genBusy} onClick={() => void applyOutpaint()}>
                  {genBusy ? "AI 處理中…" : "套用擴圖"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--card-border)", paddingTop: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>🎚 色調分離 Posterize</span>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  色階數
                  <input type="range" min={2} max={16} value={posterLevels} onChange={(e) => setPosterLevels(Number(e.target.value))} style={{ flex: 1 }} />
                  <span style={{ width: 22, textAlign: "right" }}>{posterLevels}</span>
                </label>
                <button className="btn-secondary" disabled={genBusy} onClick={() => void posterizeSelected()}>套用色調分離</button>
              </div>
            </fieldset>
          </SidebarPanel>

          {/* ✂️ 邊緣遮罩 — brush/grunge edge on the selected image → transparent PNG */}
          <SidebarPanel id="edge-mask" title="✂️ 邊緣遮罩（筆刷邊）" defaultPos={{ x: 816, y: 496 }} width={276} defaultCollapsed>
            <fieldset disabled={imageToolsDisabled || genBusy} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              {imageToolHint ? <span style={{ fontSize: 11, opacity: 0.65 }}>{imageToolHint}</span> : null}
              <div style={{ opacity: 0.6 }}>點筆刷 → 把選取的圖套有機邊（透明 PNG）。可換不同筆刷。</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(44px, 1fr))", gap: 5 }}>
                {EDGE_PREVIEWS.map((pv) => {
                  const active = edgeStyleApplied === pv.id;
                  return (
                    <button
                      key={pv.id}
                      type="button"
                      title={pv.en}
                      disabled={genBusy}
                      onClick={() => void applyEdgeMaskToSelected(pv.id)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: 2,
                        borderRadius: 6, cursor: "pointer",
                        background: active ? "rgba(99,102,241,0.18)" : "rgba(127,127,127,0.06)",
                        border: `1px solid ${active ? "var(--accent)" : "rgba(127,127,127,0.25)"}`,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pv.svg} alt={pv.zh} style={{ width: "100%", aspectRatio: "1", background: "#3a3a3a", borderRadius: 3 }} />
                      <span style={{ fontSize: 8.5, opacity: 0.8, lineHeight: 1, textAlign: "center" }}>{pv.zh}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ opacity: 0.6 }}>強度</span>
                <input
                  type="range" min={10} max={90} step={1} value={edgeAmount}
                  disabled={genBusy}
                  onChange={(e) => setEdgeAmount(Number(e.target.value))}
                  onPointerUp={() => { if (edgeStyleApplied) void applyEdgeMaskToSelected(edgeStyleApplied); }}
                  style={{ flex: 1 }}
                />
                <span style={{ opacity: 0.6, width: 30, textAlign: "right" }}>{edgeAmount}</span>
              </div>
              {genBusy ? <span style={{ opacity: 0.6 }}>套用中…</span> : null}
            </fieldset>
          </SidebarPanel>
          </>
        )}

        {/* 💾 匯出 / 下載 — 輸出放最後（流程：設定 → 加內容 → 樣式 → 排列 → 圖片處理 → 輸出）*/}
        <SidebarPanel id="export" title="💾 匯出 / 存入" defaultPos={{ x: 816, y: 0 }} width={280} defaultCollapsed>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              type="text"
              value={editName}
              onChange={(e) => { setEditName(e.target.value); nameRef.current = null; }}
              placeholder="檔名"
              title="下載檔名（不含副檔名）"
              style={{ fontSize: 12, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--card-border)", background: "var(--card-bg)", width: "100%" }}
            />
            {canvasBusy ? <span style={{ fontSize: 11, opacity: 0.65 }}>先套用或取消目前的編輯模式，才能下載或存檔。</span> : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} disabled={!ready || canvasBusy} onClick={download} title="下載全尺寸 PNG">PNG下載</button>
              <button className="btn-primary" style={{ flex: 1 }} disabled={!ready || canvasBusy} onClick={() => void downloadWebP()} title="下載 WebP，自動壓縮至 200KB 以內">WebP下載</button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" style={{ flex: 1 }} disabled={!ready || canvasBusy} onClick={downloadSvg} title="下載 SVG（向量，真實 cm 尺寸）">SVG下載</button>
              <button className="btn-primary" style={{ flex: 1 }} disabled={!ready || canvasBusy || exportBusy} onClick={() => void downloadPdf()} title="下載 PDF（向量·印刷·真實 cm）">{exportBusy ? "PDF 產生中…" : "PDF下載"}</button>
            </div>
            <button className="btn-primary" style={{ width: "100%" }} disabled={!ready || canvasBusy || saveState === "saving" || saveState === "saved"} onClick={() => void saveToDesigns()}>
              {saveState === "saved" ? "已存入 ✓" : saveState === "saving" ? "儲存中…" : saveState === "error" ? "儲存失敗 ✗（重試）" : "存入 My Designs"}
            </button>
            <span style={{ fontSize: 11, opacity: 0.6 }}>交印刷廠選 PDF。文字建議再轉外框，字體缺時最保險。</span>
          </div>
        </SidebarPanel>

        {/* (原獨立「🔤 字型庫」面板已併入上方「🔤 文字」面板,避免兩個文字面板重複混淆。) */}
        </div>
      </div>
    </div>
  );
}
