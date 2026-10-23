// The frame every product door renders in (ADR 018 §2): no staff sidebar, the product's own app, a sign-out foot.
// Each app/<door.page>/layout.tsx wraps its children in this; staff open the same app inside the (shell) layout.
import type { ReactNode } from "react";
import { DoorProvider } from "./DoorContext";
import { LogoutButton } from "./LogoutButton";

export function ProductDoorShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <div className="door-main">
        <DoorProvider>{children}</DoorProvider>
        <div className="door-foot"><LogoutButton /></div>
      </div>
    </div>
  );
}
