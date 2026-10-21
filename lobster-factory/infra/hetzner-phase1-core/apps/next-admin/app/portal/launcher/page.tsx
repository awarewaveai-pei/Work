import { headers } from "next/headers";
import { requireClientOrg, PortalAccessError } from "@/lib/tenant-guard";
import { PRODUCTS } from "@/lib/portal/products";
import { productHost } from "@/lib/portal/doors";
import { createEntitlementStore } from "@/lib/entitlements/tables";

export const dynamic = "force-dynamic";

// Reached as portal.aware-wave.com/launcher, rewritten by nginx to /portal/launcher. Gated by
// the EXISTING middleware.ts session gate (an unauthenticated visitor never reaches this
// component, they hit /login). requireClientOrg() below is the SECOND, portal-specific gate:
// it fails closed if the authenticated identity isn't a bound client (e.g. a staff member's
// session) -- see PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §9 RISK 3.

async function getSubscriptionStatus(organizationId: string): Promise<{ byProduct: Map<string, string>; failed: boolean }> {
  try {
    // requireClientOrg() above is the user/session and client-org boundary. The table itself
    // is service-role-only after ADR017/0110, so all subscription reads go through this wrapper.
    const byProduct = await createEntitlementStore().getSubscriptionStatuses(organizationId);
    return { byProduct, failed: false };
  } catch (error) {
    console.error("[portal/launcher] subscription read failed", { organizationId, error: error instanceof Error ? error.message : String(error) });
    return { byProduct: new Map(), failed: true };
  }
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

export default async function PortalLauncherPage() {
  let orgId: string;
  try {
    ({ orgId } = requireClientOrg({ headers: await headers() }));
  } catch (e) {
    if (e instanceof PortalAccessError) return <AccessDenied />;
    throw e;
  }

  const { byProduct, failed } = await getSubscriptionStatus(orgId);

  return (
    <div style={{ maxWidth: 720, margin: "60px auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>妳的產品</h1>
      {failed ? (
        <p style={{ fontSize: 13.5, color: "var(--badge-red-text)", marginBottom: 24 }}>
          讀取產品清單時發生錯誤，請重新整理頁面再試一次。
        </p>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", marginBottom: 24 }}>
          選擇要開啟的產品。尚未開通的產品會標示「即將推出」。
        </p>
      )}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {PRODUCTS.map((product) => {
          const subStatus = byProduct.get(product.key);
          // "coming_soon" from the registry means the product has no provisioning API yet --
          // this overrides subStatus even if a subscription row exists (V1 boundary, see
          // PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §5 "不做": never fake a provisioned state).
          // A trial opens the product like a paid plan; the expiry sweep turns it canceled when its grants end.
          const isTrial = subStatus === "trial";
          const isReady = product.status !== "coming_soon" && (subStatus === "active" || isTrial);
          return (
            <div key={product.key} className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{product.name}</h2>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
                {isReady ? (isTrial ? "試用中" : "已開通") : "即將推出"}
              </p>
              {isReady ? (
                <a href={`https://${productHost(product)}`} className="btn-primary">開啟</a>
              ) : (
                <button className="btn-primary" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                  即將推出
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
