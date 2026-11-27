import { headers } from "next/headers";
import { requireClientOrg, PortalAccessError } from "@/lib/tenant-guard";
import { PRODUCTS } from "@/lib/portal/products";
import { servedNextAdminProducts } from "@/lib/portal/doors";
import { shopUrl } from "@/lib/portal/hosts";
import { doorHref } from "@/lib/portal/door-href";
import { heldDoors } from "@/lib/portal/held-doors";
import { LogoutButton } from "@/app/LogoutButton";
import { rightLabel, type RightLabel } from "@/lib/entitlements/right-label";
import { ToolCard } from "@/components/portal/ToolCard";
import { billingAccount, createEntitlementStore } from "@/lib/entitlements/tables";
import { heldRightInput } from "@/lib/entitlements/product-right";
import type { NextAdminProduct } from "@/lib/portal/doors";
import { CreditsLine } from "./CreditsLine";
import { DoorForm, ResumeSection, loadResume } from "./ResumeSection";
import { RecentSection, loadRecent } from "./RecentSection";

export const dynamic = "force-dynamic";

// Reached as portal.aware-wave.com/launcher, rewritten by nginx to /portal/launcher. Gated by
// the EXISTING middleware.ts session gate (an unauthenticated visitor never reaches this
// component, they hit /login). requireClientOrg() below is the SECOND, portal-specific gate:
// it fails closed if the authenticated identity isn't a bound client (e.g. a staff member's
// session) -- see PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §9 RISK 3.

// A card's state comes from the doors themselves (heldDoors = the check each door makes), never from the registry's sales
// `status` or the legacy organization_product_subscriptions table: both said "coming soon" for every product while doors
// were open (2026-10-30), so the not-enabled page's "回到我的產品" led to a dead end.
async function getHeld(organizationId: string): Promise<{ held: Set<string>; failed: boolean }> {
  try {
    return { held: new Set((await heldDoors(organizationId)).map((p) => p.key)), failed: false };
  } catch (error) {
    console.error("[portal/launcher] entitlement read failed", { organizationId, error: error instanceof Error ? error.message : String(error) });
    return { held: new Set(), failed: true };
  }
}

// The held products' rights, read once (billing account + one list of live rows) and worded by rightLabel(); a failed read
// returns no entry, so the card shows no badge rather than a guess.
async function getRights(organizationId: string, held: readonly NextAdminProduct[]): Promise<Map<string, RightLabel>> {
  const out = new Map<string, RightLabel>();
  if (held.length === 0) return out;
  try {
    const now = Math.floor(Date.now() / 1000);
    const account = await billingAccount(organizationId);
    if (!account) return out;
    const records = await createEntitlementStore().listActiveEntitlements({ organizationId, productKeys: held.map((p) => p.key), now });
    for (const p of held) out.set(p.key, rightLabel({ ...heldRightInput(p, account, records, { organizationId, now }).input, viewer: "member" }));
  } catch (error) {
    console.error("[portal/launcher] right read failed", { organizationId, error: error instanceof Error ? error.message : String(error) });
  }
  return out;
}

// ?door=<code> from POST /portal/api/door (app/portal/api/door/route.ts): why 開啟 / 我的作品 did not open the door
const DOOR_NOTICE: Record<string, string> = {
  product_not_held: "尚未開通這個產品",
  email_unverified: "請先完成 email 確認再進入",
};
const DOOR_NOTICE_DEFAULT = "暫時無法進入，請稍後再試";

function AccessDenied() {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>需要客戶帳號登入</h1>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 16 }}>
        這個頁面只開放給 AwareWave 客戶帳號。若你是內部同仁，請使用 app.aware-wave.com。
      </p>
      <a href="/login" className="btn-primary">前往客戶登入</a>
    </div>
  );
}

