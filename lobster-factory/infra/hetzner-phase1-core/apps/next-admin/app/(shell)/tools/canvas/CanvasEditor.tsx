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
import ColorGradePanel, { useColorGrade } from "@/components/tools/ColorGradePanel";
import type { ColorGradeState } from "@/lib/studio/color-grade";
import { buildFabricImageFilters, buildPresetFilters, buildEffectFilters, PRESET_FILTERS, buildHslMixerFilter, HSL_NEUTRAL, HSL_RANGES, hasAnyHslAdjustment, sanitizeHslMixer, type HslMixerState, type HslRange } from "./fabric-filters";
import SidebarPanel from "@/components/tools/SidebarPanel";
import FontLibrary from "@/components/tools/FontLibrary";
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
 * 🎨 Per-image adjustment bundle (#3). Stored on each Fabric image as `.adj` (registered in
 * customProperties so it survives toJSON / design save / load). Re-selecting an image restores
 * exactly these sliders — switching images no longer carries the previous image's settings.
 */
type AdjState = {
  grade: ColorGradeState;
  presetId: string | null;
  removeWhite: boolean;
  vibrance: number; temp: number; blur: number; noise: number;
  contrast: number; shadows: number; highlights: number;
  exposure: number; clarity: number; dehaze: number;
  hslMixer?: HslMixerState;
};

/**
 * Font choices for the text tool. Each value is a CSS font-family STACK (canvas 2D / Fabric
 * resolve fallbacks), covering Windows + macOS system fonts so CJK renders without a web-font
 * download: 黑體=JhengHei/PingFang, 明體=Noto/PMingLiU serif, 楷書=DFKai/Kaiti.
 */
const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "黑體（中）", value: '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif' },
  { label: "明體（中）", value: '"Noto Serif TC","Source Han Serif TC","PMingLiU",serif' },
  { label: "楷書（中）", value: '"DFKai-SB","BiauKai","Kaiti TC",serif' },
  { label: "圓體（中）", value: '"Yuanti TC","Microsoft JhengHei","Noto Sans TC",sans-serif' },
  { label: "Sans (En)", value: "Arial,Helvetica,sans-serif" },
  { label: "Serif (En)", value: 'Georgia,"Times New Roman",serif' },
  { label: "Mono (En)", value: '"Courier New",monospace' },
  { label: "手寫 (En)", value: '"Comic Sans MS","Segoe Script",cursive' },
];

