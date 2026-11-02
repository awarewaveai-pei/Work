import { NextResponse } from "next/server";
import { outreachDb } from "@/lib/outreach/db-client";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

// Cold Outreach -- the review queue (card C15.2, SPEC D23): what the pipeline left for a person. Third-party evidence
// (pending) and first emails still in 'draft' (manual profile, sampled out, lint warn, fact check not supported), each
// with the evidence it cites and the notice line it carries. A manual-prompt row is a prompt, not an email: not listed.
// Reads only; approving / returning goes through the evidence and messages PATCH routes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_COLS = "id, organization_id, lead_id, variant_label, subject, body, quality_gate_status, gate_snapshot, evidence_snapshot, prompt_snapshot, created_at, co_leads(name)";
const EV_COLS = "id, organization_id, lead_id, claim, excerpt, source_url, source_label, source_date, created_at, co_leads(name)";

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const supabase = await outreachDb(req, params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const rawOrgId = params.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  let ev = supabase.from("co_evidence").select(EV_COLS).eq("status", "pending").order("created_at").limit(LIMIT);
  let msg = supabase.from("co_messages").select(MSG_COLS).eq("output_type", "cold_email").eq("status", "draft")
    .neq("prompt_snapshot->>mode", "manual_prompt").order("created_at").limit(LIMIT);
  if (orgFilter) { ev = ev.eq("organization_id", orgFilter); msg = msg.eq("organization_id", orgFilter); }
  const [evidence, messages] = await Promise.all([ev, msg]);
  if (evidence.error) return NextResponse.json({ ok: false, error: evidence.error.message }, { status: 500 });
  if (messages.error) return NextResponse.json({ ok: false, error: messages.error.message }, { status: 500 });

  const rows = (messages.data ?? []) as unknown as Array<{ evidence_snapshot: { evidence_ids?: string[] } | null }>;
  const cited = [...new Set(rows.flatMap((r) => r.evidence_snapshot?.evidence_ids ?? []).filter((id) => UUID_RE.test(id)))];
  let sources: unknown[] = [];
  if (cited.length) {
    const { data, error } = await supabase.from("co_evidence").select("id, claim, source_url, source_label").in("id", cited);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    sources = data ?? [];
  }
  return NextResponse.json({ ok: true, evidence: evidence.data ?? [], messages: messages.data ?? [], sources });
}
