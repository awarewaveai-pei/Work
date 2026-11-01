import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { outreachDb } from "@/lib/outreach/db-client";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { fetchRemoteFile, RemoteFileError } from "@/lib/collect/net/remote-file";
import { humanApprovedCount, SAMPLED_MIN_HUMAN_APPROVED } from "@/lib/outreach/review-policy";

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
  const supabase = await outreachDb(req, params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const id = params.get("id");
  if (id) {
    if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const orgId = (data as Record<string, unknown>).organization_id as string | null;
    try { assertOrgAccess(req, orgId); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
    // The count that unlocks sampled review (SPEC D23), for the page to enable that button.
    let humanApproved: number;
    try { humanApproved = await humanApprovedCount(supabase, id, orgId); }
    catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "count failed" }, { status: 500 }); }
    return NextResponse.json({ ok: true, profile: data, humanApproved, sampledNeeds: SAMPLED_MIN_HUMAN_APPROVED });
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

// The review policy and privacy page (SPEC D20, D23): PATCH only, each field changed only when its key is in the body
// (POST rewrites every content field, so they never ride on it).
//   privacyUrl: https, answers 200 to one GET now, and privacyChecklistConfirmed (the operator ticked every item of the
//     D20 list on the page; the system does not read the page's content). "" removes it.
//   reviewMode "sampled": only after SAMPLED_MIN_HUMAN_APPROVED first emails of this profile were approved by a person.
async function policyFields(body: Record<string, unknown>, profileId: string, orgId: string | null,
  db: NonNullable<Awaited<ReturnType<typeof outreachDb>>>): Promise<Record<string, unknown> | Response> {
  const out: Record<string, unknown> = {};
  if ("privacyUrl" in body) {
    const url = str(body.privacyUrl);
    if (url) {
      if (body.privacyChecklistConfirmed !== true) return NextResponse.json({ ok: false, error: "privacy_checklist_required" }, { status: 400 });
      try {
        await fetchRemoteFile(url, { maxBytes: 200_000, timeoutMs: 8_000, accept: () => true, keepPrefix: true });
      } catch (e) {
        if (e instanceof RemoteFileError) return NextResponse.json({ ok: false, error: "privacy_url_unreachable", reason: e.reason }, { status: 400 });
        throw e;
      }
    }
    out.privacy_url = url;
  }
  if ("reviewSamplePct" in body) {
    const pct = body.reviewSamplePct;
    // never 0: a sampled profile always sends some emails to a person (the only early warning for a drifting model)
    if (typeof pct !== "number" || !Number.isInteger(pct) || pct < 1 || pct > 100) {
      return NextResponse.json({ ok: false, error: "reviewSamplePct must be an integer from 1 to 100" }, { status: 400 });
    }
    out.review_sample_pct = pct;
  }
  if ("reviewMode" in body) {
    const mode = body.reviewMode;
    if (mode !== "manual" && mode !== "sampled") return NextResponse.json({ ok: false, error: "reviewMode must be manual or sampled" }, { status: 400 });
    if (mode === "sampled") {
      const n = await humanApprovedCount(db, profileId, orgId);
      if (n < SAMPLED_MIN_HUMAN_APPROVED) {
        return NextResponse.json({ ok: false, error: "sampled_locked", approved: n, needed: SAMPLED_MIN_HUMAN_APPROVED }, { status: 409 });
      }
    }
    out.review_mode = mode;
  }
  return out;
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

  const supabase = await outreachDb(req, str(body.orgSlug));
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

// PATCH { id, privacyUrl?, privacyChecklistConfirmed?, reviewMode?, reviewSamplePct?, orgSlug? }
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }
  const supabase = await outreachDb(req, str(body.orgSlug));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });
  const id = str(body.id);
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const { data: cur, error: readErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const orgId = (cur as Record<string, unknown>).organization_id as string | null;
  try { assertOrgAccess(req, orgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let policy: Record<string, unknown> | Response;
  try { policy = await policyFields(body, id, orgId, supabase); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "policy check failed" }, { status: 500 }); }
  if (policy instanceof Response) return policy;
  if (Object.keys(policy).length === 0) return NextResponse.json({ ok: false, error: "nothing to change" }, { status: 400 });
  const { data, error } = await supabase.from(TABLE).update({ ...policy, updated_at: new Date().toISOString() })
    .eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, profile: data });
}

// DELETE /api/outreach/service-profiles?id=<uuid>
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
