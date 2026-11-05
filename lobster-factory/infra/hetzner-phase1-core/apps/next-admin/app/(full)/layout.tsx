import type { ReactNode } from "react";

// Full-window staff pages: no sidebar (operator 2026-11-05: the VectorCraft editor is too small beside it). Login and
// staff tool grants are still middleware.ts's (its matcher covers every path here); the sidebar opens these in a new tab.
export default function FullWindowLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
