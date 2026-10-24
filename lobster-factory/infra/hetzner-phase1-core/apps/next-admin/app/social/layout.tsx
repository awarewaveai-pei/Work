// The social product's own door (ADR 018 §2): middleware.ts serves social.<base domain> under /social and answers
// /social nowhere else. Staff use the same app at /tools/social.
import type { ReactNode } from "react";
import { ProductDoorShell } from "../ProductDoorShell";

export default function SocialDoorLayout({ children }: { children: ReactNode }) {
  return <ProductDoorShell productKey="social">{children}</ProductDoorShell>;
}
