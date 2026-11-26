// GET/POST/DELETE /portal/api/people -- 成員授權 (ADR 021 G4, U19): a customer unit's manager authorizes colleagues.
// Only an entrance to lib/accounts/client-invite.ts (the staff hub's accounts route uses the same functions): no new
// roles, no new tables. Under /portal/api because a client identity reaches only /portal/* (middleware.ts
// isClientOutsideDoor). The unit is always the caller's own (requireClientOrg: the server-side identity); no query or
// body names a unit, and a userId of staff or of another unit is account_not_found (client-invite.ts belongsTo).
// The manager = the holder of the unit's member link (ADR 021 D5, isAccountManager); an authorized person reads only
// their own role and may not act (403). Each action writes ops_audit_events with the client account as the actor.
// GET    → { role:"manager", accounts:[ClientAccount + self], products:[{key,name}] } | { role:"member" }
// POST   { email, product } (a product the unit holds) → creates the account and mails a set-password link, or sends a
//        fresh one to an existing account of the unit (重寄).
// DELETE ?userId → removes an account of the unit; never the manager's own (cannot_delete_self).
import { NextResponse } from "next/server";
import { deleteClientAccount, inviteClientAccount, listClientAccounts, normalizeEmail } from "@/lib/accounts/client-invite";
import { isAccountManager } from "@/lib/entitlements/identities";
import { recordOpsAudit } from "@/lib/ops-audit";
import { heldDoors } from "@/lib/portal/held-doors";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { PortalAccessError, requireClientOrg } from "@/lib/tenant-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

type Caller = { orgId: string; userId: string; manager: boolean };

/** The caller's unit and role, or the refusal. ops_audit_events.actor_role takes staff roles only (0011 check): a
 *  customer acts as "viewer", named by actor_user_id + role_source "portal_manager". */
async function caller(req: Request): Promise<Caller | Response> {
  if (!req.headers.get("x-ops-user-kind")) return json({ ok: false, error: "unauthorized" }, 401);
  let orgId: string;
  try {
    ({ orgId } = requireClientOrg(req));
  } catch (e) {
    if (e instanceof PortalAccessError) return json({ ok: false, error: "forbidden" }, 403);
    throw e;
  }
  const userId = req.headers.get("x-ops-user-id")?.trim() ?? "";
  const db = getSupabaseWriteClient();
  if (!db) return json({ ok: false, error: "unavailable" }, 503);
  const manager = !!userId && (await isAccountManager(db, orgId, userId));
  return { orgId, userId, manager };
}

const audit = (c: Caller, event: string, payload: Record<string, unknown>) =>
  recordOpsAudit(c.orgId, "viewer", "portal_manager", event, { ...payload, actor_user_id: c.userId, actor_kind: "client" });

export async function GET(req: Request): Promise<Response> {
  const c = await caller(req);
  if (c instanceof Response) return c;
  if (!c.manager) return json({ ok: true, role: "member" });
  try {
    const db = getSupabaseWriteClient()!;
    const [list, held] = await Promise.all([listClientAccounts(db, c.orgId), heldDoors(c.orgId)]);
    return json({
      ok: true, role: "manager",
      accounts: list.map((a) => ({ ...a, self: a.userId === c.userId })),
      products: held.map((p) => ({ key: p.key, name: p.name })),
    });
  } catch (e) {
    console.error("[portal/api/people] list failed", String(e).slice(0, 200));
    return json({ ok: false, error: "unavailable" }, 503);
  }
}

export async function POST(req: Request): Promise<Response> {
  const c = await caller(req);
  if (c instanceof Response) return c;
  if (!c.manager) return json({ ok: false, error: "not_manager" }, 403);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const email = normalizeEmail(body.email);
  if (!email) return json({ ok: false, error: "invalid_email" }, 400);
  const db = getSupabaseWriteClient()!;
  let held: Awaited<ReturnType<typeof heldDoors>>;
  try {
    held = await heldDoors(c.orgId);
  } catch {
    return json({ ok: false, error: "unavailable" }, 503);
  }
  if (!held.some((p) => p.key === body.product)) return json({ ok: false, error: "product_not_held" }, 400);
  const org = await db.from("organizations").select("name").eq("id", c.orgId).maybeSingle();
  const orgName = typeof (org.data as { name?: unknown } | null)?.name === "string" ? (org.data as { name: string }).name : "";
  const out = await inviteClientAccount(db, { orgId: c.orgId, orgName, email, productKey: String(body.product) });
  const failed = "error" in out ? out : null;
  if (out.userId) {
    await audit(c, "client_account_link_sent", {
      user_id: out.userId, product: String(body.product), kind: "kind" in out ? out.kind : null,
      created: out.created ?? null, delivered: !failed, error: failed?.error ?? null,
    });
  }
  if (failed) return json({ ok: false, error: failed.error }, failed.status);
  return json({ ok: true, userId: out.userId, kind: "kind" in out ? out.kind : null, created: out.created });
}

export async function DELETE(req: Request): Promise<Response> {
  const c = await caller(req);
  if (c instanceof Response) return c;
  if (!c.manager) return json({ ok: false, error: "not_manager" }, 403);
  const userId = new URL(req.url).searchParams.get("userId") ?? "";
  if (!UUID_RE.test(userId)) return json({ ok: false, error: "invalid_user" }, 400);
  if (userId === c.userId) return json({ ok: false, error: "cannot_delete_self" }, 409);
  const out = await deleteClientAccount(getSupabaseWriteClient()!, c.orgId, userId);
  if ("error" in out) return json({ ok: false, error: out.error }, out.status);
  await audit(c, "client_account_deleted", { user_id: userId });
  return json({ ok: true });
}
