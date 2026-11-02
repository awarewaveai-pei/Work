import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse, userKindOf } from "@/lib/tenant-guard";
import { draftMessage } from "@/lib/outreach/draft";

// Cold Outreach — Gmail draft creation (task T10, acceptance: real draft via REALTEST, daily
// limit enforced, draft-only — never sends). A dedicated route rather than messages/route.ts's
// PATCH: the generic PATCH lets a human flip status among draft/approved/needs_edit/skipped, but
// 'drafted' is never a value a client sets: this route takes the row (approved → drafted) just before the Gmail call
// and gives it back if the call fails, so the status never lies about whether a draft exists and two requests cannot
// both draft it; drafted_at is written once the draft exists.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const messageId = str(body.messageId);
  if (!messageId) return NextResponse.json({ ok: false, error: "messageId required" }, { status: 400 });
  if (!UUID_RE.test(messageId)) return NextResponse.json({ ok: false, error: "messageId must be a uuid" }, { status: 400 });

  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  try {
    return await draftMessage(supabase, messageId, {
      agencyFallback: userKindOf(req.headers) !== "client",
      confirmedNoDraft: body.confirmedNoDraft === true,
      authorize: (org) => assertOrgAccess(req, org),
    });
  } catch (e) {
    if (e instanceof OrgAccessError) return toOrgAccessResponse(e);
    throw e;
  }
}
