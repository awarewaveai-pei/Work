// The video product's own door (ADR 018 §2): middleware.ts serves video.<base domain> under /video and answers /video
// nowhere else. Staff use the same pipeline at /tools/video.
import type { ReactNode } from "react";
import { ProductDoorShell } from "../ProductDoorShell";

export default function VideoDoorLayout({ children }: { children: ReactNode }) {
  return <ProductDoorShell productKey="video">{children}</ProductDoorShell>;
}
