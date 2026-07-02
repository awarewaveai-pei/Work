import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getSecret, putSecret, orgSupabaseRef } from "@/lib/secret-vault";

// Cold Outreach Workbench — per-client Supabase config + self-serve gate.
// GET: returns hasSupabaseUrl/hasSupabaseKey status + selfServeEnabled (never returns secret values).
// POST: writes Supabase URL/key to Vault + toggles selfServeEnabled in org metadata.
// Auth: canWriteTenantConfig (owner/admin only).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
): Promise<Response> {
  const { slug } = params;
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const { data: org, error } = await supabase
    .from("organizations")
    .select("metadata")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!org) return NextResponse.json({ ok: false, error: "org not found" }, { status: 404 });

  const metadata = ((org as { metadata?: Record<string, unknown> | null }).metadata) ?? {};
  const selfServeEnabled = Boolean(metadata.self_serve_enabled);

  let hasSupabaseUrl = false;
  let hasSupabaseKey = false;
  try {
    hasSupabaseUrl = !!(await getSecret(orgSupabaseRef(slug, "url")));
    hasSupabaseKey = !!(await getSecret(orgSupabaseRef(slug, "key")));
  } catch {
    // vault unavailable — treat as not set
  }

  return NextResponse.json({ ok: true, selfServeEnabled, hasSupabaseUrl, hasSupabaseKey });
}

export async function POST(
  req: Request,
  { params }: { params: { slug: string } },
): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) return new NextResponse("forbidden", { status: 403 });

  const { slug } = params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, metadata")
    .eq("slug", slug)
    .maybeSingle();
  if (orgErr) return NextResponse.json({ ok: false, error: orgErr.message }, { status: 500 });
  if (!org) return NextResponse.json({ ok: false, error: "org not found" }, { status: 404 });

  const row = org as { id: string; metadata: Record<string, unknown> | null };
  const updates: string[] = [];

  if (typeof body.supabaseUrl === "string" && body.supabaseUrl.trim()) {
    try {
      await putSecret(orgSupabaseRef(slug, "url"), body.supabaseUrl.trim());
      updates.push("supabase_url");
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `vault write failed: ${e instanceof Error ? e.message : "unknown"}` },
        { status: 500 },
      );
    }
  }

  if (typeof body.supabaseKey === "string" && body.supabaseKey.trim()) {
    try {
      await putSecret(orgSupabaseRef(slug, "key"), body.supabaseKey.trim());
      updates.push("supabase_key");
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `vault write failed: ${e instanceof Error ? e.message : "unknown"}` },
        { status: 500 },
      );
    }
  }

  if (typeof body.selfServeEnabled === "boolean") {
    const existingMeta = row.metadata ?? {};
    const { error: updErr } = await supabase
      .from("organizations")
      .update({ metadata: { ...existingMeta, self_serve_enabled: body.selfServeEnabled } })
      .eq("id", row.id);
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    updates.push("self_serve_enabled");
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { ok: false, error: "nothing to update (provide supabaseUrl, supabaseKey, or selfServeEnabled)" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, updated: updates });
}
