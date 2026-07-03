import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getSecret, putSecret, orgSupabaseRef } from "@/lib/secret-vault";
import { resolveFromCredentialsLib } from "@/lib/org-client";

// Cold Outreach Workbench — per-client Supabase config + self-serve gate.
// GET: returns hasSupabaseUrl/hasSupabaseKey status + supabaseSource + selfServeEnabled.
//      Checks both the explicit vault keys (org:{slug}:supabase_*) AND the credentials library
//      (client_credentials table) so entries in 憑證庫 are automatically reflected here.
// POST: writes Supabase URL/key to Vault + toggles selfServeEnabled in org metadata.
// Auth: canWriteTenantConfig (owner/admin only).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
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
  let supabaseSource: "vault" | "credentials_library" | null = null;

  // Check explicit vault keys first (fast path).
  try {
    const [u, k] = await Promise.all([
      getSecret(orgSupabaseRef(slug, "url")),
      getSecret(orgSupabaseRef(slug, "key")),
    ]);
    if (u) { hasSupabaseUrl = true; supabaseSource = "vault"; }
    if (k) { hasSupabaseKey = true; supabaseSource = "vault"; }
  } catch {
    // vault unavailable — fall through
  }

  // Fallback: credentials library bridge (憑證庫 auto-detection).
  if (!hasSupabaseUrl || !hasSupabaseKey) {
    try {
      const fromLib = await resolveFromCredentialsLib(slug);
      if (fromLib) {
        if (!hasSupabaseUrl) hasSupabaseUrl = true;
        if (!hasSupabaseKey) hasSupabaseKey = true;
        if (!supabaseSource) supabaseSource = "credentials_library";
      }
    } catch {
      // ignore — credentials library check is best-effort
    }
  }

  return NextResponse.json({ ok: true, selfServeEnabled, hasSupabaseUrl, hasSupabaseKey, supabaseSource });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) return new NextResponse("forbidden", { status: 403 });

  const { slug } = await params;

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
