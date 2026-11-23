// The one frame (blueprint §9.1, CLIENT-CONTEXT-PLAN K5): the staff console (app/(shell)/layout.tsx) and every product door
// (app/ProductDoorShell.tsx) render in it. Server side it works out the current-client inputs once -- the session's
// client org, the host's (white-label, not built: null), the internal org, the product hosts -- and hands them to
// ClientContextProvider (ADR 020); the browser never reads env or imports lib/portal/hosts. The client rail
// (app/ClientRail.tsx) draws only on a page that registers a layer, so a page that does not looks as before.
// Markup and classes are the two frames' own (.shell/.sidebar/.main, .door-main/.door-side/.door-content).
import { BlockedShown } from "@/components/portal/BlockedShown";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { PRODUCTS, type ProductKey } from "@/lib/portal/products";
import { baseDomain, portalHost, productHost, staffHosts } from "@/lib/portal/hosts";
import { doorAccess } from "@/lib/portal/door-access";
import { resolveTenant } from "@/lib/tenant-guard";
import type { SavedLayout } from "@/lib/theme/tokens";
import { DoorProvider } from "./DoorContext";
import { NavRail } from "./NavRail";
import { LogoutButton } from "./LogoutButton";
import { ClientContextProvider } from "./ClientContextProvider";
import { ClientRail } from "./ClientRail";
import { STAFF_HOST_KEY } from "@/lib/client-context/use-client-context";


/** Every next-admin door's https origin plus the staff console's, from config (never written out in code). */
export function frameHosts(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const hosts: Record<string, string> = {};
  for (const p of PRODUCTS) if (p.door.app === "next-admin" && p.door.enabled !== false) hosts[p.key] = `https://${productHost(p, env)}`;
  const staff = staffHosts(env)[0];
  if (staff) hosts[STAFF_HOST_KEY] = `https://${staff}`;
  return hosts;
}

/** The product's intro page on the WordPress site (catalog.intro is its slug); null when the registry has none, so the
 *  not-enabled page draws no button rather than one that ends on a 404 (blueprint S1, U9). */
export function introUrl(intro: string | undefined, env: Record<string, string | undefined> = process.env): string | null {
  const slug = (intro ?? "").trim().replace(/^\/+|\/+$/g, "");
  return slug ? `https://${baseDomain(env)}/${slug}/` : null;
}

/** The sites list API (ADR 020 §2.1). Not called here: a door is handed it only when its registered door.api covers it
 *  (a door calls only its own APIs, lib/portal/__tests__/registry-code.test.ts); otherwise that door has no site layer. */
const SITES_API = "/api/content/sites";
export function doorSitesPath(api: readonly string[]): string | null {
  return api.some((a) => a === SITES_API || SITES_API.startsWith(`${a}/`)) ? SITES_API : null;
}

/** ClientContextProvider's server-side inputs (ADR 020 §2.1). Plain props, not an async child, so the frame stays
 *  renderable by renderToStaticMarkup after `await PlatformFrame(...)`. internalOrgId and sitesPath come from the
 *  caller: the staff layout reads the internal org (service-role, never in a door's graph); a door passes null. */
function contextProps(h: Headers, onDoor: boolean, internalOrgId: string | null, sitesPath: string | null) {
  const tenant = resolveTenant({ headers: h });
  return {
    sessionOrg: tenant.userKind === "client" ? tenant.orgId : null,
    hostOrg: null,
    internalOrgId,
    sitesPath,
    hosts: frameHosts(),
    onDoor,
  };
}

export type PlatformFrameProps =
  | {
      kind: "staff";
      /** Saved sidebar order (DB) and the restricted staff member's visible hrefs (null = all); from app/(shell)/layout.tsx. */
      navLayout: SavedLayout | null;
      /** The internal org (「AwareWave 自己」) and the sites API, from app/(shell)/layout.tsx. */
      internalOrgId: string | null;
      sitesPath: string | null;
      visible: string[] | null;
      /** Staff-only pieces built by the staff layout, kept out of the doors' import graph. */
      inboxBadge: ReactNode;
      footTop: ReactNode;
      notice: ReactNode;
      children: ReactNode;
    }
  | { kind: "door"; productKey: ProductKey; bare?: boolean; children: ReactNode };

