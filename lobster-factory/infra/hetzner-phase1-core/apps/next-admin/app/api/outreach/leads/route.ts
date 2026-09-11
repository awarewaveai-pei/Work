import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { scoreLead } from "@/lib/outreach/scoring";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

// Cold Outreach — Leads CRUD + Approve-to-Leads (task T7). Table: co_leads (migration 0048).
// Approve flow: read a co_lead_inbox row → mechanical score → insert co_leads → mark inbox approved.
// Writes ops-role gated; GET authed-only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_leads";
const LIST_LIMIT = 200;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => { const s = str(v); return s && UUID_RE.test(s) ? s : null; };

interface ScoreInput {
  name?: string | null;
  industry?: string | null;
  website?: string | null;
  social_url?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
  observation?: string | null;
  source_url?: string | null;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const supabase = await getOrgSupabaseWriteClient(url.searchParams.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const id = url.searchParams.get("id");
  if (id) {
    // Guard uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak.
    if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    try { assertOrgAccess(req, (data as Record<string, unknown>).organization_id as string | null); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    return NextResponse.json({ ok: true, lead: data });
  }

  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, uuid(url.searchParams.get("organizationId"))); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  let query = supabase.from(TABLE).select("*").order("score", { ascending: false }).limit(LIST_LIMIT);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, leads: data ?? [] });
}

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = await getOrgSupabaseWriteClient(str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  // Pre-resolve org for the manual create/update path (approve path resolves its own org from inbox row).
  let orgId: string | null;
  try { orgId = effectiveOrgId(req, uuid(body.organizationId)); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  // --- Approve-from-inbox path ---
  const fromInboxId = str(body.fromInboxId);
  if (fromInboxId) {
    if (!UUID_RE.test(fromInboxId)) return NextResponse.json({ ok: false, error: "fromInboxId must be a uuid" }, { status: 400 });
    const { data: inbox, error: inErr } = await supabase.from("co_lead_inbox").select("*").eq("id", fromInboxId).maybeSingle();
    if (inErr) return NextResponse.json({ ok: false, error: inErr.message }, { status: 500 });
    if (!inbox) return NextResponse.json({ ok: false, error: "inbox row not found" }, { status: 404 });

    const row = inbox as Record<string, unknown>;
    // Verify caller may act on this inbox item's org before promoting it to a lead.
    try { assertOrgAccess(req, row.organization_id as string | null); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    const lead: ScoreInput = {
      name: (row.normalized_name as string | null) ?? "(未命名)",
      industry: row.normalized_industry as string | null,
      website: row.website as string | null,
      social_url: row.social_url as string | null,
      email: row.email as string | null,
      phone: row.phone as string | null,
      observation: null,
      source_url: row.source_url as string | null,
    };
    const scores = scoreLead(lead, { isDuplicate: false, doNotContact: false });

    const { data: created, error: createErr } = await supabase
      .from(TABLE)
      .insert({
        organization_id: row.organization_id ?? null,
        name: lead.name ?? "(未命名)",
        industry: lead.industry,
        website: lead.website,
        social_url: lead.social_url,
        email: lead.email,
        phone: lead.phone,
        region: row.region ?? null,
        source_type: row.source_type ?? null,
        source_url: lead.source_url,
        lead_quality_score: scores.lead_quality_score,
        contactability_score: scores.contactability_score,
        icp_score: scores.icp_score,
        score: scores.score,
        priority: scores.priority,
        status: "qualified",
      })
      .select("*")
      .single();
    if (createErr) return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });

    await supabase.from("co_lead_inbox").update({ inbox_status: "approved", updated_at: new Date().toISOString() }).eq("id", fromInboxId);
    return NextResponse.json({ ok: true, lead: created }, { status: 201 });
  }

  // --- Manual create / update path ---
  const id = str(body.id);
  if (id && !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const name = str(body.name);
  if (!name) return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });

  const base: ScoreInput = {
    name,
    industry: str(body.industry),
    website: str(body.website),
    social_url: str(body.socialUrl),
    email: str(body.email),
    phone: str(body.phone),
    contact_name: str(body.contactName),
    contact_role: str(body.contactRole),
    observation: str(body.observation),
    source_url: str(body.sourceUrl),
  };
  const scores = scoreLead(base, { isDuplicate: false, doNotContact: false });

  const fields = {
    organization_id: orgId,
    name,
    industry: base.industry,
    website: base.website,
    social_url: base.social_url,
    contact_name: base.contact_name,
    contact_role: base.contact_role,
    email: base.email,
    phone: base.phone,
    region: str(body.region),
    source_type: str(body.sourceType),
    source_url: base.source_url,
    observation: base.observation,
    lead_quality_score: scores.lead_quality_score,
    contactability_score: scores.contactability_score,
    icp_score: scores.icp_score,
    score: scores.score,
    priority: scores.priority,
  };

  if (id) {
    // Verify caller owns this lead before overwriting.
    const { data: cur, error: curErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
    if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
    if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    try { assertOrgAccess(req, (cur as Record<string, unknown>).organization_id as string | null); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, lead: data });
  }

  const { data, error } = await supabase.from(TABLE).insert({ ...fields, status: "new" }).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lead: data }, { status: 201 });
}

export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  const params = new URL(req.url).searchParams;
  const supabase = await getOrgSupabaseWriteClient(params.get("orgSlug"));
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
