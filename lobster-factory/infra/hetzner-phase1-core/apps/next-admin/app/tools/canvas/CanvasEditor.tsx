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
import { CANVAS_SOURCE_KEY } from "@/components/tools/canvas-handoff";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function CanvasEditor() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  // Fabric v6/v7 dispose() is async (awaits an in-flight rAF render before detaching).
  // React 18 StrictMode mounts effects twice (mount→cleanup→mount); reusing the SAME
  // <canvas> node before the prior dispose finishes throws "already initialized" / leaks
  // listeners (fabricjs/fabric.js#10482, #8899). We park the dispose promise here and the
  // next mount AWAITS it before constructing a new Canvas on the node.
  const disposeRef = useRef<Promise<void> | null>(null);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

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

      const source = typeof window !== "undefined" ? sessionStorage.getItem(CANVAS_SOURCE_KEY) : null;
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
        fontSize: 48,
        fill: "#111111",
        fontFamily: "sans-serif",
      });
      canvas.add(text);
      canvas.setActiveObject(text);
      canvas.requestRenderAll();
    });
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
    const a = document.createElement("a");
    a.href = png;
    a.download = "canvas-design.png";
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

      {error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{error}</span> : null}

      <div style={{ border: "1px solid var(--card-border)", borderRadius: 8, width: "fit-content", background: "#fff" }}>
        <canvas ref={canvasElRef} width={800} height={800} />
      </div>
    </div>
  );
}
