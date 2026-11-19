// The video product's own door (ADR 018 §2): middleware.ts serves video.<base domain> under /video and answers /video
// nowhere else. Its pages: handoff (staff 開啟影音工作台 lands here) and release (old links); / itself is the workbench.
import type { ReactNode } from "react";
import { ProductDoorShell } from "../../ProductDoorShell";

export default function VideoDoorLayout({ children }: { children: ReactNode }) {
  return <ProductDoorShell productKey="video">{children}</ProductDoorShell>;
}
