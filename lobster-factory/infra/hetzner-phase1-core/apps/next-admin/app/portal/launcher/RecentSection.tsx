// 「最近使用」「常用」 (card U24, blueprint §6.2): the signed-in person's own paid-feature use, from the entitlement.usage
// rows can() already writes (lib/entitlements/can.ts report / settlePaid -> runtime.ts audit -> ops_audit_events, the
// actor in payload.actor). Read here on the server, as 繼續上次 is: a customer on the portal host may call only /portal/*.
// Privacy: the rows matched are exactly payload.actor = `client:<org>:<uid>` of THIS session (requireClientOrg's org +
// middleware's x-ops-user-id), so a colleague's or a staff member's use of the same unit never shows -- a manager sees
// only their own too. Only features behind can() are counted; a page without can() (題目) records nothing.
// One call writes a use row (recordUse, payload.use = true) AND a charge row (report / settlePaid): only the use row counts.
import { getSupabaseReadClient, getSupabaseWriteClient } from "@/lib/supabase-server";
import { PRODUCTS } from "@/lib/portal/products";
import { servedNextAdminProducts } from "@/lib/portal/doors";
import { DoorForm } from "./ResumeSection";

const RECENT = 5;
const FREQUENT = 3;
const DAYS = 30;
// The newest rows read for both lists; a person past this many uses in 30 days has 常用 counted on the newest ROWS only.
const ROWS = 1000;

export interface UsedFeature { featureKey: string; name: string; productKey: string; productName: string; count: number }
export interface Recent { recent: UsedFeature[]; frequent: UsedFeature[] }

/** feature_key -> its name and product, only for products the person can open from here (a held, served door). */
function openable(held: ReadonlySet<string>): Map<string, Omit<UsedFeature, "count">> {
  const doors = new Set(servedNextAdminProducts().filter((p) => held.has(p.key)).map((p) => p.key));
  const out = new Map<string, Omit<UsedFeature, "count">>();
  for (const p of PRODUCTS) {
    if (!doors.has(p.key)) continue;
    for (const f of p.features) out.set(f.feature_key, { featureKey: f.feature_key, name: f.name, productKey: p.key, productName: p.name });
  }
  return out;
}

/** Rows newest first -> the 5 newest distinct features and the 3 most used (ties: the one used last first). */
export function rankUsage(rows: ReadonlyArray<{ featureKey: string }>, known: ReadonlyMap<string, Omit<UsedFeature, "count">>): Recent {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const { featureKey } of rows) {
    if (!known.has(featureKey)) continue;
    if (!counts.has(featureKey)) order.push(featureKey);
    counts.set(featureKey, (counts.get(featureKey) ?? 0) + 1);
  }
  const feature = (k: string): UsedFeature => ({ ...known.get(k)!, count: counts.get(k)! });
  const frequent = [...order].sort((a, b) => counts.get(b)! - counts.get(a)! || order.indexOf(a) - order.indexOf(b));
  return { recent: order.slice(0, RECENT).map(feature), frequent: frequent.slice(0, FREQUENT).map(feature) };
}

/** The person's last-30-day use, or "failed". orgId must be requireClientOrg's and userId the middleware's header: with
 *  either missing nothing is read (the actor string would name no one, or everyone of a unit). */
export async function loadRecent(orgId: string, userId: string, held: ReadonlySet<string>, now: Date = new Date()): Promise<Recent | "failed"> {
  if (!orgId || !userId) return { recent: [], frequent: [] };
  const db = getSupabaseWriteClient() ?? getSupabaseReadClient();
  if (!db) return "failed";
  try {
    const since = new Date(now.getTime() - DAYS * 86_400_000).toISOString();
    const { data, error } = await db.from("ops_audit_events")
      .select("payload, created_at")
      .eq("organization_id", orgId)
      .eq("event_type", "entitlement.usage")
      .eq("payload->>actor", `client:${orgId}:${userId}`)
      .eq("payload->>use", "true")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ROWS);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).flatMap((r: { payload: unknown }) => {
      const k = (r.payload as { feature_key?: unknown } | null)?.feature_key;
      return typeof k === "string" ? [{ featureKey: k }] : [];
    });
    return rankUsage(rows, openable(held));
  } catch (error) {
    console.error("[portal/launcher] recent read failed", { orgId, error: error instanceof Error ? error.message : String(error) });
    return "failed";
  }
}

const H2 = { fontSize: 15, fontWeight: 700, margin: "0 0 12px" } as const;
const H3 = { fontSize: 13.5, fontWeight: 700, margin: "0 0 8px", color: "var(--text-muted)" } as const;
const LIST = { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 } as const;

function Row({ f, field }: { f: UsedFeature; field: "recent" | "frequent" }) {
  return (
    <li data-used={field} className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ flex: "1 1 200px", minWidth: 0 }}>
        <strong style={{ color: "var(--text-primary)" }}>{f.name}</strong>
        <span style={{ fontSize: 12.5, color: "var(--text-muted)", marginLeft: 8 }}>
          {f.productName}{field === "frequent" ? ` · ${DAYS} 天內 ${f.count} 次` : ""}
        </span>
      </span>
      <DoorForm productKey={f.productKey} label="開啟" />
    </li>
  );
}

export function RecentSection({ data }: { data: Recent | "failed" }) {
  if (data === "failed") return <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "0 0 20px" }}>最近使用：暫時讀不到。</p>;
  if (data.recent.length === 0) return null;
  return (
    <section aria-label="最近使用" style={{ margin: "0 0 28px" }}>
      <h2 style={H2}>最近使用</h2>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div>
          <h3 style={H3}>最近用過</h3>
          <ul style={LIST}>{data.recent.map((f) => <Row key={f.featureKey} f={f} field="recent" />)}</ul>
        </div>
        <div>
          <h3 style={H3}>常用（{DAYS} 天）</h3>
          <ul style={LIST}>{data.frequent.map((f) => <Row key={f.featureKey} f={f} field="frequent" />)}</ul>
        </div>
      </div>
    </section>
  );
}