// every badge and sentence is rightLabel()'s; the caller only drops a caption that would lead nowhere on this very page
// (S1's 「回到我的工作台」 / S12's 「重新整理」, which the page-level button already is)
const quiet = (r: RightLabel): RightLabel => ({ ...r, action: null });
const GRID = { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", listStyle: "none", padding: 0, margin: "0 0 28px" } as const;
const H2 = { fontSize: 15, fontWeight: 700, margin: "0 0 12px" } as const;

export default async function PortalLauncherPage({ searchParams }: { searchParams: Promise<{ door?: string }> }) {
  let orgId: string;
  const h = await headers();
  try {
    ({ orgId } = requireClientOrg({ headers: h }));
  } catch (e) {
    if (e instanceof PortalAccessError) return <AccessDenied />;
    throw e;
  }

  const { door } = await searchParams;
  const { held, failed } = await getHeld(orgId);
  const served = new Set(servedNextAdminProducts().map((p) => p.key));
  const now = new Date();

  const heldProducts = servedNextAdminProducts().filter((p) => held.has(p.key));
  const rights = failed ? new Map<string, RightLabel>() : await getRights(orgId, heldProducts);
  const resume = failed ? [] : await loadResume(orgId, held);
  // the person's own use only: the user id is middleware's header (stripped from requests, middleware.ts), never a request value
  const recent = failed ? { recent: [], frequent: [] } : await loadRecent(orgId, h.get("x-ops-user-id")?.trim() ?? "", held);
  const label = ({ key, name }: (typeof PRODUCTS)[number]): RightLabel => {
    const known = rights.get(key);
    if (known) return quiet(known);
    const door = failed ? "unavailable" : held.has(key) ? "open" : "not_held";
    return quiet(rightLabel({ entry: null, source: null, door, comingSoon: !served.has(key), viewer: "member", mode: "enforce", productName: name }));
  };
  const open = failed ? [] : PRODUCTS.filter((p) => held.has(p.key));
  const rest = PRODUCTS.filter((p) => !open.includes(p));   // heldDoors returns served doors only, so a held product is always served

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>我的工作台</h1>
      {door && (
        <p style={{ fontSize: 13.5, color: "var(--badge-red-text)", marginBottom: 8 }}>
          {Object.prototype.hasOwnProperty.call(DOOR_NOTICE, door) ? DOOR_NOTICE[door] : DOOR_NOTICE_DEFAULT}
        </p>
      )}
      <CreditsLine />
      {/* the unit's newest works and drafts; orgId is requireClientOrg's, never a request value (card U17) */}
      {!failed && <ResumeSection items={resume} />}
      {/* 最近使用／常用: this person's own entitlement.usage rows, never a colleague's (card U24) */}
      {!failed && <RecentSection data={recent} />}
      {failed && (
        <div style={{ margin: "0 0 24px" }}>
          <p style={{ fontSize: 13.5, color: "var(--badge-red-text)", margin: "0 0 8px" }}>讀取產品清單時發生錯誤，請重新整理頁面再試一次。</p>
          <a href="/portal/launcher" className="btn-primary">重新整理</a>
        </div>
      )}
      {!failed && open.length === 0 && (
        <div className="card" style={{ margin: "0 0 28px" }}>
          <p style={{ fontWeight: 600, margin: "0 0 8px" }}>還沒有開通的產品</p>
          <a href={shopUrl()} className="btn-primary">了解產品</a>
        </div>
      )}
      {open.length > 0 && (
        <section aria-label="我的產品">
          <h2 style={H2}>我的產品（{open.length}）</h2>
          <ul style={GRID}>
            {open.map((product) => {
              // the door page showing the shared works library; the design door IS that page, so 開啟 already goes there
              const works = product.door.app === "next-admin" ? doorHref(product.door.nav ?? [], "/tools/designs") : null;
              const worksPath = works && works !== "/" ? works : null;
              return (
                <li key={product.key} data-product={product.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <ToolCard name={product.name} catalog={product.catalog} right={label(product)} href={null} now={now} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <DoorForm productKey={product.key} label="開啟" />
                    {worksPath && <DoorForm productKey={product.key} next={worksPath} label="我的作品" />}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {rest.length > 0 && (
        <section aria-label="還沒開通">
          <h2 style={H2}>還沒開通（{rest.length}）</h2>
          <ul style={GRID}>
            {rest.map((product) => (
              <li key={product.key} data-product={product.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ToolCard name={product.name} catalog={product.catalog} right={label(product)} href={null} now={now} />
                {served.has(product.key) && !failed && <div><a href={shopUrl()} className="btn-primary">去了解</a></div>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* the portal has no other sign-out: a shared computer must be able to change account (critic 2026-10-30) */}
      <div className="door-foot"><LogoutButton variant="page" /></div>
    </div>
  );
}
