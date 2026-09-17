// GET/PATCH /api/ops/clients/[slug]/cs-config
// GET  — per-client customer-service config: intents (autonomy levels), knowledge-source count,
//        the per-tenant kill-switch (client_config.csEnabled, default true), and the KB's tenant-wide
//        keyword-matching default (client_config.kbKeywordModeDefault, "fuzzy" | "exact", default
//        "fuzzy" — K2i). Read tier: internal ops console (any resolved role).
// PATCH — { csEnabled? , kbKeywordModeDefault? } → each field present is written; at least one must
//        be given. Two independent settings sharing one endpoint/one JSON blob (client_config) rather
//        than two routes: both are single-flag, whole-tenant toggles with the exact same read/write
//        tier, and a third one would go here too rather than spawning another almost-identical route.
//        Gated by canWriteTenantConfig (owner/admin); audited via ops_audit_events.
// Reads cs_* tables via the service-role client (their RLS is service-role-only, 0051).

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Db = NonNullable<ReturnType<typeof getSupabaseWriteClient>>;

async function resolveOrg(supabase: Db, slug: string): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const { data, error } = await supabase.from("organizations").select("id,metadata").eq("slug", slug).single();
  if (error || !data) return null;
  return { id: data.id as string, metadata: (data.metadata && typeof data.metadata === "object" ? data.metadata : {}) as Record<string, unknown> };
}

function clientConfigOf(metadata: Record<string, unknown>): Record<string, unknown> {
  return (metadata.client_config && typeof metadata.client_config === "object" ? metadata.client_config : {}) as Record<string, unknown>;
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  resolveOpsRole(request); // internal ops console — viewer+ may read
  const { slug } = await context.params;
  if (!slug) return NextResponse.json({ ok: false, error: "slug_required" }, { status: 400 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const org = await resolveOrg(supabase, slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const [intentsRes, knowledgeRes] = await Promise.all([
    supabase
      .from("cs_intents")
      .select("key,label,answer_level,action_level,is_sensitive,confidence_threshold,canary_pct")
      .eq("organization_id", org.id)
      .order("key"),
    supabase
      .from("cs_knowledge_sources")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id),
  ]);

  const config = clientConfigOf(org.metadata);
  const csEnabled = config.csEnabled !== false; // default ON
  const kbKeywordModeDefault = config.kbKeywordModeDefault === "exact" ? "exact" : "fuzzy"; // default fuzzy (today's only behaviour, pre-K2i)

  return NextResponse.json({
    ok: true,
    csEnabled,
    kbKeywordModeDefault,
    knowledgeCount: knowledgeRes.count ?? 0,
    intents: intentsRes.data ?? [],
  });
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
  const hasCsEnabled = typeof body.csEnabled === "boolean";
  const hasKeywordDefault = body.kbKeywordModeDefault === "fuzzy" || body.kbKeywordModeDefault === "exact";
  if (!hasCsEnabled && !hasKeywordDefault) {
    return NextResponse.json({ ok: false, error: "csEnabled_or_kbKeywordModeDefault_required" }, { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const org = await resolveOrg(supabase, slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const clientConfig = clientConfigOf(org.metadata);
  if (hasCsEnabled) clientConfig.csEnabled = body.csEnabled as boolean;
  if (hasKeywordDefault) clientConfig.kbKeywordModeDefault = body.kbKeywordModeDefault as string;

  const { error: writeErr } = await supabase
    .from("organizations")
    .update({ metadata: { ...org.metadata, client_config: clientConfig } })
    .eq("id", org.id);
  if (writeErr) {
    return NextResponse.json({ ok: false, error: "update_failed", details: writeErr.message }, { status: 409 });
  }

  if (hasCsEnabled) {
    await supabase.from("ops_audit_events").insert({
      organization_id: org.id,
      actor_role: resolved.role,
      event_type: "cs_killswitch_toggled",
      target_type: "organizations",
      target_id: org.id,
      trace_id: crypto.randomUUID(),
      payload: { csEnabled: body.csEnabled, role_source: resolved.source },
    });
  }
  if (hasKeywordDefault) {
    await supabase.from("ops_audit_events").insert({
      organization_id: org.id,
      actor_role: resolved.role,
      event_type: "cs_kb_keyword_default_changed",
      target_type: "organizations",
      target_id: org.id,
      trace_id: crypto.randomUUID(),
      payload: { kbKeywordModeDefault: body.kbKeywordModeDefault, role_source: resolved.source },
    });
  }

  return NextResponse.json({ ok: true, csEnabled: clientConfig.csEnabled !== false, kbKeywordModeDefault: clientConfig.kbKeywordModeDefault === "exact" ? "exact" : "fuzzy" });
}
