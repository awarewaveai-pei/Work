// PATCH /api/ops/clients/[slug]/departments -- the client page 部門選型 tab saves the M3 department selection here
// (moved from the retired /onboard wizard step 3, card SF-P). Writes organizations.metadata.client_config.
// {department_selection, department_selection_reviewed_at}; every other metadata key is left as read. owner/admin only,
// like the other client_config writers (brand-colors, cis).
import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "../../../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../../../lib/supabase-server";
import { nextDepartmentSelection } from "../../../../../../lib/department-catalog";

export const dynamic = "force-dynamic";

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });

  const { data: org, error: readErr } = await supabase.from("organizations").select("id,metadata").eq("slug", slug).maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: "lookup_failed", detail: readErr.message }, { status: 500 });
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const metadata = isObject(org.metadata) ? org.metadata : {};
  const clientConfig = isObject(metadata.client_config) ? metadata.client_config : {};
  const next = nextDepartmentSelection(clientConfig.department_selection, isObject(body) ? body.selection : undefined);
  if ("error" in next) return NextResponse.json({ ok: false, error: next.error, detail: next.detail }, { status: 400 });

  const reviewedAt = new Date().toISOString().slice(0, 10);
  const nextMetadata = {
    ...metadata,
    client_config: { ...clientConfig, department_selection: next.value, department_selection_reviewed_at: reviewedAt },
  };
  const { error: writeErr } = await supabase.from("organizations").update({ metadata: nextMetadata }).eq("id", org.id);
  if (writeErr) return NextResponse.json({ ok: false, error: "update_failed", detail: writeErr.message }, { status: 500 });

  await supabase.from("ops_audit_events").insert({
    organization_id: org.id,
    actor_role: resolved.role,
    event_type: "department_selection_updated",
    target_type: "organizations",
    target_id: org.id,
    trace_id: crypto.randomUUID(),
    payload: { before: clientConfig.department_selection ?? null, after: next.value, role_source: resolved.source },
  });

  return NextResponse.json({ ok: true, selection: next.value, reviewedAt });
}
