// GET/PUT /api/tools/presets/brand-kit -- the banner brand kit of one organization (card C6), kept in
// organizations.metadata.client_config.bannerKit beside brandColors and the CIS brandKit (no migration). Under the design
// door's /api/tools/presets prefix so the design door serves it with the banner page.
//   GET: a customer reads only its own organization (naming another = 403); staff name any, or get the default org.
//   PUT: staff only, owner/admin (canWriteTenantConfig) -- the same tier as the brand-colors and cis routes that write
//        this same blob. Replaces bannerKit only; every other client_config key is kept.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { assertOrgAccess, effectiveOrgId, OrgAccessError, resolveTenant, staffOnly, toOrgAccessResponse } from "@/lib/tenant-guard";
import { kitFromClientConfig, sanitizeBrandKit } from "@/app/(shell)/tools/banner/kit/brand-kit";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The org a request acts for, or the Response refusing it. An explicitly named org a customer may not see is a 403. */
function kitOrg(request: Request, requested: string | null): string | Response {
  let orgId: string | null;
  try {
    if (requested) assertOrgAccess(request, requested);
    orgId = effectiveOrgId(request, requested ?? process.env.POD_DESIGNS_DEFAULT_ORG_ID ?? null);
  } catch (e) {
    if (e instanceof OrgAccessError) return toOrgAccessResponse(e);
    throw e;
  }
  if (!orgId || !UUID.test(orgId)) return NextResponse.json({ ok: false, error: "orgId_required" }, { status: 400 });
  return orgId;
}

function canEdit(request: Request): boolean {
  return resolveTenant(request).userKind === "staff" && canWriteTenantConfig(resolveOpsRole(request).role);
}

export async function GET(request: Request) {
  const org = kitOrg(request, new URL(request.url).searchParams.get("orgId")?.trim() || null);
  if (org instanceof Response) return org;
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  // Only the brand keys: client_config also holds SSH / WordPress settings, which never leave this route.
  const { data, error } = await supabase
    .from("organizations")
    .select("id,name,bannerKit:metadata->client_config->bannerKit,brandColors:metadata->client_config->brandColors,cis:metadata->client_config->brandKit")
    .eq("id", org)
    .maybeSingle();
  if (error) {
    console.error("[brand-kit] read failed:", error.message);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "org_not_found" }, { status: 404 });
  const row = data as unknown as { name?: string; bannerKit?: unknown; brandColors?: never; cis?: never };
  const found = kitFromClientConfig(row.name ?? "", row);
  return NextResponse.json({ ok: true, orgId: org, kit: found ? { ...found.kit, orgId: org } : null, saved: found?.saved ?? false, canEdit: canEdit(request) });
}

export async function PUT(request: Request) {
  const denied = staffOnly(request);
  if (denied) return denied;
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const org = kitOrg(request, typeof body.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null);
  if (org instanceof Response) return org;
  const kit = sanitizeBrandKit(body.kit);
  if (!kit) return NextResponse.json({ ok: false, error: "kit needs at least one #rrggbb colour" }, { status: 400 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  const { data: row, error: readErr } = await supabase.from("organizations").select("id,metadata").eq("id", org).maybeSingle();
  if (readErr || !row) return NextResponse.json({ ok: false, error: "org_not_found" }, { status: 404 });
  const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
  const clientConfig = (metadata.client_config && typeof metadata.client_config === "object" ? metadata.client_config : {}) as Record<string, unknown>;
  const next = { ...metadata, client_config: { ...clientConfig, bannerKit: kit } };
  const { error: writeErr } = await supabase.from("organizations").update({ metadata: next }).eq("id", org);
  if (writeErr) {
    console.error("[brand-kit] write failed:", writeErr.message);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 409 });
  }
  const { error: auditErr } = await supabase.from("ops_audit_events").insert({
    organization_id: org,
    actor_role: resolved.role,
    event_type: "brand_kit_updated",
    target_type: "organizations",
    target_id: org,
    trace_id: randomUUID(),
    payload: { colors: kit.colors.length, hasLogo: !!kit.logo, role_source: resolved.source },
  });
  if (auditErr) console.warn("[brand-kit] audit insert failed:", auditErr.message);
  return NextResponse.json({ ok: true, orgId: org, kit: { ...kit, orgId: org }, saved: true, canEdit: true });
}
