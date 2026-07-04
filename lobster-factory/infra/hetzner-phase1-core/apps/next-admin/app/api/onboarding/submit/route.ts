import { NextResponse } from "next/server";
import { resolveOpsRole } from "../../../../lib/ops-role";
import { timingSafeEqual } from "../../../../lib/ops-inbox/verifyIngestToken";
import { getSupabaseWriteClient, getSupabaseServerClient } from "../../../../lib/supabase-server";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "../../../../lib/tenant-guard";
import type { IntakeForm } from "../../../../lib/onboarding/intake-form";
import { coerceFluentFormPayload } from "../../../../lib/onboarding/coerce-fluent-form";

// Auth: Supabase session (owner/admin/operator) OR server-to-server x-ops-sync-key.
// Same dual-path pattern as trigger-build/route.ts — needed so n8n can POST here.
const SYNC_KEY = process.env.OPS_PROXY_SHARED_SECRET ?? "";

export async function GET(request: Request) {
  const resolved = resolveOpsRole(request);
  const allowed = ["owner", "admin", "operator"] as const;
  const hasSyncKey = !!(SYNC_KEY && timingSafeEqual(request.headers.get("x-ops-sync-key") ?? "", SYNC_KEY));
  if (!(allowed as readonly string[]).includes(resolved.role) && !hasSyncKey) {
    return NextResponse.json({ ok: false, error: "forbidden", role: resolved.role }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;

  let orgFilter: string | null;
  try {
    orgFilter = effectiveOrgId(request, searchParams.get("organization_id"));
  } catch (e) {
    if (e instanceof OrgAccessError) return toOrgAccessResponse(e);
    throw e;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  let query = supabase
    .from("intake_forms")
    .select("id, organization_id, status, submitted_at, submitted_by, form_data")
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (orgFilter) query = query.eq("organization_id", orgFilter);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, intake_forms: data ?? [] });
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  const allowed = ["owner", "admin", "operator"] as const;
  const hasSyncKey = !!(SYNC_KEY && timingSafeEqual(request.headers.get("x-ops-sync-key") ?? "", SYNC_KEY));
  if (!(allowed as readonly string[]).includes(resolved.role) && !hasSyncKey) {
    return NextResponse.json({ ok: false, error: "forbidden", role: resolved.role }, { status: 403 });
  }

  let body: { form: IntakeForm; organization_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { form: rawForm, organization_id } = body;

  // Guard: rawForm must be a non-null object before coercion (malformed webhook → clean 422).
  if (!rawForm || typeof rawForm !== "object") {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["company_name", "industry", "pages_needed"] },
      { status: 422 }
    );
  }

  const form = coerceFluentFormPayload(rawForm as unknown as Record<string, unknown>);

  // primary_goal was DEPRECATED 2026-06-05 (removed from the intake form) — requiring it here
  // hard-failed every real UI submission with missing_required_fields. Validate the fields the
  // form actually collects (see intake-form.ts required set): company_name, industry, pages_needed.
  if (!form?.company_name || !form?.industry || !form?.pages_needed?.length) {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["company_name", "industry", "pages_needed"] },
      { status: 422 }
    );
  }

  // Org isolation: client callers cannot inject a foreign org_id (effectiveOrgId enforces this).
  let resolvedOrgId: string | null;
  try {
    resolvedOrgId = effectiveOrgId(request, organization_id);
  } catch (e) {
    if (e instanceof OrgAccessError) return toOrgAccessResponse(e);
    throw e;
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });

  const { data, error } = await supabase
    .from("intake_forms")
    .insert({
      organization_id: resolvedOrgId,
      form_data: form,
      submitted_by: resolved.role,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, intake_form_id: data.id }, { status: 201 });
}
