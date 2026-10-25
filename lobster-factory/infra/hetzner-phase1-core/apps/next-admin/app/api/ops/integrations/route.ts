import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseWriteClient } from "@/lib/supabase-server";
import { checkIntegrationHealth } from "@/lib/repair-os/integration-health";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import type { OpsRole } from "@/lib/ops-contracts";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_RE = /^[a-z][a-z0-9_]{0,63}$/;
const SOURCES = new Set(["manual", "n8n", "trigger", "build_console", "cli"]);
const STATUSES = new Set(["pending", "active", "failed", "revoked"]);

export interface AssetRow {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  asset_type: string;
  environment: string;
  primary_url: string | null;
  provider: string | null;
  status: string;
}

export interface IntegrationRow {
  id: string;
  organization_id: string;
  asset_id: string | null;
  provider: string;
  secret_ref: string | null;
  external_hint: string | null;
  api_metadata: Record<string, unknown>;
  provisioning_source: string;
  status: string;
  last_error: string | null;
  last_tested_at?: string | null;
  last_seen_at?: string | null;
  created_at: string;
}

// GET ?organization_id=<uuid> -- one client's assets and connections. Never every organization: every WordPress buyer is
// one (the page reads the same way, app/(shell)/ops/integrations/page.tsx).
export async function GET(req: Request) {
  const resolved = resolveOpsRole(req);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden", role: resolved.role }, { status: 403 });
  }

  const organizationId = new URL(req.url).searchParams.get("organization_id") ?? "";
  if (!UUID_RE.test(organizationId)) {
    return NextResponse.json({ ok: false, error: "organization_id_required" }, { status: 400 });
  }
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const orgRes = await supabase
    .from("organizations")
    .select("id,slug,name,type,status,metadata,created_at")
    .eq("id", organizationId);

  if (orgRes.error) {
    return NextResponse.json(
      { ok: false, error: "organizations_fetch_failed", details: orgRes.error.message },
      { status: 500 },
    );
  }

  const [assetRes, integrationRes] = await Promise.all([
    supabase
      .from("assets")
      .select("id,organization_id,slug,name,asset_type,environment,primary_url,provider,status")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("tenant_integration_bindings")
      .select("id,organization_id,asset_id,provider,secret_ref,external_hint,api_metadata,provisioning_source,status,last_error,last_tested_at,last_seen_at,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
  ]);

  const assetsReady = !assetRes.error;
  const integrationsReady = !integrationRes.error;

  return NextResponse.json({
    ok: true,
    organizations: orgRes.data ?? [],
    assets: assetsReady ? ((assetRes.data ?? []) as AssetRow[]) : [],
    integrations: integrationsReady ? ((integrationRes.data ?? []) as IntegrationRow[]) : [],
    readiness: {
      assets_table_ready: assetsReady,
      integrations_table_ready: integrationsReady,
      assets_error: assetRes.error?.message ?? null,
      integrations_error: integrationRes.error?.message ?? null,
    },
  });
}

export async function POST(req: Request) {
  const resolved = resolveOpsRole(req);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }

  const bodyResult = await readJson(req);
  if (bodyResult.ok === false) return bodyResult.response;

  const body = bodyResult.body;
  const validation = validateUpsert(body);
  if (validation) {
    return NextResponse.json({ ok: false, error: validation }, { status: 400 });
  }

  const organizationId = String(body.organization_id);
  const assetId = cleanOptionalString(body.asset_id);
  const provider = normalizeProvider(String(body.provider));

  const ownershipError = await verifyOwnership(supabase, organizationId, assetId);
  if (ownershipError) {
    return NextResponse.json({ ok: false, error: ownershipError }, { status: 400 });
  }
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const now = new Date().toISOString();
  const metadata = normalizeMetadata(body.api_metadata);
  const row = {
    organization_id: organizationId,
    workspace_id: cleanOptionalString(body.workspace_id),
    asset_id: assetId,
    provider,
    secret_ref: cleanOptionalString(body.secret_ref),
    external_hint: cleanOptionalString(body.external_hint),
    api_metadata: {
      ...metadata,
      managed_by: metadata.managed_by ?? "repair_os",
      updated_from: "ops_integrations_ui",
    },
    provisioning_source: normalizeSource(body.provisioning_source),
    status: normalizeStatus(body.status, "pending"),
    last_error: cleanOptionalString(body.last_error),
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("tenant_integration_bindings")
    .upsert(row, { onConflict: "organization_id,provider" })
    .select("id,organization_id,asset_id,provider,status")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: "integration_upsert_failed", details: error.message }, { status: 409 });
  }

  await writeAuditEvent(supabase, {
    organizationId,
    eventType: "integration.upserted",
    targetId: data?.id ?? `${organizationId}:${provider}`,
    payload: {
      provider,
      asset_id: assetId,
      status: row.status,
      provisioning_source: row.provisioning_source,
      has_secret_ref: !!row.secret_ref,
      has_external_hint: !!row.external_hint,
      actor_role: resolved.role,
      role_source: resolved.source,
    },
    actorRole: resolved.role,
  });

  return NextResponse.json({ ok: true, integration: data });
}

