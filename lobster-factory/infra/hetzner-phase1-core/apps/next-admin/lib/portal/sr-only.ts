import type { CSSProperties } from "react";
// A heading read by screen readers and the page-name check (lib/portal/__tests__/page-names.test.ts) that takes no room on screen:
// door pages whose shared component draws no <h1> of its own put this one first, with the door menu's name.
export const SR_ONLY: CSSProperties = { position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };
