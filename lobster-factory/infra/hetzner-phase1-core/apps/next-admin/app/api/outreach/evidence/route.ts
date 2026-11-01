import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

// Cold Outreach -- evidence review (SPEC §5.2, card C3). Only third-party evidence waits here (pending); the lead's own
// website was approved at research time. A person approves or rejects; cold email generation reads approved rows only.
// The row's organization is the lead's (0150 triggers), so the access check on it is the check on the lead.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_evidence";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id, organization_id, lead_id, claim, excerpt, source_url, source_label, source_date, status, created_at, co_leads(name)";

// GET ?status=pending|approved|rejected (default pending) &leadId= &organizationId=
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const supabase = await outreachDb(req, params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const status = params.get("status") ?? "pending";
  if (!["pending", "approved", "rejected", "stale"].includes(status)) return NextResponse.json({ ok: false, error: "bad status" }, { status: 400 });
  const leadId = params.get("leadId");
  if (leadId && !UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });
  const rawOrgId = params.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let q = supabase.from(TABLE).select(COLS).eq("status", status).order("created_at", { ascending: false }).limit(200);
  if (leadId) q = q.eq("lead_id", leadId);
  if (orgFilter) q = q.eq("organization_id", orgFilter);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, evidence: data ?? [] });
}

// PATCH { id, status: approved|rejected, orgSlug? } -- records who decided (reviewed_by): research never overrides it.
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const supabase = await outreachDb(req, typeof body.orgSlug === "string" ? body.orgSlug : null);
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const status = body.status;
  if (status !== "approved" && status !== "rejected") return NextResponse.json({ ok: false, error: "status must be approved or rejected" }, { status: 400 });

  const { data: cur, error: readErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try { assertOrgAccess(req, (cur as { organization_id: string | null }).organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const reviewer = req.headers.get("x-ops-user-id") ?? "unknown";
  const { data, error } = await supabase.from(TABLE).update({ status, reviewed_by: reviewer }).eq("id", id).select("id, status").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, evidence: data });
}
