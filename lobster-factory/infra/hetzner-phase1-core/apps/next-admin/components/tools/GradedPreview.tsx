"use client";

/**
 * GradedPreview — TRUE WYSIWYG colour-grade preview for the Studio/Tarot inline panels.
 *
 * The old preview was `<img style={{filter: cssFilter}}>` — CSS can't do gamma/sharpen/levels,
 * so those sliders moved with no visible effect ("看不到怎麼調整"). This renders the image
 * through Fabric's filter pipeline (same engine as the Canvas editor), so EVERY slider shows
 * its real result, and `exportPng()` returns exactly what the preview shows — preview === this
 * convenience export (capped at MAX_EDGE; print-grade output goes through OutputTrackBar's Sharp pipeline).
 *
 * Robustness (critic 2026-06-14):
 *  - fabric module + latest params are cached in refs so `[params]` and `exportPng()` apply
 *    filters SYNCHRONOUSLY — no async gap where a fast slider→save exports the previous grade.
 *  - the <canvas> is keyed by `image` so a new image gets a FRESH DOM node (no Fabric
 *    "already initialized" re-init race); the disposeRef await still guards StrictMode.
 *  - the internal canvas is capped at MAX_EDGE px (memory bound; print-grade output goes
 *    through OutputTrackBar's Sharp pipeline, this is the quick on-screen/convenience path).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { StaticCanvas, FabricImage } from "fabric";
import { buildFabricImageFilters } from "@/app/tools/canvas/fabric-filters";
import type { ColorGradeParams } from "@/lib/studio/color-grade";

export type GradedPreviewHandle = {
  /** PNG data URL with the CURRENT grade baked in (null until loaded / on taint). */
  exportPng: () => string | null;
};

type Props = {
  image: string;
  params: ColorGradeParams;
  maxWidth?: number;
  maxHeight?: number;
};

/** Cap the internal (full-res) canvas to bound memory on print-quality images. */
const MAX_EDGE = 2048;

type FabricNS = { filters: Record<string, new (o?: Record<string, unknown>) => object> };
type FilterableImage = { filters: object[]; applyFilters: () => void };

const GradedPreview = forwardRef<GradedPreviewHandle, Props>(function GradedPreview(
  { image, params, maxWidth = 520, maxHeight = 560 },
  ref
) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fcRef = useRef<StaticCanvas | null>(null);
  const imgRef = useRef<FabricImage | null>(null);
  const fabricNsRef = useRef<FabricNS | null>(null);
  const disposeRef = useRef<Promise<void> | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params; // always hold the latest grade for synchronous export
  const [failed, setFailed] = useState(false);

  // Apply the current grade synchronously (fabric already loaded by the time a canvas exists).
  const applyNow = () => {
    const fc = fcRef.current;
    const img = imgRef.current;
    const ns = fabricNsRef.current;
    if (!fc || !img || !ns) return;
    const target = img as unknown as FilterableImage;
    target.filters = buildFabricImageFilters(ns, paramsRef.current);
    target.applyFilters();
    fc.renderAll();
  };

  useImperativeHandle(
    ref,
    () => ({
      exportPng: () => {
        const fc = fcRef.current;
        if (!fc) return null;
        applyNow(); // guarantee the latest grade is baked before reading pixels
        try {
          return fc.toDataURL({ format: "png", multiplier: 1 });
        } catch {
          return null; // taint (cross-origin image) → caller falls back to raw
        }
      },
    }),
    []
  );

  // (Re)load the image whenever `image` changes. Canvas is keyed by image → fresh node.
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      if (disposeRef.current) {
        try {
          await disposeRef.current;
        } catch {
          /* prior dispose errors are non-fatal */
        }
      }
      const fabric = await import("fabric");
      if (cancelled || !canvasElRef.current) return;
      try {
        const img = await fabric.FabricImage.fromURL(image, { crossOrigin: "anonymous" });
        if (cancelled) return;
        const natW = img.width || 1;
        const natH = img.height || 1;
        const scale = Math.min(1, MAX_EDGE / Math.max(natW, natH));
        const w = Math.max(1, Math.round(natW * scale));
        const h = Math.max(1, Math.round(natH * scale));
        const fc = new fabric.StaticCanvas(canvasElRef.current, { enableRetinaScaling: false });
        fc.setDimensions({ width: w, height: h }, { backstoreOnly: true });
        // Set CSS display size proportionally to fit within maxWidth/maxHeight.
        // Without this, Fabric's wrapper div stays at buffer size (e.g. 1024×1536) while
        // CSS max constraints only affect the <canvas> element itself, causing misalignment/crop.
        const displayScale = Math.min(maxWidth / w, maxHeight / h, 1);
        fc.setDimensions(
          { width: Math.round(w * displayScale), height: Math.round(h * displayScale) },
          { cssOnly: true }
        );
        img.set({ left: 0, top: 0, originX: "left", originY: "top", scaleX: scale, scaleY: scale, selectable: false });
        fc.add(img);
        fcRef.current = fc;
        imgRef.current = img;
        fabricNsRef.current = fabric as unknown as FabricNS;
        applyNow(); // apply current grade immediately (synchronous)
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      const fc = fcRef.current;
      fcRef.current = null;
      imgRef.current = null;
      disposeRef.current = fc ? Promise.resolve(fc.dispose()).then(() => undefined, () => undefined) : null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // Re-apply filters when the grade changes — synchronous (no async import gap).
  useEffect(() => {
    applyNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  if (failed) {
    // graceful fallback — a cross-origin / decode / init failure still shows the image (ungraded)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="preview" style={{ maxWidth, maxHeight, borderRadius: 8 }} />;
  }

  return (
    <canvas
      key={image}
      ref={canvasElRef}
      style={{ display: "block", borderRadius: 8, background: "#fff" }}
    />
  );
});

export default GradedPreview;
