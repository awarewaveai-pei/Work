import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "../../../../../../lib/ops-role";
import { getSupabaseReadClient, getSupabaseWriteClient } from "../../../../../../lib/supabase-server";

interface PatchTenantConfigBody {
  status?: "active" | "inactive" | "suspended";
  defaultLocale?: string;
  defaultTimezone?: string;
}

const ALLOWED_FIELDS = ["status", "defaultLocale", "defaultTimezone"] as const;
const SUPPORTED_STATUSES = ["active", "inactive", "suspended"] as const;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizePatch(body: PatchTenantConfigBody): Record<string, string> {
  const patch: Record<string, string> = {};
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.defaultLocale === "string") patch.default_locale = body.defaultLocale;
  if (typeof body.defaultTimezone === "string") patch.default_timezone = body.defaultTimezone;
  return patch;
}

function invalidPatchKeys(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((k) => !ALLOWED_FIELDS.includes(k as (typeof ALLOWED_FIELDS)[number]));
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "tenant_id_must_be_uuid" }, { status: 400 });
  }

  const supabase = getSupabaseReadClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_read_not_configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("id,slug,name,status,default_locale,default_timezone")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "tenant_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    tenant: {
      id: data.id,
      slug: data.slug,
      name: data.name,
      status: data.status,
      defaultLocale: data.default_locale,
      defaultTimezone: data.default_timezone,
    },
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = resolveOpsRole(request);
  const role = resolved.role;
  if (!canWriteTenantConfig(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "tenant_id_must_be_uuid" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const badKeys = invalidPatchKeys(body);
  if (badKeys.length > 0) {
    return NextResponse.json({ ok: false, error: "unsupported_patch_fields", fields: badKeys }, { status: 400 });
  }

  const patch = normalizePatch(body as PatchTenantConfigBody);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  if (patch.status && !SUPPORTED_STATUSES.includes(patch.status as (typeof SUPPORTED_STATUSES)[number])) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_write_not_configured", hint: "Set SUPABASE_SERVICE_ROLE_KEY for patch routes." },
      { status: 503 },
    );
  }

  const { data: before, error: beforeError } = await supabase
    .from("organizations")
    .select("status,default_locale,default_timezone")
    .eq("id", id)
    .single();

  if (beforeError || !before) {
    return NextResponse.json({ ok: false, error: "tenant_not_found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("organizations")
    .update(patch)
    .eq("id", id)
    .select("id,slug,name,status,default_locale,default_timezone")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "tenant_update_failed", details: error?.message }, { status: 409 });
  }

  await supabase.from("ops_audit_events").insert({
    organization_id: id,
    actor_role: role,
    event_type: "tenant_config_updated",
    target_type: "organizations",
    target_id: id,
    trace_id: crypto.randomUUID(),
    payload: {
      fields: Object.keys(patch),
      role_source: resolved.source,
      before: {
        status: before.status,
        defaultLocale: before.default_locale,
        defaultTimezone: before.default_timezone,
      },
      after: {
        status: data.status,
        defaultLocale: data.default_locale,
        defaultTimezone: data.default_timezone,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    tenant: {
      id: data.id,
      slug: data.slug,
      name: data.name,
      status: data.status,
      defaultLocale: data.default_locale,
      defaultTimezone: data.default_timezone,
    },
  });
}
