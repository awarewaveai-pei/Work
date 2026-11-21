"use client";
// The one full-screen image viewer for every image tool. Opens fitted to the screen; zoom with the wheel (toward the
// cursor), ＋／－, 1:1 (= the image's real pixels) or a double-click; drag to move a zoomed image. Esc, ✕ or a click
// on the dark background closes it.
import { useEffect, useRef, useState } from "react";

const MIN = 1; // 1 = fitted to the screen
const STEP = 1.25;

export default function ImageLightbox({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  const [z, setZ] = useState(1);
  const [t, setT] = useState({ x: 0, y: 0 });
  const [actual, setActual] = useState(1); // the zoom at which one image pixel = one screen pixel
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { setZ(1); setT({ x: 0, y: 0 }); }, [src]);
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);
  if (!src) return null;

  const max = Math.max(8, actual * 4);
  // Zoom to `next`, keeping the image point under (cx, cy) -- viewport coords -- where it is.
  const zoomTo = (next: number, cx = window.innerWidth / 2, cy = window.innerHeight / 2) => {
    const n = Math.min(max, Math.max(MIN, next));
    if (n === MIN) { setZ(MIN); setT({ x: 0, y: 0 }); return; }
    const px = cx - window.innerWidth / 2;
    const py = cy - window.innerHeight / 2;
    setT((o) => ({ x: px - (n / z) * (px - o.x), y: py - (n / z) * (py - o.y) }));
    setZ(n);
  };
  const button = { fontSize: 13, padding: "4px 10px" };
  // The scrim is black in every theme, so its text is white in every theme (no theme token fits a fixed scrim).
  const ON_SCRIM = "rgb(255 255 255)";

  return (
    <div role="dialog" aria-label="放大檢視" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onWheel={(e) => zoomTo(e.deltaY < 0 ? z * STEP : z / STEP, e.clientX, e.clientY)}
      style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", touchAction: "none" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src={src} alt={alt ?? "放大檢視"} draggable={false}
        onLoad={(e) => { const el = e.currentTarget; if (el.clientWidth) setActual(el.naturalWidth / el.clientWidth); }}
        onDoubleClick={(e) => zoomTo(z === MIN ? Math.max(2, actual) : MIN, e.clientX, e.clientY)}
        onPointerDown={(e) => { if (z > MIN) { drag.current = { x: e.clientX - t.x, y: e.clientY - t.y }; e.currentTarget.setPointerCapture?.(e.pointerId); } }}
        onPointerMove={(e) => { const d = drag.current; if (d) { setT({ x: e.clientX - d.x, y: e.clientY - d.y }); } }}
        onPointerUp={() => { drag.current = null; }}
        style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          transform: `translate(${t.x}px, ${t.y}px) scale(${z})`, cursor: z > MIN ? "grab" : "zoom-in", userSelect: "none" }} />
      <div style={{ position: "fixed", top: 12, right: 16, display: "flex", gap: 6, alignItems: "center" }}>
        <span aria-label="放大倍率" style={{ color: ON_SCRIM, fontSize: 13, minWidth: 52, textAlign: "right" }}>{Math.round((z / actual) * 100)}%</span>
        <button type="button" className="btn-secondary" style={button} aria-label="縮小" onClick={() => zoomTo(z / STEP)}>－</button>
        <button type="button" className="btn-secondary" style={button} aria-label="放大" onClick={() => zoomTo(z * STEP)}>＋</button>
        <button type="button" className="btn-secondary" style={button} onClick={() => zoomTo(actual)}>1:1</button>
        <button type="button" className="btn-secondary" style={button} onClick={() => zoomTo(MIN)}>符合畫面</button>
        <button type="button" className="btn-secondary" style={button} aria-label="關閉" onClick={onClose}>✕</button>
      </div>
      <div style={{ position: "fixed", bottom: 12, left: 0, right: 0, textAlign: "center", color: ON_SCRIM, fontSize: 12, opacity: 0.7, pointerEvents: "none" }}>
        滾輪縮放・雙擊放大・放大後拖曳移動・Esc 或點黑色背景關閉
      </div>
    </div>
  );
}
