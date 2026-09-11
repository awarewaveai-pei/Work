import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { putSecret, deleteSecret, connectorSecretRef } from "@/lib/secret-vault";

// Cold Outreach — connector secret submission (task T4/Phase-B). The ONLY path that accepts a raw
// API key: it writes the key to the Supabase Vault (migration 0049) and stores only the ref in
// co_connector_accounts.credentials_ref. The key bytes NEVER touch a normal table and are never
// returned. The metadata route (../route.ts) still rejects key-looking values as defense-in-depth.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_connector_accounts";
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
// Guard uuid-typed columns up front so a bad id returns a clean 400, not a raw PG 22P02 leak
// (same pattern as ../route.ts).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST { connectorId, value, orgSlug? } — vault the key, attach ref to the connector, enable it.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const orgSlug = typeof body.orgSlug === "string" && body.orgSlug.trim() ? body.orgSlug.trim() : null;
  const supabase = await getOrgSupabaseWriteClient(orgSlug);
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const connectorId = str(body.connectorId);
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!connectorId) return NextResponse.json({ ok: false, error: "connectorId required" }, { status: 400 });
  if (!UUID_RE.test(connectorId)) return NextResponse.json({ ok: false, error: "connectorId must be a uuid" }, { status: 400 });
  if (!value) return NextResponse.json({ ok: false, error: "value required" }, { status: 400 });

  // Verify caller owns this connector before vaulting a key against it.
  const { data: connector, error: readErr } = await supabase
    .from(TABLE)
    .select("id, organization_id")
    .eq("id", connectorId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!connector) return NextResponse.json({ ok: false, error: "connector not found" }, { status: 404 });
  try { assertOrgAccess(req, (connector as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const ref = connectorSecretRef(connectorId);
  try {
    await putSecret(ref, value);
  } catch (e) {
    // Never surface the value; only the failure mode.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "vault write failed" }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from(TABLE)
    .update({ credentials_ref: ref, is_enabled: true, updated_at: new Date().toISOString() })
    .eq("id", connectorId);
  if (updErr) {
    // Compensate the orphan vault secret so a failed attach doesn't leave a dangling blob (critic minor #2).
    try { await deleteSecret(ref); } catch { /* best-effort cleanup; ref is deterministic so a retry overwrites anyway */ }
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ref });
}

// DELETE ?connectorId=<uuid>&orgSlug=<slug> — remove the vaulted key + clear the ref.
export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  const params = new URL(req.url).searchParams;
  const supabase = await getOrgSupabaseWriteClient(params.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const connectorId = params.get("connectorId");
  if (!connectorId) return NextResponse.json({ ok: false, error: "connectorId required" }, { status: 400 });
  if (!UUID_RE.test(connectorId)) return NextResponse.json({ ok: false, error: "connectorId must be a uuid" }, { status: 400 });

  // Verify caller owns this connector before wiping its vaulted key (mirrors ../route.ts DELETE).
  const { data: connector, error: readErr } = await supabase
    .from(TABLE)
    .select("id, organization_id")
    .eq("id", connectorId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!connector) return NextResponse.json({ ok: false, error: "connector not found" }, { status: 404 });
  try { assertOrgAccess(req, (connector as Record<string, unknown>).organization_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const ref = connectorSecretRef(connectorId);
  try {
    await deleteSecret(ref);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "vault delete failed" }, { status: 500 });
  }

  const { error } = await supabase
    .from(TABLE)
    .update({ credentials_ref: null, updated_at: new Date().toISOString() })
    .eq("id", connectorId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
