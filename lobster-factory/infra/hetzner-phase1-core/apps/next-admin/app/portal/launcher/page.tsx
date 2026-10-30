import { headers } from "next/headers";
import { requireClientOrg, PortalAccessError } from "@/lib/tenant-guard";
import { PRODUCTS } from "@/lib/portal/products";
import { servedNextAdminProducts } from "@/lib/portal/doors";
import { shopUrl } from "@/lib/portal/hosts";
import { doorHref } from "@/lib/portal/door-href";
import { heldDoors } from "@/lib/portal/held-doors";
import { LogoutButton } from "@/app/LogoutButton";

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

// ?door=<code> from POST /portal/api/door (app/portal/api/door/route.ts): why 開啟 / 我的作品 did not open the door
const DOOR_NOTICE: Record<string, string> = {
  product_not_held: "尚未開通這個產品",
  email_unverified: "請先完成 email 確認再進入",
};
const DOOR_NOTICE_DEFAULT = "暫時無法進入，請稍後再試";

function DoorForm({ productKey, next, label }: { productKey: string; next?: string; label: string }) {
  return (
    <form method="post" action="/portal/api/door">
      <input type="hidden" name="product_key" value={productKey} />
      {next && <input type="hidden" name="next" value={next} />}
      <button className="btn-primary">{label}</button>
    </form>
  );
}

function AccessDenied() {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>需要客戶帳號登入</h1>
      <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 16 }}>
        這個頁面只開放給 AwareWave 客戶帳號。若妳是內部同仁，請使用 app.aware-wave.com。
      </p>
      <a href="/login" className="btn-primary">前往客戶登入</a>
    </div>
  );
}

export default async function PortalLauncherPage({ searchParams }: { searchParams: Promise<{ door?: string }> }) {
  let orgId: string;
  try {
    ({ orgId } = requireClientOrg({ headers: await headers() }));
  } catch (e) {
    if (e instanceof PortalAccessError) return <AccessDenied />;
    throw e;
  }

  const { door } = await searchParams;
  const { held, failed } = await getHeld(orgId);
  const served = new Set(servedNextAdminProducts().map((p) => p.key));

  return (
    <div style={{ maxWidth: 720, margin: "60px auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>妳的產品</h1>
      {door && (
        <p style={{ fontSize: 13.5, color: "var(--badge-red-text)", marginBottom: 8 }}>
          {Object.prototype.hasOwnProperty.call(DOOR_NOTICE, door) ? DOOR_NOTICE[door] : DOOR_NOTICE_DEFAULT}
        </p>
      )}
      {failed ? (
        <p style={{ fontSize: 13.5, color: "var(--badge-red-text)", marginBottom: 24 }}>
          讀取產品清單時發生錯誤，請重新整理頁面再試一次。
        </p>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 24 }}>
          選擇要開啟的產品。還沒買的產品可按「去了解」，還在準備的標示「即將推出」。
        </p>
      )}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {PRODUCTS.map((product) => {
          const isOpen = held.has(product.key); // heldDoors returns served doors only
          const label = isOpen ? "已開通" : served.has(product.key) ? "尚未開通" : "即將推出";
          // the door page showing the shared works library; the design door IS that page, so 開啟 already goes there
          const works = isOpen && product.door.app === "next-admin" ? doorHref(product.door.nav ?? [], "/tools/designs") : null;
          const worksPath = works && works !== "/" ? works : null;
          return (
            <div key={product.key} className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{product.name}</h2>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>{failed ? "—" : label}</p>
              {isOpen ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <DoorForm productKey={product.key} label="開啟" />
                  {worksPath && <DoorForm productKey={product.key} next={worksPath} label="我的作品" />}
                </div>
              ) : served.has(product.key) && !failed ? (
                <a href={shopUrl()} className="btn-primary">去了解</a>
              ) : (
                <button className="btn-primary" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                  {failed ? "無法確認" : label}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {/* the portal has no other sign-out: a shared computer must be able to change account (critic 2026-10-30) */}
      <div className="door-foot"><LogoutButton /></div>
    </div>
  );
}
