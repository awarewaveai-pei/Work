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
import { CANVAS_SOURCE_KEY, CANVAS_NAME_KEY } from "@/components/tools/canvas-handoff";
import ColorGradePanel, { useColorGrade } from "@/components/tools/ColorGradePanel";
import { buildFabricImageFilters, buildPresetFilters, buildEffectFilters, PRESET_FILTERS } from "./fabric-filters";
import SidebarPanel from "@/components/tools/SidebarPanel";
import FontLibrary from "@/components/tools/FontLibrary";
import { posterizeDataUrl } from "@/lib/studio/posterize";
// Pure-data import only (NOT generative-fill.ts — that uses Buffer/process.env, server-only).
import { OUTPAINT_PRESETS, OUTPAINT_LABELS, type OutpaintPreset } from "@/lib/studio/outpaint-presets";
import { EDGE_MASK_STYLES, applyEdgeMask, buildMaskSvg, type EdgeMaskId } from "@/lib/studio/edge-mask";

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
  const [szUnit, setSzUnit] = useState<"cm" | "mm">("cm");
  const [szDpi, setSzDpi] = useState(300);
  const [szInfo, setSzInfo] = useState<string | null>(null);
  const canvasMetaRef = useRef<{ realW: number; realH: number; dispScale: number; dpi: number } | null>(null);
  const [drawMode, setDrawMode] = useState<"off" | "draw" | "erase">("off"); // 自由繪筆 / 橡皮擦
  const [drawColor, setDrawColor] = useState("#111111");
  const [drawWidth, setDrawWidth] = useState(6);
  const drawHandlerRef = useRef<((e: { path?: FabricObject }) => void) | null>(null);
  const [inpaintMode, setInpaintMode] = useState(false); // 🪄 painting a mask (removal or fill)
  const [inpaintBusy, setInpaintBusy] = useState(false);
  const [maskMode, setMaskMode] = useState<"remove" | "fill">("remove"); // what the painted mask does
  const [fillPrompt, setFillPrompt] = useState(""); // 生成填色 prompt (AI fills the masked area)
  const [brushSize, setBrushSize] = useState(34);
  // 🖼 擴圖 outpaint (flux-fill-pro) + 色調分離 posterize — both replace the selected image's pixels.
  const [outpaintDir, setOutpaintDir] = useState<OutpaintPreset>("Zoom out 1.5x");
  const [genBusy, setGenBusy] = useState(false); // outpaint / posterize / edge-mask in flight
  const [edgeAmount, setEdgeAmount] = useState(55);
  const [edgeStyleApplied, setEdgeStyleApplied] = useState<EdgeMaskId | null>(null);
  const [posterLevels, setPosterLevels] = useState(5);
  // 🗂 群組 — track whether the active selection can be grouped / ungrouped.
  const [multiSelected, setMultiSelected] = useState(false); // ActiveSelection (≥2 objects)
  const [groupSelected, setGroupSelected] = useState(false); // a single Group object
  const inpaintImgRef = useRef<FabricObject | null>(null); // image being edited in inpaint mode
  const inpaintPathsRef = useRef<FabricObject[]>([]); // strokes painted as the mask
  // 🎨 物件效果（PS 圖層樣式）— apply to the selected object (text/image/shape).
  const [objOpacity, setObjOpacity] = useState(100);
  const [objBlend, setObjBlend] = useState("normal");
  const [objShadow, setObjShadow] = useState(false);
  const [objStroke, setObjStroke] = useState(false);
  const [objStrokeColor, setObjStrokeColor] = useState("#000000");
  const [objStrokeWidth, setObjStrokeWidth] = useState(4);
  const grade = useColorGrade(); // 修圖積木 applied to the selected image via Fabric filters

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

      // Persist our custom `name` (圖層改名) through toJSON/loadFromJSON + design save. Must be set
      // class-level BEFORE any object is created (Fabric v7 concatenates customProperties into
      // every toObject; per-instance assignment is ignored). Confirmed: fabricjs discussion #10176.
      (fabric.FabricObject as unknown as { customProperties: string[] }).customProperties = ["name"];

      canvas = new fabric.Canvas(canvasElRef.current, {
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;
      canvasMetaRef.current = null; // fresh canvas → no print-size meta (critic: stale meta would corrupt export)
      setReady(true);

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
        setEdgeStyleApplied(null);
        setAnySelected(false);
        setMultiSelected(false);
        setGroupSelected(false);
        setLockSelected(false);
      });
      // 🗂 keep the layer panel in sync with the object stack.
      const onStack = () => {
        setLayers([...canvas.getObjects()].reverse());
        snapshot(); // record an undo step on add/remove/modify
      };
      canvas.on("object:added", onStack);
      canvas.on("object:removed", onStack);
      canvas.on("object:modified", onStack);
      setLayers([...canvas.getObjects()].reverse());
      snapshot(); // initial baseline so the first edit is undoable

      const source = typeof window !== "undefined" ? sessionStorage.getItem(CANVAS_SOURCE_KEY) : null;
      if (typeof window !== "undefined") {
        const handoffName = sessionStorage.getItem(CANVAS_NAME_KEY);
        if (handoffName) {
          nameRef.current = handoffName; // set-only-when-found → StrictMode-safe
          sessionStorage.removeItem(CANVAS_NAME_KEY); // consume so a later direct visit can't inherit it
        }
      }
      if (source) {
        try {
          const img = await fabric.FabricImage.fromURL(source, { crossOrigin: "anonymous" });
          if (disposed || !canvas) return;
          // Match the canvas to the imported image instead of forcing every handoff into
          // the default 800×800 square. Work in source-pixel coordinates and zoom the
          // preview down to fit; exportPng() restores the full source dimensions.
          const realW = Math.max(1, img.width || 800);
          const realH = Math.max(1, img.height || 800);
          const maxDisplay = 800;
          const dispScale = Math.min(1, maxDisplay / Math.max(realW, realH));
          canvas.setZoom(dispScale);
          canvas.setDimensions({
            width: Math.round(realW * dispScale),
            height: Math.round(realH * dispScale),
          });
          canvasMetaRef.current = { realW, realH, dispScale, dpi: szDpi };
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
        } catch {
          setError("底圖載入失敗（可能是跨來源限制）。仍可加文字／上傳圖片。");
        }
      }
    })();

    return () => {
      disposed = true;
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
        ...buildEffectFilters(ns, { vibrance, blur: blurv, noise: noisev, temp }),
      ];
      target.applyFilters();
      canvas.requestRenderAll();
    });
    return () => {
      cancelled = true;
    };
  }, [grade.params, presetId, removeWhite, vibrance, blurv, noisev, temp]);

  const addText = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    void import("fabric").then((fabric) => {
      if (fabricRef.current !== canvas) return; // unmounted/disposed mid-import
      const text = new fabric.IText("雙擊編輯文字", {
        left: canvas.getWidth() / 2,
        top: canvas.getHeight() / 2,
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
        restoringRef.current = false; // only now are all object:added events done
      });
    },
    [refreshLayers]
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

  // 📐 畫布尺寸 / DPI — cm/mm → px (round(cm·dpi/2.54)); resize the Fabric canvas to a scaled
  // display (≤ MAX_DISP) and store real px + scale so export can render at full DPI.
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
    const MAX_DISP = 820;
    const cm = (v: number) => (szUnit === "mm" ? v / 10 : v);
    const realW = Math.max(1, Math.round((cm(szW) * szDpi) / 2.54));
    const realH = Math.max(1, Math.round((cm(szH) * szDpi) / 2.54));
    const dispScale = Math.min(1, MAX_DISP / Math.max(realW, realH));

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
    // Work in real-coordinate space, zoomed down to fit the display element.
    canvas.setZoom(dispScale);
    canvas.setDimensions({ width: Math.round(realW * dispScale), height: Math.round(realH * dispScale) });
    canvasMetaRef.current = { realW, realH, dispScale, dpi: szDpi };
    const cmW = +((realW / szDpi) * 2.54).toFixed(2);
    const cmH = +((realH / szDpi) * 2.54).toFixed(2);
    setSzInfo(`真實 ${realW}×${realH}px @${szDpi}DPI = ${cmW}×${cmH}cm（預覽 ${Math.round(dispScale * 100)}%）`);
    canvas.requestRenderAll();
  }, [szW, szH, szUnit, szDpi]);

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
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      void import("fabric").then(async (fabric) => {
        const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });
        if (fabricRef.current !== canvas) return; // unmounted/disposed mid-import/decode
        const scale = Math.min((canvas.getWidth() * 0.6) / (img.width || 1), 1);
        img.scale(scale);
        canvas.add(img);
        canvas.centerObject(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
      });
    };
    reader.readAsDataURL(file);
  }, []);

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
      const cx = canvas.getWidth() / 2;
      const cy = canvas.getHeight() / 2;
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
      canvas.requestRenderAll();
      refreshLayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenBusy(false);
    }
  }, [posterLevels, refreshLayers]);

  // 🖼 擴圖 Outpaint — extend the selected image with flux-fill-pro's outpaint presets (no mask,
  // no coordinate math). Sends the natural-res image + prompt + preset; replaces with the larger
  // result at the SAME per-pixel scale so original content keeps size and the new area extends out.
  const applyOutpaint = useCallback(async () => {
    const canvas = fabricRef.current;
    const img = canvas?.getActiveObject() as
      | (FabricObject & { scaleX?: number; scaleY?: number; name?: string; toDataURL?: (o?: Record<string, unknown>) => string })
      | null;
    if (!canvas || !img || img.type !== "image" || !img.toDataURL) return;
    if (fillPrompt.trim().length < 2) {
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
        body: JSON.stringify({ image: src, prompt: fillPrompt.trim(), outpaint: outpaintDir }),
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
      canvas.requestRenderAll();
      refreshLayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenBusy(false);
    }
  }, [fillPrompt, outpaintDir, refreshLayers]);

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
      canvas.requestRenderAll();
      refreshLayers();
      setEdgeStyleApplied(styleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenBusy(false);
    }
  }, [edgeAmount, refreshLayers]);

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
    a.download = `${nameRef.current || "canvas-design"}.design.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

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
  }, [maskMode, fillPrompt]);

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
    // Use the semantic base name captured from the handoff on mount (nameRef); fall back
    // to the old fixed name when the editor was opened without metadata (e.g. sidebar link).
    const base = nameRef.current || "canvas-design";
    const a = document.createElement("a");
    a.href = png;
    a.download = `${base}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [exportPng]);

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

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <h1 style={{ fontSize: 18, margin: 0 }}>✏️ 快速編輯 Canvas</h1>
      <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
        上傳圖案、加文字，拖曳 / 縮放 / 旋轉，即時預覽。完成後可下載 PNG 或存入 My Designs。
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn-secondary" disabled={!ready || !canUndo || drawMode !== "off" || inpaintMode} onClick={undo} title="復原 (Undo)">↩️</button>
        <button className="btn-secondary" disabled={!ready || !canRedo || drawMode !== "off" || inpaintMode} onClick={redo} title="重做 (Redo)">↪️</button>
        <button className="btn-secondary" disabled={!ready} onClick={addText}>＋ 文字</button>
        <label className="btn-secondary" style={{ cursor: ready ? "pointer" : "default" }}>
          ＋ 上傳圖案
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            disabled={!ready}
            onChange={(e) => {
              uploadImage(e.target.files?.[0] ?? null);
              e.target.value = ""; // allow re-uploading the same file
            }}
          />
        </label>
        <button className="btn-secondary" disabled={!ready} onClick={deleteSelected}>刪除選取</button>
        {/* 🔷 形狀積木 */}
        <button className="btn-secondary" disabled={!ready} onClick={() => addShape("rect")} title="加方框">▭</button>
        <button className="btn-secondary" disabled={!ready} onClick={() => addShape("circle")} title="加圓形">◯</button>
        <button className="btn-secondary" disabled={!ready} onClick={() => addShape("line")} title="加線條">／</button>
        {/* 🔒 物件鎖定積木 */}
        <button
          className="btn-secondary"
          disabled={!ready || !anySelected}
          onClick={toggleLock}
          title="鎖定／解鎖選取物件（防誤移）"
        >
          {lockSelected ? "🔒 已鎖定" : "🔓 鎖定"}
        </button>
        {/* 🗂 群組 / 解散群組 — group an active multi-selection, ungroup a selected group */}
        {multiSelected ? (
          <button className="btn-secondary" disabled={!ready} onClick={groupSelection} title="把選取的多個物件組成群組">🗂 群組</button>
        ) : null}
        {groupSelected ? (
          <button className="btn-secondary" disabled={!ready} onClick={ungroupSelection} title="把群組拆回個別物件">🗂 解散</button>
        ) : null}
        {/* ✏️ 自由繪筆 / 🧹 橡皮擦 — toggle drawing mode (exits inpaint first) */}
        <button
          className="btn-secondary"
          disabled={!ready || inpaintMode}
          style={{ fontWeight: drawMode === "draw" ? 700 : 400 }}
          onClick={() => applyDrawMode(drawMode === "draw" ? "off" : "draw")}
          title="自由繪筆"
        >
          ✏️ 畫筆
        </button>
        <button
          className="btn-secondary"
          disabled={!ready || inpaintMode}
          style={{ fontWeight: drawMode === "erase" ? 700 : 400 }}
          onClick={() => applyDrawMode(drawMode === "erase" ? "off" : "erase")}
          title="橡皮擦（擦掉畫到的地方）"
        >
          🧹 橡皮擦
        </button>
        {drawMode !== "off" ? (
          <>
            {drawMode === "draw" ? (
              <input type="color" value={drawColor} title="畫筆顏色" onChange={(e) => { setDrawColor(e.target.value); const c = fabricRef.current; if (c?.freeDrawingBrush) c.freeDrawingBrush.color = e.target.value; }} style={{ width: 30, height: 24, padding: 0 }} />
            ) : null}
            <input type="range" min={1} max={80} value={drawWidth} title="筆刷大小" onChange={(e) => { const w = Number(e.target.value); setDrawWidth(w); const c = fabricRef.current; if (c?.freeDrawingBrush) c.freeDrawingBrush.width = w; }} />
          </>
        ) : null}
        <span style={{ flex: 1 }} />
        {/* 💾 設計檔（可再編輯）— export/import the full canvas JSON */}
        <button className="btn-secondary" disabled={!ready} onClick={exportDesign} title="匯出可再編輯的設計檔（.design.json）">💾 設計檔</button>
        <label className="btn-secondary" style={{ cursor: ready ? "pointer" : "default" }} title="載入先前匯出的設計檔">
          📂 載入
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            disabled={!ready}
            onChange={(e) => {
              importDesign(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        <button className="btn-primary" disabled={!ready} onClick={download}>下載 PNG</button>
        <button
          className="btn-primary"
          disabled={!ready || saveState === "saving" || saveState === "saved"}
          onClick={() => void saveToDesigns()}
        >
          {saveState === "saved" ? "已存入 ✓" : saveState === "saving" ? "儲存中…" : "存入 My Designs"}
        </button>
      </div>

      {/* Text style controls — apply to the selected text, or set defaults for the next ＋文字. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
        <span style={{ opacity: 0.6 }}>
          文字{textSelected ? "（套用到選取）" : "（新文字預設）"}：
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          字型
          <select
            className="btn-secondary"
            value={textFont}
            disabled={!ready}
            onChange={(e) => {
              setTextFont(e.target.value);
              applyTextStyle({ fontFamily: e.target.value });
            }}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          顏色
          <input
            type="color"
            value={textColor}
            disabled={!ready}
            onChange={(e) => {
              setTextColor(e.target.value);
              applyTextStyle({ fill: e.target.value });
            }}
            style={{ width: 32, height: 24, padding: 0, border: "1px solid var(--card-border)", borderRadius: 4, cursor: "pointer" }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          字級
          <input
            type="range"
            min={8}
            max={200}
            step={1}
            value={textSize}
            disabled={!ready}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTextSize(v);
              applyTextStyle({ fontSize: v });
            }}
          />
          <span style={{ width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{textSize}</span>
        </label>
      </div>

      {error ? <span style={{ color: "var(--red)", fontSize: 12 }}>{error}</span> : null}

      {/* 畫布 + 右側可捲動工具欄（vector-trace-demo 風格）。面板垂直堆疊、可收合。 */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, width: 802, background: "var(--card-bg)", flexShrink: 0, display: "flex", justifyContent: "center" }}>
          <canvas ref={canvasElRef} width={800} height={800} />
        </div>

        {/* 右側工具欄：固定寬、超出時捲動 */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            maxHeight: "calc(100vh - 130px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            paddingRight: 4,
          }}
        >
        {/* 📐 畫布尺寸 / DPI — 公分/公釐 + DPI 自設（參考 vector-trace-demo）。 */}
        <SidebarPanel id="canvas-size" title="📐 畫布尺寸 / DPI" defaultPos={{ x: 816, y: 0 }} width={236}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                寬
                <input className="btn-secondary" type="number" min={0.1} step={0.1} value={szW} onChange={(e) => setSzW(Number(e.target.value))} />
              </label>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                高
                <input className="btn-secondary" type="number" min={0.1} step={0.1} value={szH} onChange={(e) => setSzH(Number(e.target.value))} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                單位
                <select className="btn-secondary" value={szUnit} onChange={(e) => setSzUnit(e.target.value as "cm" | "mm")}>
                  <option value="cm">公分 cm</option>
                  <option value="mm">公釐 mm</option>
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

        {/* 🎨 物件效果（PS 圖層樣式）— shown for ANY selected object (text/image/shape). */}
        {anySelected ? (
          <SidebarPanel id="effects" title="🎨 物件效果" defaultPos={{ x: 816, y: 286 }} width={260} defaultCollapsed>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ display: "flex", justifyContent: "space-between" }}><span>透明度</span><span style={{ opacity: 0.7 }}>{objOpacity}%</span></span>
              <input type="range" min={0} max={100} value={objOpacity} onChange={(e) => { const v = Number(e.target.value); setObjOpacity(v); setActiveProp({ opacity: v / 100 }); }} />
            </label>
            <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 2 }}>
              混合模式
              <select className="btn-secondary" value={objBlend} onChange={(e) => { setObjBlend(e.target.value); setActiveProp({ globalCompositeOperation: e.target.value === "normal" ? "source-over" : e.target.value }); }}>
                {["normal", "multiply", "screen", "overlay", "darken", "lighten", "difference", "color-dodge", "color-burn", "soft-light", "hard-light"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => flipActive("x")}>↔ 水平翻轉</button>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => flipActive("y")}>↕ 垂直翻轉</button>
            </div>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={objShadow} onChange={(e) => toggleShadow(e.target.checked)} /> 陰影 Drop shadow
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={objStroke} onChange={(e) => toggleStroke(e.target.checked)} /> 描邊 Stroke
              </label>
              {objStroke ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 22 }}>
                  <input type="color" value={objStrokeColor} onChange={(e) => { setObjStrokeColor(e.target.value); setActiveProp({ stroke: e.target.value }); }} style={{ width: 30, height: 22, padding: 0 }} />
                  <input type="range" min={1} max={40} value={objStrokeWidth} onChange={(e) => { const w = Number(e.target.value); setObjStrokeWidth(w); setActiveProp({ strokeWidth: w }); }} style={{ flex: 1 }} />
                  <span style={{ width: 22, textAlign: "right" }}>{objStrokeWidth}</span>
                </div>
              ) : null}
            </div>
            {!imageSelected ? (
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={applyGradient} title="把選取的文字/形狀填成漸層（左色用畫筆顏色）">🌈 漸層填色</button>
            ) : null}
            {/* ✂️ 剪裁遮罩 clipPath */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span style={{ opacity: 0.6 }}>遮罩</span>
              <button className="btn-secondary" style={{ fontSize: 12 }} title="圓形遮罩" onClick={() => applyClip("circle")}>⬤</button>
              <button className="btn-secondary" style={{ fontSize: 12 }} title="圓角遮罩" onClick={() => applyClip("round")}>▢</button>
              <button className="btn-secondary" style={{ fontSize: 12 }} title="移除遮罩" onClick={() => applyClip("none")}>無</button>
            </div>
          </div>
          </SidebarPanel>
        ) : null}

        {/* 調色工具包 — appears when an image is selected; applies via Fabric filters (WYSIWYG). */}
        {imageSelected ? (
          <>
          {/* 3 個獨立可拖面板：調色 / 濾鏡效果 / AI 去除 */}
          <SidebarPanel id="grade" title="🎨 調色 / 修圖" defaultPos={{ x: 816, y: 328 }} width={272} defaultCollapsed>
            <ColorGradePanel state={grade.state} onSet={grade.set} onReset={grade.reset} neutral={grade.neutral} />
          </SidebarPanel>

          <SidebarPanel id="filters" title="🎨 濾鏡 / 去背 / 效果" defaultPos={{ x: 816, y: 370 }} width={272} defaultCollapsed>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  className="btn-secondary"
                  style={{ fontSize: 12, fontWeight: presetId === null ? 700 : 400 }}
                  onClick={() => setPresetId(null)}
                >
                  原圖
                </button>
                {PRESET_FILTERS.map((p) => (
                  <button
                    key={p.id}
                    className="btn-secondary"
                    style={{ fontSize: 12, fontWeight: presetId === p.id ? 700 : 400 }}
                    onClick={() => setPresetId(presetId === p.id ? null : p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={removeWhite} onChange={(e) => setRemoveWhite(e.target.checked)} />
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
                  <input type="range" min={row.min} max={row.max} value={row.v} onChange={(e) => row.set(Number(e.target.value))} />
                </label>
              ))}
            </div>
          </SidebarPanel>

          <SidebarPanel id="inpaint" title="🪄 去除 / 生成填色（AI）" defaultPos={{ x: 816, y: 412 }} width={272} defaultCollapsed>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
            </div>
          </SidebarPanel>

          {/* 🖼 擴圖（flux-fill-pro outpaint）+ 🎚 色調分離（bake）— both replace the selected image. */}
          <SidebarPanel id="genfx" title="🖼 擴圖 / 🎚 色調分離" defaultPos={{ x: 816, y: 454 }} width={272} defaultCollapsed>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>🖼 擴圖 Outpaint（AI 往外補畫面）</span>
                <input
                  className="btn-secondary"
                  placeholder="描述整體場景，例如：海邊草地"
                  value={fillPrompt}
                  onChange={(e) => setFillPrompt(e.target.value)}
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
            </div>
          </SidebarPanel>

          {/* ✂️ 邊緣遮罩 — brush/grunge edge on the selected image → transparent PNG */}
          <SidebarPanel id="edge-mask" title="✂️ 邊緣遮罩（筆刷邊）" defaultPos={{ x: 816, y: 496 }} width={276} defaultCollapsed>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
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
            </div>
          </SidebarPanel>
          </>
        ) : null}

        {/* 🔤 字型庫 — Google Fonts (中/英) + 上傳字型 + 粗體/斜體/底線, shown when text selected. */}
        {textSelected ? (
          <SidebarPanel id="fonts" title="🔤 字型庫" defaultPos={{ x: 816, y: 454 }} width={240} defaultCollapsed>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button className="btn-secondary" style={{ fontSize: 13, fontWeight: 700 }} title="粗體（切換）" onClick={() => toggleText("fontWeight")}>B</button>
              <button className="btn-secondary" style={{ fontSize: 13, fontStyle: "italic" }} title="斜體（切換）" onClick={() => toggleText("fontStyle")}>I</button>
              <button className="btn-secondary" style={{ fontSize: 13, textDecoration: "underline" }} title="底線（切換）" onClick={() => toggleText("underline")}>U</button>
              <button className="btn-secondary" style={{ fontSize: 12 }} title="文字沿弧形路徑" onClick={() => applyTextArc(true)}>〽️ 弧形</button>
              <button className="btn-secondary" style={{ fontSize: 12 }} title="取消弧形（拉直）" onClick={() => applyTextArc(false)}>直</button>
            </div>
            <FontLibrary
              current={textFont}
              onPick={(family) => {
                setTextFont(family);
                applyTextStyle({ fontFamily: family });
              }}
            />
          </SidebarPanel>
        ) : null}
        </div>
      </div>
    </div>
  );
}
