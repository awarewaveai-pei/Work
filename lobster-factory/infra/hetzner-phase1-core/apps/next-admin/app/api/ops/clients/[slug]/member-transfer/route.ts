// GET/POST/DELETE /api/ops/clients/[slug]/member-transfer -- hand this account's aware-wave.com membership (= its manager,
// ADR 021 D5) to another person (G5, migration 0182). Staff owner/admin only, as the accounts route next door.
// GET    → { manager: { userId, email } | null, transfer: { email, reason, createdAt, expiresAt, status } | null }
// POST   { email, reason } → a transfer invite (voids any live invite); its one-time code is in this answer only. The new
//        person proves the email on aware-wave.com with it; only then does the database swap the member (and audit it).
//        Until then the current manager stays. Audited here without the code.
// DELETE → voids the live transfer. Audited.
// No mail is sent; the rights, subscriptions and credits stay with the account (they never name the person).

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { resolveTenant } from "@/lib/tenant-guard";
import { recordOpsAudit } from "@/lib/ops-audit";
import { normalizeEmail } from "@/lib/accounts/client-invite";
import { createMemberTransfer, memberTransferStatus, voidMemberInvite } from "@/lib/entitlements/identities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };
const REASON_MAX = 500;

/** owner/admin staff, else the 403 response (same rule as ../accounts: a client identity never reaches /api/ops). */
function staffAdmin(request: Request) {
  const resolved = resolveOpsRole(request);
  if (resolveTenant(request).userKind !== "staff" || !canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  return { ...resolved, role: resolved.role as "owner" | "admin" /* canWriteTenantConfig: owner or admin only */, actorUserId: request.headers.get("x-ops-user-id")?.trim() || null };
}

async function clientOrg(context: Ctx): Promise<{ id: string } | Response> {
  const { slug } = await context.params;
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  const { data, error } = await sb.from("organizations").select("id, type").eq("slug", slug).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "org_lookup_failed" }, { status: 503 });
  const org = data as { id: string; type: string } | null;
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  if (org.type !== "client") return NextResponse.json({ ok: false, error: "not_a_client_org" }, { status: 409 });
  return { id: org.id };
}

export async function GET(request: Request, context: Ctx) {
  const who = staffAdmin(request);
  if (who instanceof Response) return who;
  const org = await clientOrg(context);
  if (org instanceof Response) return org;
  try {
    const s = await memberTransferStatus(getSupabaseWriteClient()!, org.id);
    const transfer = s.transfer && { ...s.transfer, status: Date.parse(s.transfer.expiresAt) <= Date.now() ? "expired" : "pending" };
    return NextResponse.json({ ok: true, manager: s.manager, transfer });
  } catch (e) {
    console.error("[member-transfer] status failed", { org: org.id, error: String(e) });
    return NextResponse.json({ ok: false, error: "status_failed" }, { status: 503 });
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
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > REASON_MAX) return NextResponse.json({ ok: false, error: "invalid_reason" }, { status: 400 });
  const org = await clientOrg(context);
  if (org instanceof Response) return org;
  try {
    const out = await createMemberTransfer(getSupabaseWriteClient()!, {
      organizationId: org.id, email, reason, createdBy: who.actorUserId ?? `${who.role}:${who.source}`, actorRole: who.role,
    });
    if (out.ok === false) return NextResponse.json({ ok: false, error: out.error }, { status: 409 });
    await recordOpsAudit(org.id, who.role, who.source, "member_transfer_created", {
      email, reason, expires_at: out.expiresAt, actor_user_id: who.actorUserId,
    });
    return NextResponse.json({ ok: true, code: out.code, email, expiresAt: out.expiresAt });
  } catch (e) {
    console.error("[member-transfer] issue failed", { org: org.id, error: String(e) });
    return NextResponse.json({ ok: false, error: "member_transfer_failed" }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: Ctx) {
  const who = staffAdmin(request);
  if (who instanceof Response) return who;
  const org = await clientOrg(context);
  if (org instanceof Response) return org;
  try {
    // an ordinary invite (an account without a member) is ../accounts' to void, not this route's
    if (!(await memberTransferStatus(getSupabaseWriteClient()!, org.id)).transfer) return NextResponse.json({ ok: true, voided: false });
    const voided = await voidMemberInvite(getSupabaseWriteClient()!, org.id);
    if (voided) await recordOpsAudit(org.id, who.role, who.source, "member_transfer_voided", { actor_user_id: who.actorUserId });
    return NextResponse.json({ ok: true, voided });
  } catch (e) {
    console.error("[member-transfer] void failed", { org: org.id, error: String(e) });
    return NextResponse.json({ ok: false, error: "member_transfer_failed" }, { status: 503 });
  }
}
