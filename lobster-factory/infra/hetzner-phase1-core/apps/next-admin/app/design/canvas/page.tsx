"use client";

// design.<base domain>/canvas: the Fabric editor as at /tools/canvas (ssr:false: Fabric touches window/document).
import dynamic from "next/dynamic";

const CanvasEditor = dynamic(() => import("../../(shell)/tools/canvas/CanvasEditor"), {
  ssr: false,
  loading: () => <p style={{ padding: 16, opacity: 0.6 }}>載入編輯器…</p>,
});

export default function DesignCanvasPage() {
  return <CanvasEditor />;
}
