// GET/POST/DELETE /api/ops/clients/[slug]/accounts -- the client's own people (client hub → 帳號). Staff owner/admin
// only: the list carries emails and POST creates sign-in identities.
// GET     → { accounts: [ClientAccount + roles], products: [{key,name,settings}] }. products = the doors this client can be
//         sent to; roles/settings only for a product that keeps a per-person role list (MEMBER_LISTS). Nothing here is stored:
//         what is held is read from the entitlement rows, roles from that product's own member list.
// POST    { email, product } (an offered product) → creates the account unverified (lib/accounts/client-invite.ts) and mails a set-password
//         link (invite wording while unverified, reset wording after). Audited without the link.
// DELETE  ?userId → removes an account of this client that holds no brand role (a mistyped email). Audited.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { resolveTenant } from "@/lib/tenant-guard";
import { recordOpsAudit } from "@/lib/ops-audit";
import { servedNextAdminProducts } from "@/lib/portal/doors";
import { holdsProduct } from "@/lib/entitlements/door-holds";
import { listMembers } from "@/lib/social/store";
import { ROLE_NAMES } from "@/app/(shell)/tools/social/model";
import { deleteClientAccount, inviteClientAccount, listClientAccounts, normalizeEmail } from "@/lib/accounts/client-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };
type Org = { id: string; name: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Products whose people each hold a role, read from the product's own list; staff change it at `settings`. */
const MEMBER_LISTS: Readonly<Record<string, { roles: (orgId: string) => Promise<Map<string, string>>; settings: (orgId: string) => string }>> = {
  social: {
    roles: async (orgId) => new Map((await listMembers(orgId)).map((m) => [m.user_id, ROLE_NAMES[m.role] ?? m.role])),
    settings: (orgId) => `/tools/social?brand=${orgId}&view=settings`,
  },
};

/** Doors this client's people can be sent to: served (a closed door's host 404s) and held -- asked per door with the
 *  door's own check, not one read of every row (an all-features account has hundreds, past PostgREST's row cap). */
async function offeredProducts(orgId: string) {
  const now = Math.floor(Date.now() / 1000);
  const served = servedNextAdminProducts();
  const held = await Promise.all(served.map((p) => holdsProduct({ organizationId: orgId, productKey: p.key, now })));
  return served.filter((_, i) => held[i]);
}

/** owner/admin staff, else the 403 response. A client identity never reaches /api/ops (middleware), checked again here. */
function staffAdmin(request: Request) {
  const resolved = resolveOpsRole(request);
  if (resolveTenant(request).userKind !== "staff" || !canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  // who pressed it, for the audit (set only by middleware)
  return { ...resolved, actorUserId: request.headers.get("x-ops-user-id")?.trim() || null };
}

async function clientOrg(context: Ctx): Promise<Org | Response> {
  const { slug } = await context.params;
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  const { data, error } = await sb.from("organizations").select("id, name, type").eq("slug", slug).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "org_lookup_failed" }, { status: 503 });
  const org = data as { id: string; name: string; type: string } | null;
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  // client accounts belong to client organizations only; an internal org's people are staff
  if (org.type !== "client") return NextResponse.json({ ok: false, error: "not_a_client_org" }, { status: 409 });
  return { id: org.id, name: org.name };
}

export async function GET(request: Request, context: Ctx) {
  const who = staffAdmin(request);
  if (who instanceof Response) return who;
  const org = await clientOrg(context);
  if (org instanceof Response) return org;
  try {
    const [list, offered] = await Promise.all([listClientAccounts(getSupabaseWriteClient()!, org.id), offeredProducts(org.id)]);
    const withRoles = offered.filter((p) => p.key in MEMBER_LISTS);
    const roleMaps = await Promise.all(withRoles.map((p) => MEMBER_LISTS[p.key].roles(org.id)));
    const products = offered.map((p) => ({ key: p.key, name: p.name, settings: MEMBER_LISTS[p.key]?.settings(org.id) ?? null }));
    // roles[product] = the role name, null = not on that product's list yet
    const accounts = list.map((a) => ({ ...a, roles: Object.fromEntries(withRoles.map((p, i) => [p.key, roleMaps[i].get(a.userId) ?? null])) }));
    return NextResponse.json({ ok: true, accounts, products });
  } catch (e) {
    console.error("[accounts] list failed", { org: org.id, error: String(e) });
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 503 });
  }
}

export async function POST(request: Request, context: Ctx) {
  const who = staffAdmin(request);
  if (who instanceof Response) return who;
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (!email) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  const org = await clientOrg(context);
  if (org instanceof Response) return org;
  let offered: Awaited<ReturnType<typeof offeredProducts>>;
  try {
    offered = await offeredProducts(org.id);
  } catch (e) {
    console.error("[accounts] entitlements read failed", { org: org.id, error: String(e) });
    return NextResponse.json({ ok: false, error: "entitlements_unavailable" }, { status: 503 });
  }
  if (!offered.some((p) => p.key === body.product)) return NextResponse.json({ ok: false, error: "product_not_held" }, { status: 400 });

  const out = await inviteClientAccount(getSupabaseWriteClient()!, {
    orgId: org.id,
    orgName: org.name,
    email,
    productKey: String(body.product ?? ""),
  });
  // strict:false here, so narrow with `in` (a boolean discriminant does not narrow)
  const failed = "error" in out ? out : null;
  // every outcome that touched an account is audited, including a link that was made but not delivered
  if (out.userId) {
    await recordOpsAudit(org.id, who.role, who.source, "client_account_link_sent", {
      user_id: out.userId,
      actor_user_id: who.actorUserId,
      product: String(body.product ?? ""),
      kind: "kind" in out ? out.kind : null,
      created: out.created ?? null,
      delivered: !failed,
      error: failed?.error ?? null,
    });
  }
  if (failed) return NextResponse.json({ ok: false, error: failed.error, created: failed.created ?? false }, { status: failed.status });
  return NextResponse.json({ ok: true, userId: out.userId, kind: "kind" in out ? out.kind : null, created: out.created });
}

export async function DELETE(request: Request, context: Ctx) {
  const who = staffAdmin(request);
  if (who instanceof Response) return who;
  const userId = new URL(request.url).searchParams.get("userId") ?? "";
  if (!UUID_RE.test(userId)) return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  const org = await clientOrg(context);
  if (org instanceof Response) return org;

  const out = await deleteClientAccount(getSupabaseWriteClient()!, org.id, userId);
  if ("error" in out) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
  await recordOpsAudit(org.id, who.role, who.source, "client_account_deleted", {
    user_id: userId,
    actor_user_id: who.actorUserId,
  });
  return NextResponse.json({ ok: true });
}
