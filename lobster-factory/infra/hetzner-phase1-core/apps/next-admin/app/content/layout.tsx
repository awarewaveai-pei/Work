// The content product's own door (ADR 018 §2): middleware.ts serves content.<base domain> under /content and answers
// /content nowhere else; its pages are the registry's door.nav. Staff use the same tools under /tools/content, /tools/events.
import type { ReactNode } from "react";
import { ProductDoorShell } from "../ProductDoorShell";

export default function ContentDoorLayout({ children }: { children: ReactNode }) {
  return <ProductDoorShell productKey="content">{children}</ProductDoorShell>;
}
