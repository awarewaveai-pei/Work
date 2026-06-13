"use client";

/**
 * GradedPreview — TRUE WYSIWYG colour-grade preview for the Studio/Tarot inline panels.
 *
 * The old preview was `<img style={{filter: cssFilter}}>` — CSS can't do gamma/sharpen/levels,
 * so those sliders moved with no visible effect ("看不到怎麼調整"). This renders the image
 * through Fabric's filter pipeline (same engine as the Canvas editor), so EVERY slider shows
 * its real result, and `exportPng()` re-renders at FULL resolution — preview === download.
 *
 *  - Fabric is dynamic-import()ed (client-only; never on the server).
 *  - The internal canvas is the image's natural size (full-res); the DISPLAY is CSS-scaled to
 *    fit maxWidth/maxHeight, so the on-screen preview is small but the export stays full-res.
 *  - Filters rebuild on every `params` change (WebGL-accelerated; smooth for preview sizes).
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { StaticCanvas, FabricImage } from "fabric";
import { buildFabricImageFilters } from "@/app/tools/canvas/fabric-filters";
import type { ColorGradeParams } from "@/lib/studio/color-grade";

export type GradedPreviewHandle = {
  /** Full-resolution PNG data URL with the current grade baked in (null until loaded). */
  exportPng: () => string | null;
};

type Props = {
  image: string;
  params: ColorGradeParams;
  maxWidth?: number;
  maxHeight?: number;
};

const GradedPreview = forwardRef<GradedPreviewHandle, Props>(function GradedPreview(
  { image, params, maxWidth = 520, maxHeight = 560 },
  ref
) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fcRef = useRef<StaticCanvas | null>(null);
  const imgRef = useRef<FabricImage | null>(null);
  const disposeRef = useRef<Promise<void> | null>(null);
  const [failed, setFailed] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      exportPng: () => {
        const fc = fcRef.current;
        if (!fc) return null;
        try {
          // multiplier 1 because the canvas is already the image's natural size.
          return fc.toDataURL({ format: "png", multiplier: 1 });
        } catch {
          return null; // taint (cross-origin image) → caller falls back to raw
        }
      },
    }),
    []
  );

  // (Re)load the image whenever `image` changes.
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
        const fc = new fabric.StaticCanvas(canvasElRef.current, { enableRetinaScaling: false });
        fc.setDimensions({ width: img.width || 1, height: img.height || 1 });
        img.set({ left: 0, top: 0, selectable: false });
        fc.add(img);
        fcRef.current = fc;
        imgRef.current = img;
        // apply current grade immediately
        const ns = fabric as unknown as { filters: Record<string, new (o?: Record<string, unknown>) => object> };
        (img as unknown as { filters: object[]; applyFilters: () => void }).filters = buildFabricImageFilters(ns, params);
        (img as unknown as { applyFilters: () => void }).applyFilters();
        fc.renderAll();
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

  // Re-apply filters when the grade changes (image already loaded).
  useEffect(() => {
    const fc = fcRef.current;
    const img = imgRef.current;
    if (!fc || !img) return;
    let cancelled = false;
    void import("fabric").then((fabric) => {
      if (cancelled || fcRef.current !== fc) return;
      const ns = fabric as unknown as { filters: Record<string, new (o?: Record<string, unknown>) => object> };
      (img as unknown as { filters: object[]; applyFilters: () => void }).filters = buildFabricImageFilters(ns, params);
      (img as unknown as { applyFilters: () => void }).applyFilters();
      fc.renderAll();
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (failed) {
    // graceful fallback — a cross-origin / decode failure still shows the image (ungraded)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="preview" style={{ maxWidth, maxHeight, borderRadius: 8 }} />;
  }

  return (
    <canvas
      ref={canvasElRef}
      style={{ maxWidth, maxHeight, width: "auto", height: "auto", borderRadius: 8, background: "#fff" }}
    />
  );
});

export default GradedPreview;
