// PATCH /api/ops/clients/[slug]/brand-colors
// Stores per-client brand colours inside organizations.metadata.client_config.brandColors
// (JSONB blob — no schema migration). Used by Banner Studio's "選擇品牌帶入配色".
// Gated by canWriteTenantConfig (owner/admin) — brand colours are client config, same tier.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "../../../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../../../lib/supabase-server";

const HEX = /^#[0-9a-fA-F]{6}$/;

function cleanHex(v: unknown): string | undefined {
  return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : undefined;
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  const { slug } = await context.params;
  if (!slug) return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Build the brandColors object from valid hex only; drop empties.
  const brandColors: { primary?: string; secondary?: string; accent?: string } = {};
  const primary = cleanHex(body.primary);
  const secondary = cleanHex(body.secondary);
  const accent = cleanHex(body.accent);
  if (primary) brandColors.primary = primary;
  if (secondary) brandColors.secondary = secondary;
  if (accent) brandColors.accent = accent;

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_write_not_configured", hint: "Set SUPABASE_SERVICE_ROLE_KEY for patch routes." },
      { status: 503 },
    );
  }

  const { data: org, error: readErr } = await supabase
    .from("organizations")
    .select("id,metadata")
    .eq("slug", slug)
    .single();

  if (readErr || !org) {
    return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  }

  const metadata = (org.metadata && typeof org.metadata === "object" ? org.metadata : {}) as Record<string, unknown>;
  const clientConfig = (metadata.client_config && typeof metadata.client_config === "object"
    ? metadata.client_config
    : {}) as Record<string, unknown>;

  // Merge (or clear, if no valid colours were sent)
  if (Object.keys(brandColors).length > 0) clientConfig.brandColors = brandColors;
  else delete clientConfig.brandColors;
  const nextMetadata = { ...metadata, client_config: clientConfig };

  const { error: writeErr } = await supabase
    .from("organizations")
    .update({ metadata: nextMetadata })
    .eq("id", org.id);

  if (writeErr) {
    return NextResponse.json({ ok: false, error: "update_failed", details: writeErr.message }, { status: 409 });
  }

  await supabase.from("ops_audit_events").insert({
    organization_id: org.id,
    actor_role: resolved.role,
    event_type: "brand_colors_updated",
    target_type: "organizations",
    target_id: org.id,
    trace_id: crypto.randomUUID(),
    payload: { brandColors, role_source: resolved.source },
  });

  return NextResponse.json({ ok: true, brandColors });
}
