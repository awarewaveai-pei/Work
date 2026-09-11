import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { effectiveOrgId, assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

// Cold Outreach — Connector account CRUD (task T4). Table: co_connector_accounts (migration 0048).
//
// SECURITY RED LINE (PART H §H2): this stores connector METADATA only. `credentials_ref` is the
// NAME of a vault entry, NEVER the secret value. The actual BYO API-key bytes live in a runtime
// secret store (Supabase Vault — separate gated decision), not in this table. We actively REJECT a
// credentials_ref that looks like a real secret to stop an operator pasting a key by mistake.
//
// Writes are ops-role gated (canManageOutreach). GET is authed-only (middleware) for viewer read.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_connector_accounts";
const LIST_LIMIT = 200;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

// Validate uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak
// (same pattern as suppression/route.ts critic #1).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Heuristic guard: does this string look like an actual API key/secret rather than a vault NAME?
// Common provider prefixes + long opaque high-entropy tokens. Vault names are short slugs.
function looksLikeSecret(s: string): boolean {
  const v = s.trim();
  if (/^(sk-|re_|tr_|AIza|ghp_|gho_|xox[baprs]-|pat-|key-|Bearer\s)/i.test(v)) return true;
  // long, no spaces, mixed alnum/-/_ → almost certainly a token, not a slug name
  if (v.length >= 40 && !/\s/.test(v) && /[A-Za-z]/.test(v) && /[0-9]/.test(v)) return true;
  return false;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const supabase = await getOrgSupabaseWriteClient(url.searchParams.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const rawOrgId = url.searchParams.get("organizationId");
  if (rawOrgId && !UUID_RE.test(rawOrgId)) return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  let orgFilter: string | null;
  try { orgFilter = effectiveOrgId(req, rawOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  let query = supabase
    .from(TABLE)
    .select("id, organization_id, connector_name, connector_type, is_enabled, credentials_ref, settings, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (orgFilter) query = query.eq("organization_id", orgFilter);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, connectors: data ?? [] });
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

  const id = str(body.id);
  if (id && !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "id must be a uuid" }, { status: 400 });
  const connector_name = str(body.connectorName);
  const connector_type = str(body.connectorType);
  if (!connector_name) return NextResponse.json({ ok: false, error: "connectorName required" }, { status: 400 });
  if (!connector_type) return NextResponse.json({ ok: false, error: "connectorType required" }, { status: 400 });

  const credentials_ref = str(body.credentialsRef);
  if (credentials_ref && looksLikeSecret(credentials_ref)) {
    return NextResponse.json(
      { ok: false, error: "credentials_ref must be a VAULT KEY NAME, not the secret value. Never paste a real API key here." },
      { status: 400 },
    );
  }

  const is_enabled = typeof body.isEnabled === "boolean" ? body.isEnabled : true;
  const settings = (body.settings ?? null) as object | null;

  if (id) {
    // Verify caller owns this connector before patching.
    const { data: cur, error: curErr } = await supabase.from(TABLE).select("organization_id").eq("id", id).maybeSingle();
    if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
    if (!cur) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    try { assertOrgAccess(req, (cur as Record<string, unknown>).organization_id as string | null); }
    catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

    // UPDATE: patch ONLY fields meant to change here. NEVER null-overwrite organization_id (the owner
    // client, set at creation) or credentials_ref (owned by the /secret route) on a partial update such
    // as toggle — that would silently un-assign the connector from its client. (critic: org-wipe Major)
    const patch: Record<string, unknown> = {
      connector_name,
      connector_type,
      is_enabled,
      settings,
      updated_at: new Date().toISOString(),
    };
    if (body.credentialsRef !== undefined) patch.credentials_ref = credentials_ref;
    if (body.organizationId !== undefined) {
      // effectiveOrgId: staff may re-assign; client is pinned to own org (prevents IDOR re-assignment).
      const rawReassignOrgId = str(body.organizationId);
      if (rawReassignOrgId && !UUID_RE.test(rawReassignOrgId)) {
        return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
      }
      let resolvedOrg: string | null;
      try { resolvedOrg = effectiveOrgId(req, rawReassignOrgId); }
      catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
      patch.organization_id = resolvedOrg;
    }
    const { data, error } = await supabase.from(TABLE).update(patch).eq("id", id).select("*").maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, connector: data });
  }

  const rawInsertOrgId = str(body.organizationId);
  if (rawInsertOrgId && !UUID_RE.test(rawInsertOrgId)) {
    return NextResponse.json({ ok: false, error: "organizationId must be a uuid" }, { status: 400 });
  }
  let insertOrgId: string | null;
  try { insertOrgId = effectiveOrgId(req, rawInsertOrgId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ organization_id: insertOrgId, connector_name, connector_type, is_enabled, credentials_ref, settings })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, connector: data }, { status: 201 });
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
