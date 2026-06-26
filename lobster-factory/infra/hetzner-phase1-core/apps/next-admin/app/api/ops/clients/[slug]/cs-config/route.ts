// GET/PATCH /api/ops/clients/[slug]/cs-config
// GET  — per-client customer-service config: intents (autonomy levels), knowledge-source count,
//        and the per-tenant kill-switch (client_config.csEnabled, default true). Read tier:
//        internal ops console (any resolved role).
// PATCH — toggle the per-tenant kill-switch only. Gated by canWriteTenantConfig (owner/admin),
//        same tier as other client_config writes; audited via ops_audit_events.
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

  const csEnabled = clientConfigOf(org.metadata).csEnabled !== false; // default ON

  return NextResponse.json({
    ok: true,
    csEnabled,
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
  if (typeof body.csEnabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "csEnabled_required" }, { status: 400 });
  }
  const csEnabled = body.csEnabled;

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });

  const org = await resolveOrg(supabase, slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const clientConfig = clientConfigOf(org.metadata);
  clientConfig.csEnabled = csEnabled;

  const { error: writeErr } = await supabase
    .from("organizations")
    .update({ metadata: { ...org.metadata, client_config: clientConfig } })
    .eq("id", org.id);
  if (writeErr) {
    return NextResponse.json({ ok: false, error: "update_failed", details: writeErr.message }, { status: 409 });
  }

  await supabase.from("ops_audit_events").insert({
    organization_id: org.id,
    actor_role: resolved.role,
    event_type: "cs_killswitch_toggled",
    target_type: "organizations",
    target_id: org.id,
    trace_id: crypto.randomUUID(),
    payload: { csEnabled, role_source: resolved.source },
  });

  return NextResponse.json({ ok: true, csEnabled });
}
