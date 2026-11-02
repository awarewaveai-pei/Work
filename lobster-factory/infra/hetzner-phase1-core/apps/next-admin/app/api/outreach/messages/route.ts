import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { gateMessage, lintMessage, GATE_VERSION, type RequiredParts } from "@/lib/outreach/cold-gate";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse, userKindOf } from "@/lib/tenant-guard";
import { billedTo } from "@/lib/outreach/billing";
import { generateForLead, isUniqueViolation, type LeadRow } from "@/lib/outreach/generate";

// Cold Outreach — message generation and review (SPEC §5.3, §5.4, D23). Table: co_messages (0048, 0149).
// POST: access check, then lib/outreach/generate.ts (Cold Gate → brand context → AI ladder → JSON guard → gated rows →
// the profile's review policy). Nothing is sent here; drafting in Gmail is gmail-draft/route.ts. Writes need
// canManageOutreach; GET is authed-only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_messages";
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
// Guard uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const supabase = await outreachDb(req, params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const leadId = params.get("leadId");
  if (leadId && !UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });
  const rawOrgId = params.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(100);
  if (leadId) query = query.eq("lead_id", leadId);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, messages: data ?? [] });
}

// POST { leadId, orgSlug? } — generate the first emails (A/B) and follow-ups for one lead.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const leadId = str(body.leadId);
  if (!leadId) return NextResponse.json({ ok: false, error: "leadId required" }, { status: 400 });
  if (!UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });

  const { data: leadData, error: leadErr } = await supabase.from("co_leads").select("*").eq("id", leadId).maybeSingle();
  if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });
  if (!leadData) return NextResponse.json({ ok: false, error: "lead not found" }, { status: 404 });
  const lead = leadData as LeadRow;
  try { assertOrgAccess(req, lead.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  return generateForLead(supabase, lead, {
    agencyFallback: userKindOf(req.headers) !== "client",
    billing: () => billedTo(req, lead.organization_id),
    pastedReply: typeof body.pastedReply === "string" && body.pastedReply.trim() ? body.pastedReply : null,
  });
}

// PATCH { id, status, subject?, body?, orgSlug? } — human review (approve / edit / skip). Never sends.
// An edited subject or body is gated again with the parts generation required. Approving a first email skips its other
// variant; a second approved first email for the lead is refused by the 0149 index → 409 variant_already_approved.
const ALLOWED_STATUS = new Set(["draft", "approved", "needs_edit", "skipped"]);
const LOCKED = new Set(["drafted", "sending", "copied", "sent"]);
interface CurRow { organization_id: string | null; lead_id: string; output_type: string; subject: string | null; body: string; gate_snapshot: Record<string, unknown> | null }
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = str(body.id);
  const status = str(body.status);
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  if (!status || !ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ ok: false, error: "valid status required (draft|approved|needs_edit|skipped)" }, { status: 400 });
  }

  const { data: curData, error: curErr } = await supabase.from(TABLE)
    .select("organization_id, lead_id, output_type, subject, body, gate_snapshot, quality_gate_status, status").eq("id", id).maybeSingle();
  if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
  if (!curData) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const cur = curData as CurRow & { quality_gate_status: string | null; status: string };
  try { assertOrgAccess(req, cur.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  // A drafted or sent email exists in a mailbox: its row may no longer change, or a second draft could follow.
  if (LOCKED.has(cur.status)) return NextResponse.json({ ok: false, error: `already_${cur.status}` }, { status: 409 });

  const patch: Record<string, unknown> = { status };
  const editedBody = str(body.body);
  const editedSubject = cur.output_type === "cold_email" ? str(body.subject) : null;
  let gateStatus = cur.quality_gate_status;
  const snapshot: Record<string, unknown> = { ...(cur.gate_snapshot ?? {}) };
  if (editedBody || editedSubject) {
    const text = editedBody ?? cur.body;
    const subject = cur.output_type === "cold_email" ? editedSubject ?? cur.subject ?? "" : null;
    const required = snapshot.required as RequiredParts | undefined;
    const forbidden = Array.isArray(snapshot.forbidden) ? (snapshot.forbidden as string[]) : [];
    const g = required ? gateMessage({ subject, body: text, forbidden, required }) : { ...lintMessage(text, forbidden), gate_version: GATE_VERSION };
    gateStatus = g.quality_gate_status;
    Object.assign(snapshot, { gate_version: g.gate_version, findings: g.findings, edited: true });
    Object.assign(patch, { body: text, subject: cur.output_type === "cold_email" ? subject : null,
      safety_score: g.safety_score, quality_gate_status: g.quality_gate_status });
  }
  if (status === "approved") {
    // A row from before the v2 gate carries no required parts: it could be approved without signature or notice.
    if (!snapshot.required) return NextResponse.json({ ok: false, error: "regenerate_required" }, { status: 422 });
    if (gateStatus === "block") return NextResponse.json({ ok: false, error: "gate_blocked", findings: snapshot.findings ?? [] }, { status: 422 });
    patch.approved_at = new Date().toISOString();
  } else {
    patch.approved_at = null; // approved_at counts toward the sampled unlock (review-policy.ts): only while approved
  }
  snapshot.auto = false; // any person's action ends the policy's decision
  patch.gate_snapshot = snapshot;

  // Conditional on the status read above: a concurrent change (another tab, gmail-draft taking the row) wins, not this one.
  const { data, error } = await supabase.from(TABLE).update(patch).eq("id", id).eq("status", cur.status).select("*").maybeSingle();
  if (isUniqueViolation(error)) return NextResponse.json({ ok: false, error: "variant_already_approved" }, { status: 409 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });

  if (status === "approved" && cur.output_type === "cold_email") {
    const { error: skipErr } = await supabase.from(TABLE).update({ status: "skipped" })
      .eq("lead_id", cur.lead_id).eq("output_type", "cold_email").neq("id", id).in("status", ["draft", "needs_edit"]);
    if (skipErr) return NextResponse.json({ ok: true, message: data, warning: `the other variant was not skipped: ${skipErr.message}` });
  }
  return NextResponse.json({ ok: true, message: data });
}

export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  const params = new URL(req.url).searchParams;
  const supabase = await outreachDb(req, params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = params.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const { data: cur, error: readErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  try { assertOrgAccess(req, (cur as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
