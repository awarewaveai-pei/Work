import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { putSecret, deleteSecret, clientCredSecretRef } from "@/lib/secret-vault";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

// Per-client credential vault — secret byte ingestion (migration 0050).
//
// THE ONLY PATH that accepts raw secret values for client_credentials.
// Writes the value to Supabase Vault (pgsodium, migration 0049) and stores only the ref name
// in client_credentials.secret_ref. The secret bytes NEVER touch a normal table and are NEVER
// returned in any response. The metadata route (../route.ts) still rejects key-looking values
// as defense-in-depth.
//
// Compensate pattern (from connectors/secret/route.ts):
//   vault write succeeds → DB update fails → deleteSecret to avoid orphan vault entry.
//
// Gate: canWriteTenantConfig (owner | admin only).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "client_credentials";

// POST { credentialId, value } — vault the secret, attach ref to the credential row.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new NextResponse("invalid json", { status: 400 }); }

  const credentialId = typeof body.credentialId === "string" ? body.credentialId.trim() : "";
  const value        = typeof body.value        === "string" ? body.value.trim()        : "";

  if (!credentialId) return NextResponse.json({ ok: false, error: "credentialId required" }, { status: 400 });
  if (!value)        return NextResponse.json({ ok: false, error: "value required" }, { status: 400 });

  // Confirm the credential row exists and belongs to the caller's org (prevents vault writes for phantom/foreign IDs).
  const { data: row, error: readErr } = await supabase
    .from(TABLE)
    .select("id, client_id")
    .eq("id", credentialId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!row)    return NextResponse.json({ ok: false, error: "credential not found" }, { status: 404 });
  try { assertOrgAccess(req, (row as Record<string, unknown>).client_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const ref = clientCredSecretRef(credentialId);

  try {
    await putSecret(ref, value);
  } catch (e) {
    // Never surface the secret value in the error — only the failure mode.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "vault write failed" }, { status: 500 });
  }

  const { error: updErr } = await supabase
    .from(TABLE)
    .update({ secret_ref: ref, updated_at: new Date().toISOString() })
    .eq("id", credentialId)
    .eq("client_id", (row as Record<string, unknown>).client_id as string);

  if (updErr) {
    // Compensate: remove the vault entry so it doesn't become an orphan.
    try { await deleteSecret(ref); } catch { /* best-effort; ref is deterministic so a retry overwrites anyway */ }
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  // Return only the ref name, never the value.
  return NextResponse.json({ ok: true, ref });
}

// DELETE ?credentialId=<uuid> — remove the vaulted secret and clear secret_ref.
export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const credentialId = new URL(req.url).searchParams.get("credentialId");
  if (!credentialId) return NextResponse.json({ ok: false, error: "credentialId required" }, { status: 400 });

  const { data: credRow, error: credReadErr } = await supabase
    .from(TABLE)
    .select("client_id")
    .eq("id", credentialId)
    .maybeSingle();
  if (credReadErr) return NextResponse.json({ ok: false, error: credReadErr.message }, { status: 500 });
  if (!credRow) return NextResponse.json({ ok: false, error: "credential not found" }, { status: 404 });
  try { assertOrgAccess(req, (credRow as Record<string, unknown>).client_id as string | null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const ref = clientCredSecretRef(credentialId);

  // Nullify secret_ref first (org-scoped) so the ref cannot be re-used if vault delete fails.
  // Mirrors the best-effort vault pattern in credentials/route.ts DELETE.
  const { error: nullErr } = await supabase
    .from(TABLE)
    .update({ secret_ref: null, updated_at: new Date().toISOString() })
    .eq("id", credentialId)
    .eq("client_id", (credRow as Record<string, unknown>).client_id as string);
  if (nullErr) return NextResponse.json({ ok: false, error: nullErr.message }, { status: 500 });

  // Best-effort vault delete — ref is deterministic so a re-POST overwrites cleanly if this fails.
  try { await deleteSecret(ref); } catch { /* best-effort; ref deterministic, re-POST overwrites */ }

  return NextResponse.json({ ok: true });
}
