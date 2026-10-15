import { headers } from "next/headers";
import { requireClientOrg, PortalAccessError } from "@/lib/tenant-guard";
import { createSupabaseUserClient } from "@/lib/supabase/route-client";
import { PRODUCTS } from "@/lib/portal/products";
import { productHost } from "@/lib/portal/doors";

export const dynamic = "force-dynamic";

// Reached as portal.aware-wave.com/launcher, rewritten by nginx to /portal/launcher. Gated by
// the EXISTING middleware.ts session gate (an unauthenticated visitor never reaches this
// component, they hit /login). requireClientOrg() below is the SECOND, portal-specific gate:
// it fails closed if the authenticated identity isn't a bound client (e.g. a staff member's
// session) -- see PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §9 RISK 3.

type SubscriptionQuery = { data: { product_key: string; status: string }[] | null; error: { message: string } | null };

async function getSubscriptionStatus(organizationId: string): Promise<{ byProduct: Map<string, string>; failed: boolean }> {
  // Critic finding M3 (2026-08-29): the original version used the service-role client here,
  // which bypasses RLS entirely -- the 0062 migration's user_has_org_membership() policy, the
  // whole point of that RLS design, never actually executed on this read path. Switching to the
  // user-scoped client (lib/supabase/route-client.ts, the house "S2 migration" pattern for any
  // route serving client users) makes RLS the REAL enforcement, not defense-in-depth theatre:
  // auth.uid() inside the policy resolves to the actual signed-in customer, so a revoked
  // organization_memberships row (this specific user, not just "does the org have any active
  // member") stops returning rows immediately, without needing bespoke re-validation logic here.
  // Residual (documented, not fixed here -- see PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md §10):
  // user_has_org_membership() itself does not join organizations.status, so a fully suspended
  // org whose memberships were never individually revoked is still readable. That gap is in a
  // shared house function used by ~20 other consumers and is out of this change's boundary.
  const supabase = await createSupabaseUserClient();
  if (!supabase) return { byProduct: new Map(), failed: true };
  const { data, error }: SubscriptionQuery = await supabase
    .from("organization_product_subscriptions")
    .select("product_key, status")
    .eq("organization_id", organizationId);
  if (error) {
    console.error("[portal/launcher] subscription read failed", { organizationId, error: error.message });
    return { byProduct: new Map(), failed: true };
  }
  const byProduct = new Map<string, string>();
  for (const row of data ?? []) byProduct.set(row.product_key, row.status);
  return { byProduct, failed: false };
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
          const isReady = product.status !== "coming_soon" && subStatus === "active";
          return (
            <div key={product.key} className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{product.name}</h2>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
                {isReady ? "已開通" : "即將推出"}
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
