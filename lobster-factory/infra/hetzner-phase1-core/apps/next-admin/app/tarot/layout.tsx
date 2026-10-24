// The tarot product's own door (ADR 018 §2): middleware.ts serves tarot.<base domain> under /tarot and answers
// /tarot nowhere else. Staff use the same studio at /tools/tarot.
import type { ReactNode } from "react";
import { ProductDoorShell } from "../ProductDoorShell";

export default function TarotDoorLayout({ children }: { children: ReactNode }) {
  return <ProductDoorShell productKey="tarot">{children}</ProductDoorShell>;
}
