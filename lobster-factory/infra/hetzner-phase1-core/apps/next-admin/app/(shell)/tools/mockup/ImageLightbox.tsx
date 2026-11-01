"use client";
// Full-size view of one image over the page: click anywhere or press Esc to close.
import { useEffect } from "react";

export default function ImageLightbox({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);
  if (!src) return null;
  return (
    <div role="dialog" aria-label="放大檢視" onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt ?? "放大檢視"} style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 6, boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }} />
      <div style={{ position: "fixed", top: 12, right: 16, color: "#fff", fontSize: 13, opacity: 0.8 }}>點任何地方或按 Esc 關閉</div>
    </div>
  );
}
