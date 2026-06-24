import { NextResponse } from "next/server";
import { resolveOpsRole, canWriteTenantConfig } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { deleteSecret, clientCredSecretRef } from "@/lib/secret-vault";

// Per-client credential vault — metadata CRUD (migration 0050).
//
// SECURITY RED LINE: this route stores METADATA only. `secret_ref` is the NAME of a vault entry,
// NEVER the secret value. The actual bytes live in Supabase Vault (migration 0049). We actively
// REJECT any field value that looks like a real secret to prevent accidental key paste here.
// Secret bytes flow exclusively through /api/ops/clients/credentials/secret.
//
// Gate: canWriteTenantConfig (owner | admin only).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "client_credentials";
const VALID_CATEGORIES = new Set(["social","cms","analytics","email","ads","crm","hosting","api","other"]);
const LIST_LIMIT = 500;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

// Heuristic guard: reject values that look like actual API keys / secrets (mirror of connectors route).
function looksLikeSecret(s: string): boolean {
  const v = s.trim();
  if (/^(sk-|re_|tr_|AIza|ghp_|gho_|xox[baprs]-|pat-|key-|Bearer\s)/i.test(v)) return true;
  if (v.length >= 40 && !/\s/.test(v) && /[A-Za-z]/.test(v) && /[0-9]/.test(v)) return true;
  return false;
}

// GET ?clientId=<uuid> — list all credentials for a client.
// Returns secretSet: boolean, NEVER the secret value.
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });

  const { data, error } = await supabase
    .from(TABLE)
    .select("id, client_id, category, label, identifier, note, secret_ref, metadata, sort_order, created_at, updated_at")
    .eq("client_id", clientId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(LIST_LIMIT);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Strip secret_ref; replace with boolean flag so the value never crosses the network.
  const credentials = (data ?? []).map(({ secret_ref, ...rest }) => ({
    ...rest,
    secretSet: typeof secret_ref === "string" && secret_ref.length > 0,
  }));

  return NextResponse.json({ ok: true, credentials });
}

// POST — create a new credential entry (metadata only, no secret bytes accepted here).
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new NextResponse("invalid json", { status: 400 }); }

  const client_id = str(body.clientId);
  const label = str(body.label);
  const category = str(body.category) ?? "other";

  if (!client_id) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
  if (!label)     return NextResponse.json({ ok: false, error: "label required" }, { status: 400 });
  if (!VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ ok: false, error: `category must be one of: ${[...VALID_CATEGORIES].join(", ")}` }, { status: 400 });
  }

  const identifier = str(body.identifier);
  const note = str(body.note);
  const sort_order = typeof body.sortOrder === "number" ? body.sortOrder : 0;
  const metadata = (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata))
    ? body.metadata as Record<string, unknown>
    : {};

  // Defense-in-depth: reject any field that looks like a raw secret value.
  for (const [field, val] of [["label", label], ["identifier", identifier], ["note", note]] as const) {
    if (val && looksLikeSecret(val)) {
      return NextResponse.json({
        ok: false,
        error: `${field} looks like a raw secret/API key. Use the /credentials/secret endpoint to store secret values.`,
      }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ client_id, category, label, identifier, note, metadata, sort_order })
    .select("id, client_id, category, label, identifier, note, metadata, sort_order, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, credential: { ...data, secretSet: false } }, { status: 201 });
}

// PATCH — update metadata fields. Never touches secret_ref (owned by /secret route).
export async function PATCH(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new NextResponse("invalid json", { status: 400 }); }

  const id = str(body.id);
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label      !== undefined) patch.label      = str(body.label);
  if (body.category   !== undefined) {
    const cat = str(body.category) ?? "other";
    if (!VALID_CATEGORIES.has(cat)) {
      return NextResponse.json({ ok: false, error: `invalid category: ${cat}` }, { status: 400 });
    }
    patch.category = cat;
  }
  if (body.identifier !== undefined) patch.identifier = str(body.identifier);
  if (body.note       !== undefined) patch.note       = str(body.note);
  if (body.sortOrder  !== undefined) patch.sort_order = typeof body.sortOrder === "number" ? body.sortOrder : 0;
  if (body.metadata   !== undefined && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
    patch.metadata = body.metadata;
  }

  // Explicitly forbid secret_ref mutations here.
  if (body.secretRef !== undefined || body.secret_ref !== undefined) {
    return NextResponse.json({
      ok: false,
      error: "secret_ref is managed by /credentials/secret. Do not patch it here.",
    }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select("id, client_id, category, label, identifier, note, secret_ref, metadata, sort_order, created_at, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  const { secret_ref, ...rest } = data;
  return NextResponse.json({ ok: true, credential: { ...rest, secretSet: typeof secret_ref === "string" && secret_ref.length > 0 } });
}

// DELETE ?id=<uuid> — remove credential. Cleans vault secret first (best-effort; failure still removes DB row).
export async function DELETE(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) return new NextResponse("forbidden", { status: 403 });

  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  // Read secret_ref before deleting so we can clean the vault.
  const { data: row, error: readErr } = await supabase
    .from(TABLE)
    .select("secret_ref")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  // Best-effort vault cleanup before DB delete (so if DB delete succeeds, no orphan).
  if (row.secret_ref) {
    try { await deleteSecret(row.secret_ref); } catch { /* vault cleanup is best-effort */ }
  }

  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
