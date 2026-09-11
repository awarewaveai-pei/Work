import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

// Cold Outreach — Service Profile CRUD (task T3). Table: co_service_profiles (migration 0048).
// Access model (§B0.1): service-role-only table; this route is the only accessor. Writes are
// ops-role gated (canManageOutreach = owner/admin/operator); GET is allowed for any authed user
// (viewer = read-only). Middleware already requires a valid session for /api/outreach/*.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_service_profiles";
const LIST_LIMIT = 200;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

// Guard uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accept either a real array of strings or a comma-separated string from a form field.
const arr = (v: unknown): string[] | null => {
  if (Array.isArray(v)) {
    const a = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((s) => s.trim());
    return a.length ? a : null;
  }
  if (typeof v === "string" && v.trim()) {
    const a = v.split(",").map((s) => s.trim()).filter(Boolean);
    return a.length ? a : null;
  }
  return null;
};

// GET /api/outreach/service-profiles            → list (newest first)
// GET /api/outreach/service-profiles?id=<uuid>  → single
// GET ...?organizationId=<uuid>                 → scope to one client
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const supabase = await getOrgSupabaseWriteClient(params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const id = params.get("id");
  if (id) {
    if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    try { assertOrgAccess(req, (data as Record<string, unknown>).organization_id as string | null); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    return NextResponse.json({ ok: true, profile: data });
  }

  const rawOrgId = params.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, profiles: data ?? [] });
}

// POST — create (no id) or update (with id). Body uses camelCase keys.
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

  const id = str(body.id);
  if (id && !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const service_name = str(body.serviceName);
  if (!service_name) return NextResponse.json({ ok: false, error: "serviceName required" }, { status: 400 });

  // Content-only fields shared between INSERT and UPDATE.
  const contentFields = {
    industry: str(body.industry),
    service_name,
    positioning: str(body.positioning),
    service_description: str(body.serviceDescription),
    usp: str(body.usp),
    price_position: str(body.pricePosition),
    tone: str(body.tone),
    forbidden_words: arr(body.forbiddenWords),
    replacement_words: arr(body.replacementWords),
    compliance_rules: str(body.complianceRules),
    sensitive_industry_type: str(body.sensitiveIndustryType),
  };

  if (id) {
    // UPDATE — verify caller owns the existing row before mutating.
    const { data: cur, error: readErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
    if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
    if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    try { assertOrgAccess(req, (cur as Record<string, unknown>).organization_id as string | null); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    // organization_id is NOT updated — re-assigning a profile to another org is not allowed.
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...contentFields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, profile: data });
  }

  // INSERT — pin organization_id via effectiveOrgId (client → own org; staff → body value).
  const rawInsertOrgId = str(body.organizationId);
  if (rawInsertOrgId && !UUID_RE.test(rawInsertOrgId)) {
    return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  }
  let insertOrgId: string | null;
  try { insertOrgId = effectiveOrgId(req, rawInsertOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...contentFields, organization_id: insertOrgId })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, profile: data }, { status: 201 });
}

// DELETE /api/outreach/service-profiles?id=<uuid>
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
