import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

// Cold Outreach — Suppression list (task T12). Table: co_suppression_list (migration 0048).
// The send-time "do not contact" backbone. Writes ops-role gated; GET authed-only.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_suppression_list";
const LIST_LIMIT = 500;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
// Validate uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASONS = new Set([
  "manual_opt_out", "unsubscribe", "hard_bounce", "soft_bounce_limit", "complaint",
  "spam_report", "invalid_email", "role_account_blocked", "legal_request", "domain_block", "user_manual",
]);
const SCOPES = new Set(["email", "domain", "company", "campaign", "global"]);
const APPLIES = new Set(["cold", "marketing", "transactional", "all"]);

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const supabase = await getOrgSupabaseWriteClient(params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const rawOrgId = params.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entries: data ?? [] });
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

  const email = str(body.email)?.toLowerCase() ?? null;
  const domain = str(body.domain)?.toLowerCase().replace(/^www\./, "") ?? null;
  const company_name = str(body.companyName);
  if (!email && !domain && !company_name) {
    return NextResponse.json({ ok: false, error: "email, domain or companyName required" }, { status: 400 });
  }
  const reason = str(body.reason) ?? "user_manual";
  if (!REASONS.has(reason)) return NextResponse.json({ ok: false, error: "invalid reason" }, { status: 400 });
  const scope = str(body.scope) ?? (email ? "email" : domain ? "domain" : "company");
  if (!SCOPES.has(scope)) return NextResponse.json({ ok: false, error: "invalid scope" }, { status: 400 });
  const applies_to = str(body.appliesTo) ?? "all";
  if (!APPLIES.has(applies_to)) return NextResponse.json({ ok: false, error: "invalid appliesTo" }, { status: 400 });

  // uuid-typed columns validated up front so a bad id returns a clean 400, not a raw PG 22P02 leak (critic #1).
  const rawBodyOrgId = str(body.organizationId);
  if (rawBodyOrgId && !UUID_RE.test(rawBodyOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let organizationId: string | null;
  try { organizationId = effectiveOrgId(req, rawBodyOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const leadId = str(body.leadId);
  if (leadId && !UUID_RE.test(leadId)) return NextResponse.json({ ok: false, error: "leadId must be a uuid" }, { status: 400 });
  // jsonb evidence must be an object, not a scalar/array (critic #3).
  const evidence = body.evidence && typeof body.evidence === "object" && !Array.isArray(body.evidence) ? (body.evidence as object) : null;

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      organization_id: organizationId,
      email,
      domain,
      company_name,
      lead_id: leadId,
      reason,
      source: str(body.source) ?? "manual",
      applies_to,
      scope,
      evidence,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entry: data }, { status: 201 });
}

// DELETE ?id — un-suppress. Requires二次確認 in the UI (irreversible-ish: re-enables contact).
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
