// /ops/plans -- AwareWave's own plans (public.plans, owner null): what a payment grants, per product feature, and which
// features are paid from the wallet. Reads and writes only through lib/entitlements/plans-admin.ts (migration 0147);
// a seller's plan is listed read-only. Writes are server actions (./actions.ts), owner/admin only; each answers with ?r=<code>.
// Prices are not here: they live on the WooCommerce product.
import { headers } from "next/headers";
import { canWriteTenantConfig, readOpsRole } from "@/lib/ops-role";
import { listPlans, type PlanRow } from "@/lib/entitlements/plans-admin";
import { PRODUCTS, type PortalProduct } from "@/lib/portal/products";
import { addPlan, savePlan } from "./actions";
import { PLAN_MESSAGES } from "./messages";

export const dynamic = "force-dynamic";
export const metadata = { title: "方案 · Ops" };

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
const input: React.CSSProperties = { width: "100%", maxWidth: 360, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--card-border)", background: "var(--form-input-bg)", color: "var(--text-primary)", boxSizing: "border-box" };
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 4 };
const choice: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-primary)", marginRight: 16 };
const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "5px 0", borderBottom: "1px solid var(--card-border)", fontSize: 13, color: "var(--text-primary)" };
const KIND: Record<PlanRow["kind"], string> = { base: "訂閱方案", addon: "點數包方案" };

/** One checkbox row per registered feature of `product`: in the plan / paid from the wallet. Only a credits-billed feature offers the second box. */
function FeatureBoxes({ product, plan }: { product: PortalProduct; plan?: Pick<PlanRow, "features" | "limits"> }) {
  return (
    <div>
      {product.features.map((f) => (
        <div key={f.feature_key} style={row}>
          <label style={{ ...choice, minWidth: 260, marginRight: 0 }}>
            <input type="checkbox" name={`f:${f.feature_key}`} defaultChecked={plan?.features.includes(f.feature_key)} />
            {f.name} <code style={muted}>{f.feature_key}</code>
          </label>
          {f.billing === "credits" ? (
            <label style={choice}>
              <input type="checkbox" name={`c:${f.feature_key}`} defaultChecked={plan?.limits[f.feature_key]?.pay === "credits"} />
              用點數付
            </label>
          ) : <span style={muted}>合約計費（訂閱涵蓋，不扣點數）</span>}
        </div>
      ))}
    </div>
  );
}

export default async function PlansPage({ searchParams }: { searchParams?: Promise<{ r?: string | string[]; p?: string | string[] }> }) {
  const sp = searchParams ? await searchParams : {};
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const code = first(sp.r);
  const canWrite = canWriteTenantConfig(readOpsRole(new Request("http://localhost", { headers: await headers() })));
  const notice = code ? PLAN_MESSAGES[code] : undefined;

  let plans: PlanRow[] = [];
  let failure: string | null = null;
  try {
    plans = await listPlans();
  } catch (error) {
    failure = String(error instanceof Error ? error.message : error);
  }
  const sellable = PRODUCTS.filter((p) => p.features.length > 0);

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>方案</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 900 }}>
          方案決定一筆付款會開通哪些功能。訂閱方案的改動在客戶下次續約時套用；點數包方案只影響之後的購買。
          價格不在這裡，在 WooCommerce 的商品上；WooCommerce 商品的方案欄填這裡的方案代號。方案不能刪（可能有商品在賣），填錯就改它。同一產品的點數包方案不能和其他方案共用功能。轉售商自己的方案只能看。
        </p>
      </div>

      {notice ? (
        <div style={{ ...card, border: `1px solid ${notice.ok ? "var(--card-border)" : "var(--red)"}`, fontSize: 13, color: "var(--text-primary)" }}>
          {notice.text}{first(sp.p) ? <> <code>{first(sp.p)}</code></> : null}
        </div>
      ) : null}
      {failure ? <div style={{ ...card, border: "1px solid var(--red)", fontSize: 13, color: "var(--text-primary)" }}>讀不到方案清單：{failure}</div> : null}

      {plans.map((plan) => {
        const product = PRODUCTS.find((p) => p.key === plan.productKey);
        const own = plan.ownerOrganizationId === null;
        return (
          <section key={plan.planKey} style={card}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}><code>{plan.planKey}</code></h2>
            <p style={{ ...muted, margin: "0 0 10px" }}>
              {product?.name ?? plan.productKey}　{KIND[plan.kind]}　{own ? "AwareWave 的方案" : "轉售商的方案（唯讀）"}
            </p>
            {own && product ? (
              <form action={savePlan}>
                <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0 }}>
                  <input type="hidden" name="plan_key" value={plan.planKey} />
                  <FeatureBoxes product={product} plan={plan} />
                  <button type="submit" className="btn-primary" style={{ fontSize: 13, padding: "7px 16px", borderRadius: 6, marginTop: 10 }}>儲存</button>
                </fieldset>
              </form>
            ) : (
              <div>
                {plan.features.map((f) => (
                  <div key={f} style={row}><code>{f}</code>{plan.limits[f]?.pay === "credits" ? <span style={muted}>用點數付</span> : null}</div>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {!plans.length ? <div style={{ ...card, ...muted }}>{failure ? "讀不到" : "還沒有任何方案。"}</div> : null}

      {canWrite ? (
      <form action={addPlan} style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>新增方案</h2>
        <p style={{ ...muted, margin: "0 0 12px", maxWidth: 800 }}>
          方案代號、產品和種類建立後不能改（要換就建新的方案）。只勾所選產品自己的功能。
          點數包方案是客戶買點數時一併開通的方案，每個功能都要勾「用點數付」。
        </p>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="plan_key" style={label}>方案代號（小寫英文、數字、_ . -）</label>
          <input id="plan_key" name="plan_key" required placeholder="social_pro" pattern="[a-z0-9][a-z0-9_.\-]{0,99}" style={input} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={label}>產品</span>
          {sellable.map((p) => (
            <label key={p.key} style={choice}><input type="radio" name="product" value={p.key} required />{p.name}</label>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={label}>種類</span>
          <label style={choice}><input type="radio" name="kind" value="base" required />{KIND.base}</label>
          <label style={choice}><input type="radio" name="kind" value="addon" required />{KIND.addon}</label>
        </div>
        {sellable.map((p) => (
          <div key={p.key} style={{ marginBottom: 12 }}>
            <span style={label}>{p.name} 的功能</span>
            <FeatureBoxes product={p} />
          </div>
        ))}
        <button type="submit" className="btn-primary" style={{ fontSize: 13, padding: "7px 16px", borderRadius: 6 }}>新增方案</button>
      </form>
      ) : <p style={muted}>只有擁有者或管理員能新增、修改方案；你目前只能查看。</p>}
    </div>
  );
}
