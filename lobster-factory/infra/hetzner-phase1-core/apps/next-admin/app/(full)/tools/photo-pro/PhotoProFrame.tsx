import { ProEditorFrame } from "@/components/tools/ProEditorFrame";

// PhotoCraft's web build is static files nginx serves at /photo-pro/ (agency-os/handoffs/2026-11-05-photocraft-pro/R0-PLAN.md
// C2; locally next.config.ts rewrites it to PHOTO_PRO_DEV_ORIGIN). ?host=parent turns on its page-host channel (C1.3).
// NEXT_PUBLIC_* is baked in at build time.
const FRAME_SRC = process.env.NEXT_PUBLIC_PHOTO_PRO_PATH || "/photo-pro/current/index.html?host=parent";

/** /tools/photo-pro and the design door's /design/canvas (R0-PLAN C3.1, C7.1). */
export function PhotoProFrame() {
  return (
    <ProEditorFrame
      editor="photocraft"
      frameSrc={FRAME_SRC}
      dockSrc="/photo-pro-dock/dock.js"
      dockId="photo-pro-dock"
      fallback={{ href: "/tools/canvas", label: "Canvas 編輯器" }}
      title="畫布（專業版）"
      product="PhotoCraft"
    />
  );
}