export async function PlatformFrame(props: PlatformFrameProps) {
  return props.kind === "staff" ? StaffFrame(props) : DoorFrame(props);
}

async function StaffFrame({ navLayout, internalOrgId, sitesPath, visible, inboxBadge, footTop, notice, children }: Extract<PlatformFrameProps, { kind: "staff" }>) {
  const h = await headers();

  return (
    <ClientContextProvider {...contextProps(h, false, internalOrgId, sitesPath)}>
      <div className="shell">
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-mark">L</div>
            <div>
              <div className="sidebar-logo-text">Lobster Factory</div>
              <div className="sidebar-logo-sub">Admin Console</div>
            </div>
          </div>

          <NavRail kind="staff" initialLayout={navLayout} visible={visible} inboxBadge={inboxBadge} />

          {/* Wrapper takes the footer's margin-top:auto so the button sits right above it, not mid-sidebar. */}
          <div style={{ marginTop: "auto" }}>
            {footTop}
            <div className="sidebar-footer">
              aware-wave.com
              <LogoutButton />
            </div>
          </div>
        </nav>

        <div className="main">
          {/* The rail lives inside .main: .sidebar is position:fixed and .main only steps aside by its width, so a rail
              placed beside .main in .shell lay under the sidebar. Always this row, so registering a layer never remounts the page. */}
          <div style={{ display: "flex", flex: 1 }}>
            <ClientRail />
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              {notice}
              {children}
            </div>
          </div>
        </div>
      </div>
    </ClientContextProvider>
  );
}

// A product door (ADR 018 §2): no staff sidebar, the registry's door.nav menu for a multi-page product, the product's own
// app, a sign-out foot. A customer whose account does not hold the product gets only the "not enabled" page
// (lib/portal/door-access.ts). bare: a page the product's own UI frames (the video workbench shell, app/video/(wb)) --
// same access check, no menu, no client rail and no sign-out foot (the framing UI has both).
async function DoorFrame({ productKey, bare = false, children }: { productKey: ProductKey; bare?: boolean; children: ReactNode }) {
  const product = PRODUCTS.find((p) => p.key === productKey);
  const door = product?.door;
  if (door?.app !== "next-admin") throw new Error(`${productKey}: no next-admin door`);
  const h = await headers();
  const access = await doorAccess(h, productKey);
  const intro = introUrl(product!.catalog.intro);
  if (access !== "open") {
    return (
      <div className="shell">
        <div className="door-main"><div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
          <BlockedShown state={access === "not_held" ? "not_held" : "unavailable"} surface="door" product_key={productKey} />
          {access === "not_held" ? (
            <>
              <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>「{product!.name}」尚未開通</h1>
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 20 }}>這是加購的產品，每個功能要分開購買，或由我們贈送後才能使用。</p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {intro && <a href={intro} className="btn-primary">了解這個產品</a>}
                <a href={`https://${portalHost()}/launcher`} className={intro ? "btn-secondary" : "btn-primary"}>回到我的產品</a>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--badge-red-text)" }}>暫時無法確認開通狀態，請重新整理頁面再試一次。</p>
          )}
          <div className="door-foot"><LogoutButton variant="page" /></div>
        </div></div>
      </div>
    );
  }
  return (
    <ClientContextProvider {...contextProps(h, true, null, doorSitesPath(door.api))}>
      <div className="shell">
        <div className="door-main">
          <DoorProvider nav={door.nav ?? []}>
            {!bare && <NavRail kind="door" page={door.page} name={product!.name} />}
            {!bare && <ClientRail />}
            <div className="door-content">
              {children}
              {!bare && <div className="door-foot"><LogoutButton variant="page" /></div>}
            </div>
          </DoorProvider>
        </div>
      </div>
    </ClientContextProvider>
  );
}
