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
import { buildFabricImageFilters, buildPresetFilters, PRESET_FILTERS } from "./fabric-filters";

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
  const [inpaintMode, setInpaintMode] = useState(false); // 🪄 painting a removal mask
  const [inpaintBusy, setInpaintBusy] = useState(false);
  const [brushSize, setBrushSize] = useState(34);
  const inpaintImgRef = useRef<FabricObject | null>(null); // image being edited in inpaint mode
  const inpaintPathsRef = useRef<FabricObject[]>([]); // strokes painted as the mask
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

      canvas = new fabric.Canvas(canvasElRef.current, {
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
      });
      fabricRef.current = canvas;
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
        setAnySelected(!!o);
        setLockSelected(!!(o as { lockMovementX?: boolean } | null)?.lockMovementX);
      };
      canvas.on("selection:created", syncFromSelection);
      canvas.on("selection:updated", syncFromSelection);
      canvas.on("selection:cleared", () => {
        setTextSelected(false);
        setImageSelected(false);
        setAnySelected(false);
        setLockSelected(false);
      });

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
          // fit the base image inside the canvas, centered
          const cw = canvas.getWidth();
          const ch = canvas.getHeight();
          const scale = Math.min(cw / (img.width || cw), ch / (img.height || ch), 1);
          img.scale(scale);
          img.set({ selectable: true });
          canvas.add(img);
          canvas.centerObject(img);
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
      ];
      target.applyFilters();
      canvas.requestRenderAll();
    });
    return () => {
      cancelled = true;
    };
  }, [grade.params, presetId, removeWhite]);

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

  // 🪄 AI 去除不要的部分 — paint a mask over the unwanted region, send image+mask to bria/eraser.
  const startInpaint = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const img = canvas.getActiveObject();
    if (!img || img.type !== "image") return;
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
  }, [brushSize]);

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
      setError("請先把這張圖轉正（角度歸零）再去除");
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

      const res = await fetch("/api/tools/studio/inpaint", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("operator") },
        body: JSON.stringify({ image: sourceUrl, mask: maskUrl }),
      });
      const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
      if (!json.ok || !json.image) {
        setError(json.error ?? "去除失敗，請重試");
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
  }, []);

  /** Flatten the canvas to a PNG data URL (codebase convention — see file header). */
  const exportPng = useCallback((): string | null => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    canvas.discardActiveObject(); // drop selection handles from the export
    canvas.requestRenderAll();
    return canvas.toDataURL({ format: "png", multiplier: 1 });
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
        <span style={{ flex: 1 }} />
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

      {error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{error}</span> : null}

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, width: "fit-content", background: "#fff" }}>
          <canvas ref={canvasElRef} width={800} height={800} />
        </div>
        {/* 調色工具包 — appears when an image is selected; applies via Fabric filters (WYSIWYG). */}
        {imageSelected ? (
          <div style={{ width: 260, display: "flex", flexDirection: "column", gap: 10 }}>
            <ColorGradePanel state={grade.state} onSet={grade.set} onReset={grade.reset} neutral={grade.neutral} />
            {/* 🎨 一鍵濾鏡預設 + ✂️ 免費去白底 (Fabric filters, 與調色共存) */}
            <div className="build-panel" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>🎨 濾鏡 / 去背</strong>
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
            </div>

            {/* 🪄 AI 去除不要的部分 (bria/eraser) */}
            <div className="build-panel" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <strong style={{ fontSize: 13 }}>🪄 去除不要的部分（AI）</strong>
              {!inpaintMode ? (
                <button className="btn-secondary" onClick={startInpaint}>開始塗抹要去除的地方</button>
              ) : (
                <>
                  <p style={{ fontSize: 12, opacity: 0.7, margin: 0 }}>用紅筆塗在想清掉的物件上，再按「套用」。</p>
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
                      {inpaintBusy ? "AI 處理中…" : "✅ 套用去除"}
                    </button>
                    <button className="btn-secondary" disabled={inpaintBusy} onClick={() => exitInpaint(false)}>✖ 取消</button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ width: 260, fontSize: 12, opacity: 0.55, paddingTop: 8 }}>
            點選一張圖片即可調色（色相／亮度／飽和／色階／銳利度）。
          </div>
        )}
      </div>
    </div>
  );
}
