// GET/PATCH/POST /api/ops/staff -- staff roles and ticked tools (/ops/staff; agency-os/handoffs/2026-10-24-staff-tool-grants C4).
// GET    → { staff: StaffAccount[], tools: [{key,name,group}], canEdit }   owner/admin (the list carries emails)
// PATCH  { userId, role?, tools? } → owner only. An owner's tools cannot change; the last owner cannot be demoted.
// POST   { email } → owner only. Creates a staff account (viewer, no tools) and mails a set-password link.
// Every write is audited under the internal organization. The change reaches the person's session within 15 s
// (lib/supabase/session-cache.ts FRESH_MS).

import { NextResponse } from "next/server";
import { resolveOpsRole } from "@/lib/ops-role";
import { resolveTenant } from "@/lib/tenant-guard";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { STAFF_TOOLS } from "@/lib/portal/staff-tools";
import { normalizeEmail } from "@/lib/accounts/client-invite";
import { auditStaffChange, internalOrgId, inviteStaff, isOpsRole, listStaff, updateStaff } from "@/lib/accounts/staff-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS = new Set(STAFF_TOOLS.map((t) => t.key));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller, or the 403 response. Customers never reach /api/ops (middleware); checked again here. */
function caller(request: Request, need: "read" | "write") {
  const { role } = resolveOpsRole(request);
  const ok = resolveTenant(request).userKind === "staff" && (role === "owner" || (need === "read" && role === "admin"));
  if (!ok) return NextResponse.json({ ok: false, error: "forbidden_role", role }, { status: 403 });
  return { role, actorUserId: request.headers.get("x-ops-user-id")?.trim() || "" };
}

function client() {
  return getSupabaseWriteClient() ?? NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
}

/** Where a write is audited; no internal organization = no write (an access change must leave a record). */
async function auditOrg(sb: NonNullable<ReturnType<typeof getSupabaseWriteClient>>) {
  return (await internalOrgId(sb)) ?? NextResponse.json({ ok: false, error: "audit_unavailable" }, { status: 503 });
}

export async function GET(request: Request) {
  const who = caller(request, "read");
  if (who instanceof Response) return who;
  const sb = client();
  if (sb instanceof Response) return sb;
  try {
    const staff = await listStaff(sb);
    const tools = STAFF_TOOLS.map((t) => ({ key: t.key, name: t.name, group: t.group }));
    return NextResponse.json({ ok: true, staff, tools, canEdit: who.role === "owner", self: who.actorUserId });
  } catch (e) {
    console.error("[staff-access] list failed", { error: String(e) });
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const who = caller(request, "write");
  if (who instanceof Response) return who;
  const body = (await request.json().catch(() => null)) as { userId?: unknown; role?: unknown; tools?: unknown } | null;
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!UUID_RE.test(userId)) return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  if (body?.role !== undefined && !isOpsRole(body.role)) return NextResponse.json({ ok: false, error: "invalid_role" }, { status: 400 });
  const tools = body?.tools;
  if (tools !== undefined && (!Array.isArray(tools) || tools.some((k) => typeof k !== "string" || !KEYS.has(k)))) {
    return NextResponse.json({ ok: false, error: "invalid_tools" }, { status: 400 });
  }
  if (body?.role === undefined && tools === undefined) return NextResponse.json({ ok: false, error: "nothing_to_change" }, { status: 400 });
  const sb = client();
  if (sb instanceof Response) return sb;
  const orgId = await auditOrg(sb);
  if (orgId instanceof Response) return orgId;
  const out = await updateStaff(sb, userId, { role: body?.role as never, tools: tools as string[] | undefined });
  if ("error" in out) return NextResponse.json(out, { status: out.status });
  const audited = await auditStaffChange(sb, orgId, "staff.access_updated", who.actorUserId, userId, {
    email: out.after.email,
    role: { from: out.before.role, to: out.after.role },
    tools: { from: out.before.tools, to: out.after.tools },
  });
  return NextResponse.json({ ok: true, account: out.after, audited });
}

export async function POST(request: Request) {
  const who = caller(request, "write");
  if (who instanceof Response) return who;
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  const sb = client();
  if (sb instanceof Response) return sb;
  const orgId = await auditOrg(sb);
  if (orgId instanceof Response) return orgId;
  const out = await inviteStaff(sb, email);
  if ("error" in out) {
    // an account created before the link or mail failed is still a new sign-in identity: record it
    if (out.created && out.userId) await auditStaffChange(sb, orgId, "staff.invited", who.actorUserId, out.userId, { email, created: true, mail: out.error });
    return NextResponse.json(out, { status: out.status });
  }
  const audited = await auditStaffChange(sb, orgId, "staff.invited", who.actorUserId, out.userId, { email, created: out.created });
  return NextResponse.json({ ok: true, userId: out.userId, created: out.created, audited });
}
