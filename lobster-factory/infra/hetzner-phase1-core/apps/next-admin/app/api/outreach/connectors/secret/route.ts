import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { putSecret, deleteSecret, connectorSecretRef } from "@/lib/secret-vault";

// Cold Outreach — connector secret submission (task T4/Phase-B). The ONLY path that accepts a raw
// API key: it writes the key to the Supabase Vault (migration 0049) and stores only the ref in
// co_connector_accounts.credentials_ref. The key bytes NEVER touch a normal table and are never
// returned. The metadata route (../route.ts) still rejects key-looking values as defense-in-depth.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_connector_accounts";
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// POST { connectorId, value } — vault the key, attach ref to the connector, enable it.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const connectorId = str(body.connectorId);
  const value = typeof body.value === "string" ? body.value.trim() : "";
  if (!connectorId) return NextResponse.json({ ok: false, error: "connectorId required" }, { status: 400 });
  if (!value) return NextResponse.json({ ok: false, error: "value required" }, { status: 400 });

  const { data: connector, error: readErr } = await supabase
    .from(TABLE)
    .select("id")
    .eq("id", connectorId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!connector) return NextResponse.json({ ok: false, error: "connector not found" }, { status: 404 });

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
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, ref });
}

// DELETE ?connectorId=<uuid> — remove the vaulted key + clear the ref.
export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const connectorId = new URL(req.url).searchParams.get("connectorId");
  if (!connectorId) return NextResponse.json({ ok: false, error: "connectorId required" }, { status: 400 });

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
