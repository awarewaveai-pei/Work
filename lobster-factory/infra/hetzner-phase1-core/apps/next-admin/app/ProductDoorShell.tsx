// The frame every product door renders in (ADR 018 §2): no staff sidebar, the registry's door.nav menu for a multi-page
// product, the product's own app, a sign-out foot. Each app/<door.page>/layout.tsx wraps its children in this with its
// product key; staff open the same app inside the (shell) layout. A customer whose account does not hold the product
// gets only the "not enabled" page (lib/portal/door-access.ts).
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PRODUCTS, type ProductKey } from "@/lib/portal/products";
import { portalHost } from "@/lib/portal/hosts";
import { doorAccess } from "@/lib/portal/door-access";
import { DoorProvider } from "./DoorContext";
import { DoorNav } from "./DoorNav";
import { LogoutButton } from "./LogoutButton";

export async function ProductDoorShell({ productKey, children }: { productKey: ProductKey; children: ReactNode }) {
  const product = PRODUCTS.find((p) => p.key === productKey);
  const door = product?.door;
  if (door?.app !== "next-admin") throw new Error(`${productKey}: no next-admin door`);
  const access = await doorAccess(await headers(), productKey);
  if (access !== "open") {
    return (
      <div className="shell">
        <div className="door-main"><div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
          {access === "not_held" ? (
            <>
              <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>「{product!.name}」尚未開通</h1>
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 20 }}>這是加購的產品，每個功能要分開購買，或由我們贈送後才能使用。</p>
              <a href={`https://${portalHost()}/launcher`} className="btn-primary">回到我的產品</a>
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--badge-red-text)" }}>暫時無法確認開通狀態，請重新整理頁面再試一次。</p>
          )}
          <div className="door-foot"><LogoutButton /></div>
        </div></div>
      </div>
    );
  }
  return (
    <div className="shell">
      <div className="door-main">
        <DoorProvider nav={door.nav ?? []}>
          <DoorNav page={door.page} name={product!.name} features={product!.features.map((f) => ({ key: f.feature_key, name: f.name }))} />
          <div className="door-content">
            {children}
            <div className="door-foot"><LogoutButton /></div>
          </div>
        </DoorProvider>
      </div>
    </div>
  );
}
