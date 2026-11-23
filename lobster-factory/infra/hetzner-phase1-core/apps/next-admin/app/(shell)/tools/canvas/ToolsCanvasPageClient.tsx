"use client";

/**
 * /tools/canvas [1-h] — host page for the Fabric.js quick editor.
 *
 * ssr:false because Fabric touches window/document; the editor reads its source image
 * from sessionStorage (set by OutputTrackBar's ✏️ 快速編輯), so no searchParams here.
 */
import dynamic from "next/dynamic";

const CanvasEditor = dynamic(() => import("./CanvasEditor"), {
  ssr: false,
  loading: () => <p style={{ padding: 16, opacity: 0.6 }}>載入編輯器…</p>,
});

export default function CanvasPage() {
  return <CanvasEditor />;
}