/** Fabric text-like object types whose font/colour/size the toolbar can edit. */
function isTextObject(o: { type?: string } | null | undefined): boolean {
  return !!o && (o.type === "i-text" || o.type === "text" || o.type === "textbox");
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
  const [textSelected, setTextSelected] = useState(false);
  const [imageSelected, setImageSelected] = useState(false); // an image object is selected → show 調色
  const [anySelected, setAnySelected] = useState(false); // any object selected → enable per-object tools
  const [lockSelected, setLockSelected] = useState(false); // selected object is locked (防呆 block)
  const [presetId, setPresetId] = useState<string | null>(null); // one-click look preset (active image)
  const [removeWhite, setRemoveWhite] = useState(false); // free chroma-key white-bg removal
  const [vibrance, setVibrance] = useState(0); // 自然飽和 -100..100
  const [blurv, setBlurv] = useState(0); // 高斯模糊 0..100
  const [noisev, setNoisev] = useState(0); // 雜訊 0..100
  const [temp, setTemp] = useState(0); // 色溫 -100(冷)..100(暖)
  const [layers, setLayers] = useState<FabricObject[]>([]); // 圖層面板 (top layer first)
  // ↩️ Undo/Redo — JSON snapshots of the canvas.
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const restoringRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // 畫布尺寸 / DPI（公分↔像素；參考 vector-trace-demo）
  const [szW, setSzW] = useState(9);
  const [szH, setSzH] = useState(5.4);
  const [szUnit, setSzUnit] = useState<"cm" | "mm" | "px">("cm");
  const [szDpi, setSzDpi] = useState(300);
  const [szInfo, setSzInfo] = useState<string | null>(null);
  // Editable download filename: auto-filled from upload filename or handoff name; user can override.
  const [editName, setEditName] = useState(() => {
    const now = new Date();
    return `canvas-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const canvasMetaRef = useRef<{ realW: number; realH: number; dispScale: number; dpi: number } | null>(null);
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
  // 🎛 調整 Adjustments (PS-style: contrast/shadows/highlights + Camera RAW)
  const [contrast, setContrast] = useState(0);     // 對比 -100..100
  const [shadows, setShadows] = useState(0);        // 陰影 -100..100
  const [highlights, setHighlights] = useState(0);  // 高光 -100..100
  const [exposure, setExposure] = useState(0);      // 曝光 -100..100
  const [clarity, setClarity] = useState(0);        // 清晰度 0..100
  const [dehaze, setDehaze] = useState(0);          // 去霧 0..100
  // 🎨 HSL Color Mixer — 8 hue ranges × H/S/L (Photoshop-style targeted adjustment)
  const [hslMixer, setHslMixer] = useState<HslMixerState>(() => JSON.parse(JSON.stringify(HSL_NEUTRAL)));
  const [hslTab, setHslTab] = useState<HslRange>("all");
  // 🗂 群組 — track whether the active selection can be grouped / ungrouped.
  const [multiSelected, setMultiSelected] = useState(false); // ActiveSelection (≥2 objects)
  const [groupSelected, setGroupSelected] = useState(false); // a single Group object
  const inpaintImgRef = useRef<FabricObject | null>(null); // image being edited in inpaint mode
  const inpaintPathsRef = useRef<FabricObject[]>([]); // strokes painted as the mask
  // ✂️ 裁切 Crop — drag a rect over the selected image, apply → native cropX/cropY window (non-destructive, undoable).
  const [cropMode, setCropMode] = useState(false);
  const cropImgRef = useRef<FabricObject | null>(null); // image being cropped
  const cropRectRef = useRef<FabricObject | null>(null); // the draggable crop rectangle overlay
  // 🎨 物件效果（PS 圖層樣式）— apply to the selected object (text/image/shape).
  const [objOpacity, setObjOpacity] = useState(100);
  const [objBlend, setObjBlend] = useState("normal");
  const [objShadow, setObjShadow] = useState(false);
  const [objStroke, setObjStroke] = useState(false);
  const [objStrokeColor, setObjStrokeColor] = useState("#000000");
  const [objStrokeWidth, setObjStrokeWidth] = useState(4);
  const grade = useColorGrade(); // 修圖積木 applied to the selected image via Fabric filters
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
  const resetAdjToNeutral = useCallback(() => {
    grade.reset();
    setPresetId(null); setRemoveWhite(false);
    setVibrance(0); setTemp(0); setBlurv(0); setNoisev(0);
    setContrast(0); setShadows(0); setHighlights(0); setExposure(0); setClarity(0); setDehaze(0);
    setHslMixer(JSON.parse(JSON.stringify(HSL_NEUTRAL)));
  }, [grade]);

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

      // Force Canvas 2D filter backend so custom per-pixel filters (HslColorMixer) work correctly.
      // Fabric v7 defaults to WebGL (enableGLFiltering=true); custom filters that only implement
      // applyTo2d are silently skipped — WebGL runs the identity shader instead (critic 2026-06-29).
      (fabric as unknown as { config?: { configure(o: Record<string, unknown>): void } }).config?.configure({ enableGLFiltering: false });

      // Persist our custom `name` (圖層改名) through toJSON/loadFromJSON + design save. Must be set
      // class-level BEFORE any object is created (Fabric v7 concatenates customProperties into
      // every toObject; per-instance assignment is ignored). Confirmed: fabricjs discussion #10176.
      (fabric.FabricObject as unknown as { customProperties: string[] }).customProperties = ["name", "adj"];

      canvas = new fabric.Canvas(canvasElRef.current, {
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;
      // The artboard = the white canvas = the real export bounds. Give Fabric's wrapper a drop-shadow
      // + crisp border so it stands out from the grey checker workspace → the user sees exactly where
      // the usable area ends (Photoshop/Figma-style). setDimensions only touches size, not these.
      const wrap = canvas.wrapperEl; // typed HTMLDivElement (Fabric) → a future rename fails at compile
      if (wrap) {
        wrap.style.boxShadow = "0 3px 14px rgba(0,0,0,0.26)";
        wrap.style.outline = "1px solid rgba(128,128,128,0.5)";
        wrap.style.borderRadius = "2px";
      }
      // Default 800×800 document so the auto-fit (relayoutCanvas) has a real size to scale from even
      // before a handoff/upload. Export uses these realW/realH. (Was null → no auto-fit on direct visit.)
      canvasMetaRef.current = { realW: 800, realH: 800, dispScale: 1, dpi: szDpi };
      setReady(true);

      // 🎨 Load an image's saved adjustments into the sliders (or neutral). Sets state WITHOUT
      // touching userEditRef, so the filter effect won't record an undo step for a mere selection.
      const loadAdj = (adj: AdjState | null) => {
        if (adj) {
          adj.grade ? grade.setAll(adj.grade) : grade.reset();
          setPresetId(adj.presetId ?? null);
          setRemoveWhite(!!adj.removeWhite);
          setVibrance(adj.vibrance ?? 0); setTemp(adj.temp ?? 0); setBlurv(adj.blur ?? 0); setNoisev(adj.noise ?? 0);
          setContrast(adj.contrast ?? 0); setShadows(adj.shadows ?? 0); setHighlights(adj.highlights ?? 0);
          setExposure(adj.exposure ?? 0); setClarity(adj.clarity ?? 0); setDehaze(adj.dehaze ?? 0);
          setHslMixer(sanitizeHslMixer(adj.hslMixer));
        } else {
          grade.reset();
          setPresetId(null); setRemoveWhite(false);
          setVibrance(0); setTemp(0); setBlurv(0); setNoisev(0);
          setContrast(0); setShadows(0); setHighlights(0); setExposure(0); setClarity(0); setDehaze(0);
          setHslMixer(sanitizeHslMixer(undefined));
        }
      };

      // Keep the toolbar in sync with the selected text object (and vice-versa).
      const syncFromSelection = () => {
        const o = canvas.getActiveObject() as
          | { type?: string; fontFamily?: unknown; fill?: unknown; fontSize?: unknown }
          | null;
        if (isTextObject(o)) {
          setTextSelected(true);
          if (typeof o!.fontFamily === "string") setTextFont(o!.fontFamily);
          if (typeof o!.fill === "string") setTextColor(o!.fill);
          if (typeof o!.fontSize === "number") setTextSize(o!.fontSize);
        } else {
          setTextSelected(false);
        }
        setImageSelected(o?.type === "image");
        // 🎨 per-image adjustments (#3): load THIS image's saved sliders, or neutral for non-images.
        loadAdj(o?.type === "image" ? ((o as unknown as { adj?: AdjState }).adj ?? null) : null);
        // reflect THIS image's own applied edge style (or none) in the edge-mask panel
        setEdgeStyleApplied((o as unknown as { edgeStyle?: EdgeMaskId } | null)?.edgeStyle ?? null);
        setAnySelected(!!o);
        setMultiSelected((o as { type?: string } | null)?.type === "activeselection");
        setGroupSelected((o as { type?: string } | null)?.type === "group");
        setLockSelected(!!(o as { lockMovementX?: boolean } | null)?.lockMovementX);
        const e = o as
          | { opacity?: number; globalCompositeOperation?: string; shadow?: unknown; stroke?: unknown; strokeWidth?: number }
          | null;
        if (e) {
          if (typeof e.opacity === "number") setObjOpacity(Math.round(e.opacity * 100));
          // Fabric's default GCO is "source-over"; map it back to the UI's "normal" (critic M1).
          setObjBlend(
            e.globalCompositeOperation && e.globalCompositeOperation !== "source-over"
              ? e.globalCompositeOperation
              : "normal"
          );
          setObjShadow(!!e.shadow);
          setObjStroke(!!e.stroke && (e.strokeWidth ?? 0) > 0);
          // Reset to defaults when the new object has no stroke (critic M3 — avoid stale carry-over).
          setObjStrokeColor(typeof e.stroke === "string" ? e.stroke : "#000000");
          setObjStrokeWidth(typeof e.strokeWidth === "number" && e.strokeWidth > 0 ? e.strokeWidth : 4);
        }
      };
      canvas.on("selection:created", syncFromSelection);
      canvas.on("selection:updated", syncFromSelection);
      canvas.on("selection:cleared", () => {
        setTextSelected(false);
        setImageSelected(false);
        loadAdj(null); // no image selected → sliders show neutral (not the last image's settings)
        setEdgeStyleApplied(null);
        setAnySelected(false);
        setMultiSelected(false);
        setGroupSelected(false);
        setLockSelected(false);
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

  // Apply colour-grade + preset/RemoveColor to the selected IMAGE (Fabric filters), combined so
  // both coexist. Canvas is WYSIWYG: the filtered pixels are exactly what toDataURL exports.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type !== "image") return;
    let cancelled = false;
    void import("fabric").then((fabric) => {
      if (cancelled || fabricRef.current !== canvas) return;
      const ns = fabric as unknown as { filters: Record<string, new (o?: Record<string, unknown>) => object> };
      const target = obj as unknown as { filters: object[]; applyFilters: () => void };
      target.filters = [
        ...buildFabricImageFilters(ns, grade.params),
        ...buildPresetFilters(ns, presetId, removeWhite),
        ...buildEffectFilters(ns, { vibrance, blur: blurv, noise: noisev, temp, contrast, shadows, highlights, exposure, clarity, dehaze }),
        ...buildHslMixerFilter(ns, hslMixer),
      ];
      target.applyFilters();
      canvas.requestRenderAll();
      setSaveState("idle"); // filter/adjust change is an edit → re-enable save
      // 🎨 persist these params on THIS image (#3) so re-selecting it restores the exact sliders.
      (obj as unknown as { adj?: AdjState }).adj = {
        grade: { ...grade.state }, presetId, removeWhite,
        vibrance, temp, blur: blurv, noise: noisev,
        contrast, shadows, highlights, exposure, clarity, dehaze,
        hslMixer: JSON.parse(JSON.stringify(hslMixer)),
      };
      // ↩️ #4 record ONE undo step after the user stops dragging (debounced). Only when THIS object
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
    // snapshot intentionally omitted from deps (declared later; stable useCallback). grade.state read
    // via grade.params dep. userEditRef/snapTimerRef are refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade.params, presetId, removeWhite, vibrance, blurv, noisev, temp, contrast, shadows, highlights, exposure, clarity, dehaze, hslMixer]);

  const addText = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return; // unmounted/disposed mid-import
      // Center in REAL/object space (objects are zoom-independent); the canvas may now be zoomed by
      // auto-fit, so getWidth() (display px) would mis-place the text (critic Major).
      const m = canvasMetaRef.current;
      const z = canvas.getZoom() || 1;
      const text = new fabric.IText("雙擊編輯文字", {
        left: m ? m.realW / 2 : canvas.getWidth() / z / 2,
        top: m ? m.realH / 2 : canvas.getHeight() / z / 2,
        originX: "center",
        originY: "center",
        fontSize: textSize,
        fill: textColor,
        fontFamily: textFont,
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      setTextSelected(true);
      canvas.requestRenderAll();
    });
  }, [textFont, textColor, textSize]);

  /** Apply a font/colour/size change to the selected text object (no-op if none). */
  const applyTextStyle = useCallback((patch: Record<string, unknown>) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const o = canvas.getActiveObject();
    if (isTextObject(o as { type?: string } | null)) {
      (o as unknown as { set: (p: Record<string, unknown>) => void }).set(patch);
      canvas.requestRenderAll();
    }
  }, []);

  /** Toggle a boolean-ish text style (bold/italic/underline) by reading the active object. */
  const toggleText = useCallback((prop: "fontWeight" | "fontStyle" | "underline") => {
    const o = fabricRef.current?.getActiveObject() as unknown as Record<string, unknown> | null;
    if (!o || !isTextObject(o as { type?: string })) return;
    if (prop === "fontWeight") applyTextStyle({ fontWeight: o.fontWeight === "bold" ? "normal" : "bold" });
    else if (prop === "fontStyle") applyTextStyle({ fontStyle: o.fontStyle === "italic" ? "normal" : "italic" });
    else applyTextStyle({ underline: !o.underline });
  }, [applyTextStyle]);

  // 🎨 物件效果 — set any property on the active object (opacity/blend/stroke/flip).
  const setActiveProp = useCallback((patch: Record<string, unknown>) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const o = canvas.getActiveObject();
    if (!o) return;
    (o as unknown as { set: (p: Record<string, unknown>) => void }).set(patch);
    canvas.requestRenderAll();
  }, []);

  const flipActive = useCallback((axis: "x" | "y") => {
    const canvas = fabricRef.current;
    const o = canvas?.getActiveObject() as (FabricObject & { flipX?: boolean; flipY?: boolean }) | null;
    if (!canvas || !o) return;
    setActiveProp(axis === "x" ? { flipX: !o.flipX } : { flipY: !o.flipY });
  }, [setActiveProp]);

  // Drop shadow needs the Fabric Shadow class (dynamic import).
  const toggleShadow = useCallback((on: boolean) => {
    setObjShadow(on);
    const canvas = fabricRef.current;
    const o = canvas?.getActiveObject() as (FabricObject & { set: (p: Record<string, unknown>) => void }) | null;
    if (!canvas || !o) return;
    if (!on) {
      o.set({ shadow: null });
      canvas.requestRenderAll();
      return;
    }
    // Capture the target object now; if selection moves during the async import, don't mis-apply (critic M2).
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas || canvas.getActiveObject() !== o) return;
      o.set({ shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.45)", blur: 16, offsetX: 6, offsetY: 6 }) });
      canvas.requestRenderAll();
    });
  }, []);

  const toggleStroke = useCallback((on: boolean) => {
    setObjStroke(on);
    setActiveProp(on ? { stroke: objStrokeColor, strokeWidth: objStrokeWidth } : { stroke: null, strokeWidth: 0 });
  }, [setActiveProp, objStrokeColor, objStrokeWidth]);

  // ✂️ 剪裁遮罩 clipPath — clip the selected object to a circle / rounded-rect (or none).
  const applyClip = useCallback((shape: "none" | "circle" | "round") => {
    const canvas = fabricRef.current;
    const o = canvas?.getActiveObject() as
      | (FabricObject & { width?: number; height?: number; set: (p: Record<string, unknown>) => void })
      | null;
    if (!canvas || !o) return;
    if (shape === "none") {
      o.set({ clipPath: undefined });
      canvas.requestRenderAll();
      return;
    }
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return;
      const w = o.width ?? 100;
      const h = o.height ?? 100;
      const clip =
        shape === "circle"
          ? new fabric.Circle({ radius: Math.min(w, h) / 2, originX: "center", originY: "center" })
          : new fabric.Rect({
              width: w,
              height: h,
              rx: Math.min(w, h) * 0.15,
              ry: Math.min(w, h) * 0.15,
              originX: "center",
              originY: "center",
            });
      // clipPath positioned relative to the object's centre (default, non-absolute).
      o.set({ clipPath: clip });
      canvas.requestRenderAll();
    });
  }, []);

  // 〽️ 文字沿路徑 — make the selected text follow a curved (arc) path, or straighten it.
  const applyTextArc = useCallback((on: boolean) => {
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
      const len = Math.max(220, (o.width ?? 220) * 1.5);
      const arc = new fabric.Path(`M 0 80 Q ${len / 2} -20 ${len} 80`, { fill: "", stroke: "" });
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
  const snapshot = useCallback(() => {
    if (restoringRef.current) return;
    const c = fabricRef.current as unknown as { toJSON: () => unknown; getZoom: () => number } | null;
    if (!c) return;
    undoStack.current.push(JSON.stringify({ json: c.toJSON(), zoom: c.getZoom() }));
    if (undoStack.current.length > 20) undoStack.current.shift(); // cap: base64 imgs are heavy
    redoStack.current = [];
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(false);
  }, []);
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
        restoringRef.current = false; // only now are all object:added events done
      });
    },
    [refreshLayers, resetAdjToNeutral]
  );
  const undo = useCallback(() => {
    if (undoStack.current.length < 2) return;
    const cur = undoStack.current.pop();
    if (cur) redoStack.current.push(cur);
    restore(undoStack.current[undoStack.current.length - 1]);
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(redoStack.current.length > 0);
  }, [restore]);
  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(next);
    restore(next);
    setCanUndo(undoStack.current.length > 1);
    setCanRedo(redoStack.current.length > 0);
  }, [restore]);
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
    refreshLayers();
  }, [refreshLayers]);
  const moveLayer = useCallback((o: FabricObject, dir: "up" | "down") => {
    const c = fabricRef.current as unknown as {
      bringObjectForward?: (o: FabricObject) => void;
      sendObjectBackwards?: (o: FabricObject) => void;
      requestRenderAll: () => void;
    } | null;
    if (!c) return;
    if (dir === "up") c.bringObjectForward?.(o);
    else c.sendObjectBackwards?.(o);
    c.requestRenderAll();
    refreshLayers();
  }, [refreshLayers]);
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
    if (t === "group") return "🗂 群組";
    if (t === "i-text" || t === "textbox" || t === "text") {
      const s = String((o as { text?: string }).text ?? "文字").slice(0, 10);
      return `📝 ${s}`;
    }
    if (t === "image") return "🖼 圖片";
    if (t === "path") {
      // destination-out paths are eraser strokes (they erase whatever is below them).
      return (o as { globalCompositeOperation?: string }).globalCompositeOperation === "destination-out" ? "🧹 擦除" : "✏️ 筆畫";
    }
    return `🔷 ${t ?? "物件"}`;
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
  const fitImageToCanvas = useCallback((mode: "fit" | "fill") => {
    const canvas = fabricRef.current as unknown as {
      getActiveObject: () => FabricObject | null;
      getWidth: () => number; getHeight: () => number; getZoom: () => number;
      setActiveObject: (o: FabricObject) => void; requestRenderAll: () => void;
    } | null;
    if (!canvas) return;
    const img = canvas.getActiveObject() as
      | (FabricObject & { type?: string; width?: number; height?: number; set: (p: Record<string, unknown>) => void })
      | null;
    if (!img || img.type !== "image") { setError("請先點選一張圖片"); return; }
    const m = canvasMetaRef.current;
    const z = canvas.getZoom() || 1;
    const aw = m ? m.realW : canvas.getWidth() / z; // artboard real width (px)
    const ah = m ? m.realH : canvas.getHeight() / z;
    const iw = img.width || 1, ih = img.height || 1;
    const s = mode === "fill" ? Math.max(aw / iw, ah / ih) : Math.min(aw / iw, ah / ih);
    img.set({ scaleX: s, scaleY: s, angle: 0, originX: "center", originY: "center", left: aw / 2, top: ah / 2 });
    (img as unknown as { setCoords: () => void }).setCoords();
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
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

  // 🌈 漸層填色 — apply a 2-stop linear gradient as the selected object's fill.
  const applyGradient = useCallback(() => {
    const canvas = fabricRef.current;
    const o = canvas?.getActiveObject();
    if (!canvas || !o) return;
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return;
      const oo = o as unknown as { width?: number; scaleX?: number };
      const w = (oo.width ?? 200) * (oo.scaleX ?? 1); // scaled width so the gradient spans the visible object (critic M5)
      const grad = new fabric.Gradient({
        type: "linear",
        coords: { x1: 0, y1: 0, x2: w, y2: 0 },
        colorStops: [
          { offset: 0, color: drawColor },
          { offset: 1, color: "#ffffff" },
        ],
      });
      (o as unknown as { set: (p: Record<string, unknown>) => void }).set({ fill: grad });
      canvas.requestRenderAll();
    });
  }, [drawColor]);

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
    const o = canvas.getActiveObject() as
      | (FabricObject & {
          lockMovementX?: boolean;
          set: (p: Record<string, unknown>) => void;
        })
      | null;
    if (!o) return;
    const lock = !o.lockMovementX;
    o.set({
      lockMovementX: lock,
      lockMovementY: lock,
      lockScalingX: lock,
      lockScalingY: lock,
      lockRotation: lock,
      hasControls: !lock,
      selectable: true,
    });
    setLockSelected(lock);
    canvas.requestRenderAll();
  }, []);

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
      const common = { fill: "transparent", stroke: "#111111", strokeWidth: 4 };
      let shape: FabricObject;
      if (kind === "rect") {
        shape = new fabric.Rect({ left: cx, top: cy, originX: "center", originY: "center", width: 200, height: 140, ...common });
      } else if (kind === "circle") {
        shape = new fabric.Circle({ left: cx, top: cy, originX: "center", originY: "center", radius: 90, ...common });
      } else {
        shape = new fabric.Line([cx - 120, cy, cx + 120, cy], { stroke: "#111111", strokeWidth: 4 });
      }
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

  // 💾 設計檔（可再編輯）— export the full canvas JSON (custom `name` included via customProperties)
  // so a design can be reloaded and keep editing. Client-only: download a .design.json blob.
  const exportDesign = useCallback(() => {
    const c = fabricRef.current as unknown as { toJSON: () => unknown } | null;
    if (!c) return;
    const json = JSON.stringify(c.toJSON());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nameRef.current || editName}.design.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [editName]);

  const importDesign = useCallback(
    (file: File | null) => {
      const c = fabricRef.current as unknown as
        | { loadFromJSON: (j: unknown) => Promise<unknown>; requestRenderAll: () => void; getObjects: () => FabricObject[] }
        | null;
      if (!c || !file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let json: unknown;
        try {
          json = JSON.parse(reader.result as string);
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
          c.requestRenderAll();
          refreshLayers();
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
    [refreshLayers, snapshot]
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

  /** Flatten the canvas to a PNG data URL (codebase convention — see file header). */
  const exportPng = useCallback((): string | null => {
    const canvas = fabricRef.current as unknown as {
      discardActiveObject: () => void;
      requestRenderAll: () => void;
      toDataURL: (o: Record<string, unknown>) => string;
      getZoom: () => number;
      setZoom: (z: number) => void;
      setDimensions: (d: { width: number; height: number }) => void;
    } | null;
    if (!canvas) return null;
    canvas.discardActiveObject(); // drop selection handles from the export
    const m = canvasMetaRef.current;
    if (!m) {
      canvas.requestRenderAll();
      return canvas.toDataURL({ format: "png", multiplier: 1 });
    }
    // Print canvas set: temporarily reset zoom + render at full real px so the export is
    // full-DPI (toDataURL honours viewportTransform; restore the display afterwards).
    const zoom = canvas.getZoom();
    canvas.setZoom(1);
    canvas.setDimensions({ width: m.realW, height: m.realH });
    const url = canvas.toDataURL({ format: "png", multiplier: 1 });
    canvas.setZoom(zoom);
    canvas.setDimensions({ width: Math.round(m.realW * m.dispScale), height: Math.round(m.realH * m.dispScale) });
    canvas.requestRenderAll();
    return url;
  }, []);

  const download = useCallback(() => {
    const png = exportPng();
    if (!png) return;
    const base = nameRef.current || editName;
    const a = document.createElement("a");
    a.href = png;
    a.download = `${base}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [exportPng, editName]);

  const saveToDesigns = useCallback(async () => {
    const png = exportPng();
    if (!png) return;
    setSaveState("saving");
    setError(null);
    try {
      const res = await fetch("/api/tools/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({ image: png, prompt: "canvas edit", modelName: "canvas", source: "canvas" }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      setSaveState(json.ok ? "saved" : "error");
      if (!json.ok) setError(json.error ?? "儲存失敗");
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [exportPng]);

  // 🔄 Auto 色階 / 色彩 / 色調 — pixel analysis on the selected image → auto-set sliders.
  const autoContrast = useCallback(() => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject() as { type?: string; toDataURL?: (o?: Record<string, unknown>) => string } | null;
    if (!canvas || !obj || obj.type !== "image" || !obj.toDataURL) return;
    markEdit(); // auto-adjust is a user edit → undoable + persisted to img.adj
    const dataUrl = obj.toDataURL({ format: "png", multiplier: 1, withoutTransform: true });
    const img = new Image();
    img.onerror = () => setError("自動對比失敗：無法解碼圖片");
    img.onload = () => {
      const oc = document.createElement("canvas");
      oc.width = img.width; oc.height = img.height;
      const ctx = oc.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 10) continue;
        const luma = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        if (luma < lo) lo = luma;
        if (luma > hi) hi = luma;
      }
      if (hi <= lo) return;
      const range = hi - lo;
      // Map the compressed tonal range → contrast/exposure sliders (full -100..100 range).
      // grade.black/white sliders have narrow bounds (0..64 / 191..255) so we use the
      // dedicated contrast + exposure sliders that cover the full range correctly.
      const contrastBoost = Math.round(Math.min(100, (255 / range - 1) * 50));
      const midpoint = (lo + hi) / 2;
      const exposureAdj = Math.round(Math.max(-50, Math.min(50, (127.5 - midpoint) / 2.55)));
      setContrast(contrastBoost);
      setExposure(exposureAdj);
    };
    img.src = dataUrl;
    // setContrast/setExposure are stable useState dispatchers — no dep needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoColor = useCallback(() => {
    const canvas = fabricRef.current;
    const obj = canvas?.getActiveObject() as { type?: string; toDataURL?: (o?: Record<string, unknown>) => string } | null;
    if (!canvas || !obj || obj.type !== "image" || !obj.toDataURL) return;
    markEdit(); // auto-adjust is a user edit → undoable + persisted to img.adj
    const dataUrl = obj.toDataURL({ format: "png", multiplier: 1, withoutTransform: true });
    const img = new Image();
    img.onerror = () => setError("自動色彩失敗：無法解碼圖片");
    img.onload = () => {
      const oc = document.createElement("canvas");
      oc.width = img.width; oc.height = img.height;
      const ctx = oc.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 10) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      if (n === 0) return;
      r /= n; g /= n; b /= n;
      const gray = (r + g + b) / 3;
      // Gray world assumption: shift each channel to neutralise cast (SSOT: ColorGradePanel balCR/MG/YB).
      grade.set("balCR", Math.round(Math.max(-100, Math.min(100, (gray - r) / 2.55))));
      grade.set("balMG", Math.round(Math.max(-100, Math.min(100, (gray - g) / 2.55))));
      grade.set("balYB", Math.round(Math.max(-100, Math.min(100, (gray - b) / 2.55))));
    };
    img.src = dataUrl;
  }, [grade]);

  const autoTone = useCallback(() => {
    autoContrast();
    autoColor();
  }, [autoContrast, autoColor]);

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
    while (dataUrl.length * 0.75 > 200 * 1024 && quality > 0.2) {
      quality = Math.round((quality - 0.1) * 10) / 10;
      dataUrl = oc.toDataURL("image/webp", quality);
    }
    const base = nameRef.current || editName;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${base}.webp`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [exportPng, editName]);

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

  const canvasBusy = cropMode || inpaintMode;
  const objectToolsDisabled = !ready || canvasBusy || !anySelected;
  const imageToolsDisabled = !ready || canvasBusy || !imageSelected;
  const textToolsDisabled = !ready || canvasBusy || !textSelected;
  const imageToolHint = !imageSelected ? "先選取圖片後才能使用。" : canvasBusy ? "先完成或取消目前的編輯模式。" : null;
  const objectToolHint = !anySelected ? "先選取畫布上的物件後才能使用。" : canvasBusy ? "先完成或取消目前的編輯模式。" : null;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>✏️ 快速編輯 Canvas</h1>
      <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
        上傳圖案、加文字，拖曳 / 縮放 / 旋轉，即時預覽。完成後可下載 PNG 或存入 My Designs。
      </p>

      {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}

      {/* 畫布 + 右側可捲動工具欄（vector-trace-demo 風格）。面板垂直堆疊、可收合。 */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%" }}>
        <div
          ref={canvasContainerRef}
          style={{
            border: "1px solid var(--card-border)", borderRadius: 8, flex: 1, minWidth: 0,
            height: workspaceH, // dynamic workspace height (measured) → artboard floats centred inside it
            display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden",
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

        {/* 💾 匯出 / 下載 — 放最上方（主要輸出動作，免捲動）*/}
        <SidebarPanel id="export" title="💾 匯出 / 下載" defaultPos={{ x: 816, y: 0 }} width={280}>
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
            <button className="btn-primary" style={{ width: "100%" }} disabled={!ready || canvasBusy || saveState === "saving" || saveState === "saved"} onClick={() => void saveToDesigns()}>
              {saveState === "saved" ? "已存入 ✓" : saveState === "saving" ? "儲存中…" : "存入 My Designs"}
            </button>
          </div>
        </SidebarPanel>

        {/* 🧰 更多工具 — 形狀 / 鎖定 / 群組 / 畫筆 / 橡皮擦 / 設計檔（低頻，收合省空間）*/}
        <SidebarPanel id="more-tools" title="🧰 更多工具" defaultPos={{ x: 816, y: 0 }} width={280} defaultCollapsed>
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
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} disabled={!imageSelected} onClick={() => fitImageToCanvas("fit")} title="把選取的圖縮放到剛好放進畫布（保留全圖）">符合畫布</button>
              <button className="btn-secondary" style={{ flex: 1, fontSize: 12 }} disabled={!imageSelected} onClick={() => fitImageToCanvas("fill")} title="把選取的圖放大到填滿畫布（超出邊界裁掉）">填滿畫布</button>
            </div>
            <span style={{ fontSize: 10, opacity: 0.5, lineHeight: 1.4 }}>畫布＝最終輸出尺寸；圖片是內容，選圖後用上面兩鍵貼合畫布。</span>
            {szInfo ? <span style={{ fontSize: 11, opacity: 0.7 }}>{szInfo}</span> : null}
          </div>
        </SidebarPanel>

        {/* 🗂 圖層面板 — reorder / show-hide / duplicate / delete, top layer first. */}
        {layers.length > 0 ? (
          <SidebarPanel id="layers" title={`🗂 圖層（${layers.length}）`} defaultPos={{ x: 816, y: 244 }} width={240} defaultCollapsed>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 520, overflowY: "auto" }}>
              {layers.map((o, i) => {
                const vis = (o as unknown as { visible?: boolean }).visible !== false;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, border: "1px solid var(--card-border)", borderRadius: 4, padding: "3px 5px" }}>
                    <button title="顯示/隱藏" onClick={() => toggleLayerVisible(o)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>{vis ? "👁" : "🚫"}</button>
                    <button onClick={() => selectLayer(o)} onDoubleClick={() => renameLayer(o)} title="點選圖層（雙擊改名）" style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: vis ? 1 : 0.45 }}>{layerLabel(o)}</button>
                    <button title="改名" onClick={() => renameLayer(o)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>✏️</button>
                    <button title="上移" onClick={() => moveLayer(o, "up")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>↑</button>
                    <button title="下移" onClick={() => moveLayer(o, "down")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>↓</button>
                    <button title="複製" onClick={() => duplicateLayer(o)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>⧉</button>
                    <button title="刪除" onClick={() => deleteLayer(o)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--red)" }}>🗑</button>
                  </div>
                );
              })}
            </div>
          </SidebarPanel>
        ) : null}

        {/* 🔤 文字 — 整合：字型/顏色/字級 + 樣式切換(B/I/U/弧形) + 進階字型庫。放在圖層下方。
            (原「文字樣式」+「字型庫」兩面板合併,避免重複混淆。) */}
        <SidebarPanel id="text-style" title="🔤 文字" defaultPos={{ x: 816, y: 0 }} width={280} defaultCollapsed>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
            <span style={{ opacity: 0.6 }}>{textSelected ? "套用到選取文字" : "新文字預設"}</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 30 }}>字型</span>
              <select className="btn-secondary" value={textFont} disabled={!ready} onChange={(e) => { setTextFont(e.target.value); applyTextStyle({ fontFamily: e.target.value }); }} style={{ flex: 1 }}>
                {FONT_OPTIONS.map((f) => (<option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 30 }}>顏色</span>
              <input type="color" value={textColor} disabled={!ready} onChange={(e) => { setTextColor(e.target.value); applyTextStyle({ fill: e.target.value }); }} style={{ width: 36, height: 24, padding: 0, border: "1px solid var(--card-border)", borderRadius: 4, cursor: "pointer" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 30 }}>字級</span>
              <input type="range" min={8} max={200} step={1} value={textSize} disabled={!ready} onChange={(e) => { const v = Number(e.target.value); setTextSize(v); applyTextStyle({ fontSize: v }); }} style={{ flex: 1 }} />
              <span style={{ width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{textSize}</span>
            </label>
            {/* 樣式切換 */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn-secondary" disabled={textToolsDisabled} style={{ fontSize: 13, fontWeight: 700 }} title={textSelected ? "粗體（切換）" : "先選取文字後才能使用。"} onClick={() => toggleText("fontWeight")}>B</button>
              <button className="btn-secondary" disabled={textToolsDisabled} style={{ fontSize: 13, fontStyle: "italic" }} title={textSelected ? "斜體（切換）" : "先選取文字後才能使用。"} onClick={() => toggleText("fontStyle")}>I</button>
              <button className="btn-secondary" disabled={textToolsDisabled} style={{ fontSize: 13, textDecoration: "underline" }} title={textSelected ? "底線（切換）" : "先選取文字後才能使用。"} onClick={() => toggleText("underline")}>U</button>
              <button className="btn-secondary" disabled={textToolsDisabled} style={{ fontSize: 12 }} title={textSelected ? "文字沿弧形路徑" : "先選取文字後才能使用。"} onClick={() => applyTextArc(true)}>〽️ 弧形</button>
              <button className="btn-secondary" disabled={textToolsDisabled} style={{ fontSize: 12 }} title={textSelected ? "取消弧形（拉直）" : "先選取文字後才能使用。"} onClick={() => applyTextArc(false)}>直</button>
            </div>
            {/* 進階字型庫：Google Fonts（中/英）+ 上傳字型 */}
            <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ opacity: 0.6, fontSize: 11 }}>更多字型（Google Fonts / 上傳）</span>
              <FontLibrary
                current={textFont}
                onPick={(family) => {
                  setTextFont(family);
                  applyTextStyle({ fontFamily: family });
                }}
              />
            </div>
          </div>
        </SidebarPanel>

        {/* 🎨 物件效果（PS 圖層樣式）— always shown (collapsed); acts on the active object when one is selected. */}
        {(
          <SidebarPanel id="effects" title="🎨 物件效果" defaultPos={{ x: 816, y: 286 }} width={260} defaultCollapsed>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>透明度</span><span style={{ opacity: 0.7 }}>{objOpacity}%</span></span>
              <input type="range" min={0} max={100} value={objOpacity} disabled={objectToolsDisabled} onChange={(e) => { const v = Number(e.target.value); setObjOpacity(v); setActiveProp({ opacity: v / 100 }); }} />
            </label>
            <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
              混合模式
              <select className="btn-secondary" value={objBlend} disabled={objectToolsDisabled} onChange={(e) => { setObjBlend(e.target.value); setActiveProp({ globalCompositeOperation: e.target.value === "normal" ? "source-over" : e.target.value }); }}>
                {["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference", "color-dodge", "color-burn", "soft-light", "hard-light"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-secondary" disabled={objectToolsDisabled} style={{ fontSize: 12 }} title={objectToolHint ?? undefined} onClick={() => flipActive("x")}>↔ 水平翻轉</button>
              <button className="btn-secondary" disabled={objectToolsDisabled} style={{ fontSize: 12 }} title={objectToolHint ?? undefined} onClick={() => flipActive("y")}>↕ 垂直翻轉</button>
            </div>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={objShadow} disabled={objectToolsDisabled} onChange={(e) => toggleShadow(e.target.checked)} /> 陰影 Drop shadow
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={objStroke} disabled={objectToolsDisabled} onChange={(e) => toggleStroke(e.target.checked)} /> 描邊 Stroke
              </label>
              {objStroke ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 22 }}>
                  <input type="color" value={objStrokeColor} disabled={objectToolsDisabled} onChange={(e) => { setObjStrokeColor(e.target.value); setActiveProp({ stroke: e.target.value }); }} style={{ width: 30, height: 22, padding: 0 }} />
                  <input type="range" min={1} max={40} value={objStrokeWidth} disabled={objectToolsDisabled} onChange={(e) => { const w = Number(e.target.value); setObjStrokeWidth(w); setActiveProp({ strokeWidth: w }); }} style={{ flex: 1 }} />
                  <span style={{ width: 22, textAlign: "right" }}>{objStrokeWidth}</span>
                </div>
              ) : null}
            </div>
            {!imageSelected ? (
              <button className="btn-secondary" disabled={objectToolsDisabled || imageSelected} style={{ fontSize: 12 }} onClick={applyGradient} title={!anySelected ? "先選取文字或形狀後才能使用。" : "把選取的文字/形狀填成漸層（左色用畫筆顏色）"}>🌈 漸層填色</button>
            ) : null}
            {/* ✂️ 剪裁遮罩 clipPath */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span style={{ opacity: 0.6 }}>遮罩</span>
              <button className="btn-secondary" disabled={objectToolsDisabled} style={{ fontSize: 12 }} title={objectToolHint ?? "圓形遮罩"} onClick={() => applyClip("circle")}>⬤</button>
              <button className="btn-secondary" disabled={objectToolsDisabled} style={{ fontSize: 12 }} title={objectToolHint ?? "圓角遮罩"} onClick={() => applyClip("round")}>▢</button>
              <button className="btn-secondary" disabled={objectToolsDisabled} style={{ fontSize: 12 }} title={objectToolHint ?? "移除遮罩"} onClick={() => applyClip("none")}>無</button>
            </div>
          </div>
          </SidebarPanel>
        )}

        {/* 調色工具包 — always shown (collapsed); each tool acts on the active image when one is selected. */}
        {(
          <>
          {/* 3 個獨立可拖面板：調色 / 濾鏡效果 / AI 去除 */}
          <SidebarPanel id="grade" title="🎨 調色 / 色階 Levels" defaultPos={{ x: 816, y: 328 }} width={272} defaultCollapsed>
            <fieldset disabled={imageToolsDisabled} style={{ border: 0, padding: 0, margin: 0 }}>
              {imageToolHint ? <span style={{ display: "block", fontSize: 11, opacity: 0.65, marginBottom: 8 }}>{imageToolHint}</span> : null}
              <ColorGradePanel state={grade.state} onSet={(k, v) => { markEdit(); grade.set(k, v); }} onReset={() => { markEdit(); grade.reset(); }} neutral={grade.neutral} />
            </fieldset>
          </SidebarPanel>

          {/* 🎛 調整 Adjustments — PS-style contrast / shadows / highlights + auto corrections */}
          <SidebarPanel id="adjust" title="🎛 調整 Adjustments" defaultPos={{ x: 816, y: 348 }} width={272} defaultCollapsed>
            <fieldset disabled={imageToolsDisabled} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {imageToolHint ? <span style={{ fontSize: 11, opacity: 0.65 }}>{imageToolHint}</span> : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={autoContrast} title="分析畫素亮度範圍，自動設黑白點">自動對比</button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={autoColor} title="中性灰平衡，自動矯正偏色">自動色彩</button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={autoTone} title="同時套用自動對比 + 自動色彩">自動色調</button>
              </div>
              {([
                { label: "對比 Contrast", v: contrast, set: setContrast, min: -100, max: 100 },
                { label: "陰影 Shadows", v: shadows, set: setShadows, min: -100, max: 100 },
                { label: "高光 Highlights", v: highlights, set: setHighlights, min: -100, max: 100 },
              ] as { label: string; v: number; set: (n: number) => void; min: number; max: number }[]).map((row) => (
                <label key={row.label} style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{row.label}</span>
                    <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{row.v > 0 ? `+${row.v}` : `${row.v}`}</span>
                  </span>
                  <input type="range" min={row.min} max={row.max} value={row.v} onChange={(e) => { markEdit(); row.set(Number(e.target.value)); }} style={{ width: "100%" }} />
                </label>
              ))}
            </fieldset>
          </SidebarPanel>

          {/* 🎞 Camera RAW — exposure / clarity / dehaze sliders */}
          <SidebarPanel id="cameraraw" title="🎞 Camera RAW 效果" defaultPos={{ x: 816, y: 368 }} width={272} defaultCollapsed>
            <fieldset disabled={imageToolsDisabled} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {imageToolHint ? <span style={{ fontSize: 11, opacity: 0.65 }}>{imageToolHint}</span> : null}
              {([
                { label: "曝光 Exposure", v: exposure, set: setExposure, min: -100, max: 100 },
                { label: "清晰度 Clarity", v: clarity, set: setClarity, min: 0, max: 100 },
                { label: "去霧 Dehaze", v: dehaze, set: setDehaze, min: 0, max: 100 },
              ] as { label: string; v: number; set: (n: number) => void; min: number; max: number }[]).map((row) => (
                <label key={row.label} style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{row.label}</span>
                    <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{row.v > 0 ? `+${row.v}` : `${row.v}`}</span>
                  </span>
                  <input type="range" min={row.min} max={row.max} value={row.v} onChange={(e) => { markEdit(); row.set(Number(e.target.value)); }} style={{ width: "100%" }} />
                </label>
              ))}
            </fieldset>
          </SidebarPanel>

          {/* 🎨 HSL Color Mixer — Photoshop-style 8-range targeted H/S/L (精準版) */}
          <SidebarPanel id="hslmixer" title="🎨 色彩混合器 HSL" defaultPos={{ x: 816, y: 370 }} width={272} defaultCollapsed>
            <fieldset disabled={imageToolsDisabled} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
              {imageToolHint ? <span style={{ fontSize: 11, opacity: 0.65 }}>{imageToolHint}</span> : null}
              {/* Tab strip: 全部 + 8 ranges */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                <button
                  className="btn-secondary"
                  style={{ fontSize: 11, padding: "2px 7px", fontWeight: hslTab === "all" ? 700 : 400,
                    borderBottom: hslTab === "all" ? "2px solid var(--accent)" : "2px solid transparent" }}
                  onClick={() => setHslTab("all")}
                >全部</button>
                {HSL_RANGES.map((r) => (
                  <button key={r.key} className="btn-secondary"
                    style={{ fontSize: 11, padding: "2px 5px", fontWeight: hslTab === r.key ? 700 : 400,
                      borderBottom: hslTab === r.key ? `2px solid ${r.color}` : "2px solid transparent" }}
                    onClick={() => setHslTab(r.key)}
                  >
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: r.color, marginRight: 3, verticalAlign: "middle" }} />
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Active range label */}
              <div style={{ opacity: 0.55, fontSize: 11 }}>
                {hslTab === "all" ? "全部色相（整體偏移）" : `${HSL_RANGES.find(r => r.key === hslTab)?.label ?? ""} 色段`}
                {hasAnyHslAdjustment(hslMixer) && (
                  <span style={{ color: "var(--accent-text)", marginLeft: 6 }}>已調整</span>
                )}
              </div>

              {/* H / S / L sliders for current tab */}
              {(
                [
                  { label: "色相 Hue", axis: "h" as const, min: -40, max: 40 },
                  { label: "飽和度 Saturation", axis: "s" as const, min: -100, max: 100 },
                  { label: "明度 Luminance", axis: "l" as const, min: -100, max: 100 },
                ] satisfies { label: string; axis: "h" | "s" | "l"; min: number; max: number }[]
              ).map((row) => {
                const v = hslMixer[hslTab][row.axis];
                return (
                  <label key={row.axis} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{row.label}</span>
                      <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums", color: v !== 0 ? "var(--accent-text)" : undefined }}>
                        {v > 0 ? `+${v}` : `${v}`}
                      </span>
                    </span>
                    <input
                      type="range" min={row.min} max={row.max} value={v}
                      onChange={(e) => {
                        markEdit();
                        const nv = Number(e.target.value);
                        setHslMixer(prev => ({
                          ...prev,
                          [hslTab]: { ...prev[hslTab], [row.axis]: nv },
                        }));
                      }}
                      style={{ width: "100%" }}
                    />
                  </label>
                );
              })}

              {/* Reset buttons */}
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button className="btn-secondary" style={{ fontSize: 11 }}
                  onClick={() => { markEdit(); setHslMixer(prev => ({ ...prev, [hslTab]: { h: 0, s: 0, l: 0 } })); }}>
                  重置此色段
                </button>
                <button className="btn-secondary" style={{ fontSize: 11 }}
                  onClick={() => { markEdit(); setHslMixer(JSON.parse(JSON.stringify(HSL_NEUTRAL))); }}>
                  全部重置
                </button>
              </div>
            </fieldset>
          </SidebarPanel>

          <SidebarPanel id="filters" title="🎨 濾鏡 / 去背 / 效果" defaultPos={{ x: 816, y: 390 }} width={272} defaultCollapsed>
            <fieldset disabled={imageToolsDisabled} style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {imageToolHint ? <span style={{ fontSize: 11, opacity: 0.65 }}>{imageToolHint}</span> : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  className="btn-secondary"
                  style={{ fontSize: 12, fontWeight: presetId === null ? 700 : 400 }}
                  onClick={() => { markEdit(); setPresetId(null); }}
                >
                  原圖
                </button>
                {PRESET_FILTERS.map((p) => (
                  <button
                    key={p.id}
                    className="btn-secondary"
                    style={{ fontSize: 12, fontWeight: presetId === p.id ? 700 : 400 }}
                    onClick={() => { markEdit(); setPresetId(presetId === p.id ? null : p.id); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={removeWhite} onChange={(e) => { markEdit(); setRemoveWhite(e.target.checked); }} />
                ✂️ 去白底（免費，近白色變透明）
              </label>
              {/* 影像效果積木：自然飽和 / 高斯模糊 / 雜訊 */}
              {[
                { label: "自然飽和", v: vibrance, set: setVibrance, min: -100, max: 100 },
                { label: "色溫 冷↔暖", v: temp, set: setTemp, min: -100, max: 100 },
                { label: "高斯模糊", v: blurv, set: setBlurv, min: 0, max: 100 },
                { label: "雜訊", v: noisev, set: setNoisev, min: 0, max: 100 },
              ].map((row) => (
                <label key={row.label} style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ display: "flex", justifyContent: "space-between" }}><span>{row.label}</span><span style={{ opacity: 0.7 }}>{row.v}</span></span>
                  <input type="range" min={row.min} max={row.max} value={row.v} onChange={(e) => { markEdit(); row.set(Number(e.target.value)); }} />
                </label>
              ))}
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

        {/* (原獨立「🔤 字型庫」面板已併入上方「🔤 文字」面板,避免兩個文字面板重複混淆。) */}
        </div>
      </div>
    </div>
  );
}