export async function PATCH(req: Request) {
  const resolved = resolveOpsRole(req);
  // Coarse early gate: operator+ minimum (canMutateIntegration does fine-grained check later).
  // Ensures DB client construction and body parsing are skipped for unauthorized callers.
  if (!canWriteTenantConfig(resolved.role) && resolved.role !== "operator") {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }

  const bodyResult = await readJson(req);
  if (bodyResult.ok === false) return bodyResult.response;

  const body = bodyResult.body;
  const id = cleanOptionalString(body.id);
  const action = cleanOptionalString(body.action);
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "id must be UUID" }, { status: 400 });
  }
  if (!action || !["validate", "activate", "revoke", "mark_failed"].includes(action)) {
    return NextResponse.json({ ok: false, error: "action must be validate, activate, revoke, or mark_failed" }, { status: 400 });
  }
  if (!canMutateIntegration(action, resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role, action }, { status: 403 });
  }

  const { data: current, error: fetchError } = await supabase
    .from("tenant_integration_bindings")
    .select("id,organization_id,asset_id,provider,secret_ref,external_hint,api_metadata,status,last_seen_at")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return NextResponse.json({ ok: false, error: "integration_not_found", details: fetchError?.message ?? null }, { status: 404 });
  }
  try { assertOrgAccess(req, String((current as Record<string, unknown>).organization_id)); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const now = new Date().toISOString();
  const currentMeta = normalizeMetadata((current as Record<string, unknown>).api_metadata);
  const health = action === "validate"
    ? await checkIntegrationHealth({
      provider: String((current as Record<string, unknown>).provider),
      secretRef: cleanOptionalString((current as Record<string, unknown>).secret_ref),
      externalHint: cleanOptionalString((current as Record<string, unknown>).external_hint),
      metadata: currentMeta,
    })
    : null;
  const update = buildActionUpdate(action, current as Record<string, unknown>, now, health);
  const { data, error } = await supabase
    .from("tenant_integration_bindings")
    .update({
      ...update,
      api_metadata: {
        ...currentMeta,
        last_ui_action: action,
        last_ui_action_at: now,
        ...(health ? { last_health_check: health } : {}),
      },
      updated_at: now,
    })
    .eq("id", id)
    .select("id,organization_id,asset_id,provider,status,last_error,last_tested_at,last_seen_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: "integration_update_failed", details: error.message }, { status: 409 });
  }

  await writeAuditEvent(supabase, {
    organizationId: String((current as Record<string, unknown>).organization_id),
    eventType: `integration.${action}`,
    targetId: id,
    payload: {
      provider: (current as Record<string, unknown>).provider,
      asset_id: (current as Record<string, unknown>).asset_id ?? null,
      status: data?.status ?? null,
      validation_scope: health?.scope ?? null,
      validation_summary: health?.summary ?? null,
      actor_role: resolved.role,
      role_source: resolved.source,
    },
    actorRole: resolved.role,
  });

  return NextResponse.json({ ok: true, integration: data });
}

function canMutateIntegration(action: string, role: OpsRole): boolean {
  if (action === "validate") return role === "owner" || role === "admin" || role === "operator";
  return canWriteTenantConfig(role);
}

type JsonResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

async function readJson(req: Request): Promise<JsonResult> {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, response: NextResponse.json({ ok: false, error: "expected object" }, { status: 400 }) };
    }
    return { ok: true, body: raw as Record<string, unknown> };
  } catch {
    return { ok: false, response: NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }) };
  }
}

function validateUpsert(body: Record<string, unknown>): string | null {
  if (typeof body.organization_id !== "string" || !UUID_RE.test(body.organization_id)) {
    return "organization_id must be UUID";
  }
  const assetId = cleanOptionalString(body.asset_id);
  if (assetId && !UUID_RE.test(assetId)) return "asset_id must be UUID when set";
  const workspaceId = cleanOptionalString(body.workspace_id);
  if (workspaceId && !UUID_RE.test(workspaceId)) return "workspace_id must be UUID when set";
  if (typeof body.provider !== "string" || !PROVIDER_RE.test(normalizeProvider(body.provider))) {
    return "provider must be lowercase_snake";
  }
  if (body.secret_ref != null && typeof body.secret_ref !== "string") return "secret_ref invalid";
  if (body.external_hint != null && typeof body.external_hint !== "string") return "external_hint invalid";
  if (body.last_error != null && typeof body.last_error !== "string") return "last_error invalid";
  if (body.api_metadata != null && (typeof body.api_metadata !== "object" || Array.isArray(body.api_metadata))) {
    return "api_metadata must be object";
  }
  const source = normalizeSource(body.provisioning_source);
  if (!SOURCES.has(source)) return "provisioning_source invalid";
  const status = normalizeStatus(body.status, "pending");
  if (!STATUSES.has(status)) return "status invalid";
  return null;
}

async function verifyOwnership(
  supabase: ReturnType<typeof getSupabaseWriteClient>,
  organizationId: string,
  assetId: string | null,
): Promise<string | null> {
  if (!supabase) return "supabase_write_not_configured";

  const orgRes = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgRes.error) return orgRes.error.message;
  if (!orgRes.data) return "organization_not_found";

  if (!assetId) return null;

  const assetRes = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (assetRes.error) return assetRes.error.message;
  if (!assetRes.data) return "asset_not_found_for_organization";
  return null;
}

function buildActionUpdate(
  action: string,
  current: Record<string, unknown>,
  now: string,
  health: Awaited<ReturnType<typeof checkIntegrationHealth>> | null,
): Record<string, unknown> {
  if (action === "revoke") {
    return { status: "revoked", last_error: null };
  }
  if (action === "activate") {
    return { status: "active", last_error: null, last_seen_at: now };
  }
  if (action === "mark_failed") {
    return { status: "failed", last_error: "Marked failed from Integrations UI." };
  }

  if (health) {
    return {
      status: health.status,
      last_error: health.ok ? null : health.summary,
      last_tested_at: health.checkedAt,
      last_seen_at: health.ok ? health.checkedAt : cleanOptionalString(current.last_seen_at),
    };
  }

  return {
    status: "active",
    last_error: null,
    last_tested_at: now,
    last_seen_at: now,
  };
}

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase().replace(/[-\s]+/g, "_");
}

function normalizeSource(value: unknown): string {
  const source = typeof value === "string" ? value.trim() : "";
  return SOURCES.has(source) ? source : "manual";
}

function normalizeStatus(value: unknown, fallback: string): string {
  const status = typeof value === "string" ? value.trim() : "";
  return STATUSES.has(status) ? status : fallback;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function cleanOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function writeAuditEvent(
  supabase: ReturnType<typeof getSupabaseWriteClient>,
  input: {
    organizationId: string;
    eventType: string;
    targetId: string;
    payload: Record<string, unknown>;
    actorRole: OpsRole;
  },
) {
  if (!supabase) return;
  await supabase.from("ops_audit_events").insert({
    organization_id: input.organizationId,
    actor_role: input.actorRole,
    event_type: input.eventType,
    target_type: "tenant_integration_binding",
    target_id: input.targetId,
    trace_id: `integration-${Date.now()}`,
    payload: input.payload,
  });
}
