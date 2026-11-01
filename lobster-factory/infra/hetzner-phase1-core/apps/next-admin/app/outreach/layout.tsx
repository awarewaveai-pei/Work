// The outreach product's own door (ADR 018 §2): middleware.ts serves outreach.<base domain> under /outreach and answers
// /outreach nowhere else; its pages are the registry's door.nav. Staff use the same tools under /tools/outreach, with the
// client switcher; on the door the organization is the signed-in customer's own (tenant-guard effectiveOrgId).
import { Suspense, type ReactNode } from "react";
import { ProductDoorShell } from "../ProductDoorShell";

export default function OutreachDoorLayout({ children }: { children: ReactNode }) {
  return <ProductDoorShell productKey="outreach"><Suspense fallback={null}>{children}</Suspense></ProductDoorShell>;
}
