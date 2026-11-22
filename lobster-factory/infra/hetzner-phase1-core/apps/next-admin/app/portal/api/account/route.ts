// GET /portal/api/account -- a signed-in customer's own points and contract, read-only (blueprint §15.4).
// The unit comes only from the server-side identity (requireClientOrg); no query or body names a unit. The manager (holder of
// the unit's member link, ADR 021 D5) gets contracts, grants and the recent ledger; an authorized member gets balance and
// end dates only. Never returned: payment events, provider, source refs, hold reason.
import { isAccountManager } from "@/lib/entitlements/identities";
import { billingAccount } from "@/lib/entitlements/tables";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { PortalAccessError, requireClientOrg } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function GET(req: Request): Promise<Response> {
  if (!req.headers.get("x-ops-user-kind")) return json({ ok: false, error: "unauthorized" }, 401);
  let orgId: string;
  try {
    ({ orgId } = requireClientOrg(req));
  } catch (e) {
    if (e instanceof PortalAccessError) return json({ ok: false, error: "forbidden" }, 403);
    throw e;
  }
  try {
    const account = await billingAccount(orgId);
    if (!account) return json({ ok: false, error: "not_found" }, 404);
    const userId = req.headers.get("x-ops-user-id")?.trim();
    const db = getSupabaseWriteClient();
    const manager = !!userId && !!db && (await isAccountManager(db, account.organization_id, userId));
    const ends = account.contracts.map((c) => c.current_period_end).filter((d): d is string => !!d).sort();
    const base = { ok: true as const, role: manager ? "manager" as const : "member" as const, balance: account.balance, frozen: account.hold !== null, next_period_end: ends[0] ?? null };
    if (!manager) return json(base);
    return json({
      ...base,
      contracts: account.contracts.map((c) => ({ product_key: c.product_key, plan_key: c.plan_key, status: c.status, current_period_end: c.current_period_end })),
      grants: account.grants.map((g) => ({ product_key: g.product_key, source: g.source, state: g.state, features: g.features, ends_at: g.ends_at })),
      ledger: account.ledger.map((l) => ({ at: l.at, units: l.units, entry_type: l.entry_type })),
    });
  } catch (error) {
    console.error("[portal/api/account] failed", String(error).slice(0, 200));
    return json({ ok: false, error: "unavailable" }, 503);
  }
}
