// The frame every product door renders in (ADR 018 §2): no staff sidebar, the registry's door.nav menu for a multi-page
// product, the product's own app, a sign-out foot. Each app/<door.page>/layout.tsx wraps its children in this with its
// product key; staff open the same app inside the (shell) layout.
import type { ReactNode } from "react";
import { PRODUCTS, type ProductKey } from "@/lib/portal/products";
import { DoorProvider } from "./DoorContext";
import { DoorNav } from "./DoorNav";
import { LogoutButton } from "./LogoutButton";

export function ProductDoorShell({ productKey, children }: { productKey: ProductKey; children: ReactNode }) {
  const door = PRODUCTS.find((p) => p.key === productKey)?.door;
  if (door?.app !== "next-admin") throw new Error(`${productKey}: no next-admin door`);
  return (
    <div className="shell">
      <div className="door-main">
        <DoorProvider nav={door.nav ?? []}>
          <DoorNav page={door.page} />
          {children}
        </DoorProvider>
        <div className="door-foot"><LogoutButton /></div>
      </div>
    </div>
  );
}
