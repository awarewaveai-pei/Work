import { ProEditorFrame } from "@/components/tools/ProEditorFrame";

// VectorCraft's web build is static files nginx serves at /vector-pro/ (R0-PLAN C2; locally next.config.ts rewrites
// it to VECTOR_PRO_DEV_ORIGIN). NEXT_PUBLIC_* is baked in at build time.
const FRAME_SRC = process.env.NEXT_PUBLIC_VECTOR_PRO_PATH || "/vector-pro/current/index.html?lang=zh-hant";

/** /tools/vector-pro and the design door's /design/pro. */
export function VectorProFrame() {
  return (
    <ProEditorFrame
      editor="vectorcraft"
      frameSrc={FRAME_SRC}
      dockSrc="/vector-pro-dock/dock.js"
      dockId="vector-pro-dock"
      fallback={{ href: "/tools/canvas", label: "Canvas 編輯器" }}
      title="向量（專業版）"
      product="VectorCraft"
    />
  );
}
