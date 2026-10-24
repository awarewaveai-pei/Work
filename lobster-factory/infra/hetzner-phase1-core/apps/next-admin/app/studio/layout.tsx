// The studio product's own door (ADR 018 §2): middleware.ts serves studio.<base domain> under /studio and answers
// /studio nowhere else. Staff use the same workbench at /tools/studio.
import type { ReactNode } from "react";
import { ProductDoorShell } from "../ProductDoorShell";

export default function StudioDoorLayout({ children }: { children: ReactNode }) {
  return <ProductDoorShell productKey="studio">{children}</ProductDoorShell>;
}
