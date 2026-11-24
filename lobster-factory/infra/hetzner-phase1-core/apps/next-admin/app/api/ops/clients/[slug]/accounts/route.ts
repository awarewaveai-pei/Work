// GET/POST/DELETE /api/ops/clients/[slug]/accounts -- the client's own people (client hub → 帳號). Staff owner/admin
// only: the list carries emails and POST creates sign-in identities.
// GET     → { accounts: [ClientAccount + roles], products: [{key,name,settings}] }. products = the doors this client can be
//         sent to; roles/settings only for a product that keeps a per-person role list (MEMBER_LISTS). Nothing here is stored:
//         what is held is read from the entitlement rows, roles from that product's own member list.
// POST    { email, product } (an offered product) → creates the account unverified (lib/accounts/client-invite.ts) and mails a set-password
//         link (invite wording while unverified, reset wording after). Audited without the link.
// DELETE  ?userId → removes an account of this client that holds no brand role (a mistyped email). Audited.
// Member invite (ADR 021 D4, migration 0180): GET also answers `member` = { eligible, linked, invite } (null when it
//         cannot be read, e.g. before 0180 is applied -- the accounts list still loads). POST { action:"member_invite",
//         email } → a new invite (voids the live one = 作廢重發); its one-time code is in this answer only. DELETE
//         ?memberInvite=1 → voids the live invite. Both audited without the code. No mail is sent (the landing page is M6).

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { clientOrg, staffAdmin, type ClientOrg as Org, type ClientRouteCtx as Ctx, type StaffAdmin } from "@/lib/accounts/client-route-guards";
import { recordOpsAudit } from "@/lib/ops-audit";
import { heldDoors } from "@/lib/portal/held-doors";
import { listMembers } from "@/lib/social/store";
import { ROLE_NAMES } from "@/app/(shell)/tools/social/model";
import { deleteClientAccount, inviteClientAccount, listClientAccounts, normalizeEmail } from "@/lib/accounts/client-invite";
import { createMemberInvite, inviteTarget, liveMemberInvite, voidMemberInvite } from "@/lib/entitlements/identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Products whose people each hold a role, read from the product's own list; staff change it at `settings`. */
const MEMBER_LISTS: Readonly<Record<string, { roles: (orgId: string) => Promise<Map<string, string>>; settings: (orgId: string) => string }>> = {
  social: {
    roles: async (orgId) => new Map((await listMembers(orgId)).map((m) => [m.user_id, ROLE_NAMES[m.role] ?? m.role])),
    settings: (orgId) => `/tools/social?brand=${orgId}&view=settings`,
  },
};

export async function GET(request: Request, context: Ctx) {
  const who = staffAdmin(request);
  if (who instanceof Response) return who;
  const org = await clientOrg(context);
  if (org instanceof Response) return org;
  try {
    const [list, offered] = await Promise.all([listClientAccounts(getSupabaseWriteClient()!, org.id), heldDoors(org.id)]);
    const withRoles = offered.filter((p) => p.key in MEMBER_LISTS);
    const roleMaps = await Promise.all(withRoles.map((p) => MEMBER_LISTS[p.key].roles(org.id)));
    const products = offered.map((p) => ({ key: p.key, name: p.name, settings: MEMBER_LISTS[p.key]?.settings(org.id) ?? null }));
    // roles[product] = the role name, null = not on that product's list yet
    const accounts = list.map((a) => ({ ...a, roles: Object.fromEntries(withRoles.map((p, i) => [p.key, roleMaps[i].get(a.userId) ?? null])) }));
    return NextResponse.json({ ok: true, accounts, products, member: await memberStatus(org.id) });
  } catch (e) {
    console.error("[accounts] list failed", { org: org.id, error: String(e) });
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 503 });
  }
}

/** The account's membership on aware-wave.com: linked = a member holds it; invite = the live one with its state. null =
 *  could not be read (never fails the accounts list). */
async function memberStatus(orgId: string) {
  try {
    const sb = getSupabaseWriteClient()!;
    const [target, live] = await Promise.all([inviteTarget(sb, orgId), liveMemberInvite(sb, orgId)]);
    const invite = live && {
      email: live.email, createdAt: live.createdAt, expiresAt: live.expiresAt,
      status: Date.parse(live.expiresAt) <= Date.now() ? "expired" : "pending",
    };
    return { eligible: target.customerRoot, linked: target.linked, invite };
  } catch (e) {
    console.error("[accounts] member status failed", { org: orgId, error: String(e) });
    return null;
  }
}

async function createInvite(who: StaffAdmin, org: Org, email: string) {
  const sb = getSupabaseWriteClient()!;
  try {
    const target = await inviteTarget(sb, org.id);
    if (!target.customerRoot) return NextResponse.json({ ok: false, error: "not_a_customer_account" }, { status: 409 });
    if (target.linked) return NextResponse.json({ ok: false, error: "member_linked" }, { status: 409 });
    const out = await createMemberInvite(sb, { organizationId: org.id, email, createdBy: who.actorUserId ?? `${who.role}:${who.source}` });
    if (out.ok === false) return NextResponse.json({ ok: false, error: out.error }, { status: 409 });
    await recordOpsAudit(org.id, who.role, who.source, "member_invite_created", {
      invite_id: out.invite.id, email, expires_at: out.invite.expiresAt, actor_user_id: who.actorUserId,
    });
    return NextResponse.json({ ok: true, code: out.code, email, expiresAt: out.invite.expiresAt });
  } catch (e) {
    console.error("[accounts] member invite failed", { org: org.id, error: String(e) });
    return NextResponse.json({ ok: false, error: "member_invite_failed" }, { status: 503 });
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
  if (body.action === "member_invite") return createInvite(who, org, email);
  let offered: Awaited<ReturnType<typeof heldDoors>>;
  try {
    offered = await heldDoors(org.id);
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
  const params = new URL(request.url).searchParams;
  if (params.get("memberInvite") === "1") {
    const org = await clientOrg(context);
    if (org instanceof Response) return org;
    try {
      const voided = await voidMemberInvite(getSupabaseWriteClient()!, org.id);
      if (voided) await recordOpsAudit(org.id, who.role, who.source, "member_invite_voided", { actor_user_id: who.actorUserId });
      return NextResponse.json({ ok: true, voided });
    } catch (e) {
      console.error("[accounts] member invite void failed", { org: org.id, error: String(e) });
      return NextResponse.json({ ok: false, error: "member_invite_failed" }, { status: 503 });
    }
  }
  const userId = params.get("userId") ?? "";
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
