// The social product's own door (ADR 018 §2): middleware.ts serves social.<base domain> under /social and answers
// /social nowhere else. No staff sidebar: a customer sees this product only. Staff use the same app at /tools/social.
import type { ReactNode } from "react";
import { LogoutButton } from "../LogoutButton";

export default function SocialDoorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <div className="door-main">
        {children}
        <div className="door-foot"><LogoutButton /></div>
      </div>
    </div>
  );
}
