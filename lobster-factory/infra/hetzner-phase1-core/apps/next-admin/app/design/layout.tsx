// The design product's own door (ADR 018 §2): middleware.ts serves design.<base domain> under /design and answers
// /design nowhere else; its pages are the registry's door.nav. Staff use the same tools under /tools/*.
import type { ReactNode } from "react";
import { ProductDoorShell } from "../ProductDoorShell";

export default function DesignDoorLayout({ children }: { children: ReactNode }) {
  return <ProductDoorShell productKey="design">{children}</ProductDoorShell>;
}
