import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { verifyIngestToken } from "@/lib/ops-inbox/verifyIngestToken";
import { readWebhookBody } from "@/lib/ops-inbox/readRequestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_RE = /^[a-z][a-z0-9_]{0,63}$/;
const SOURCES = new Set(["manual", "n8n", "trigger", "build_console", "cli"]);
const STATUSES = new Set(["pending", "active", "failed", "revoked"]);

function validate(body: Record<string, unknown>): string | null {
  if (typeof body.organization_id !== "string" || !UUID_RE.test(body.organization_id)) {
    return "organization_id must be UUID";
  }
  if (body.workspace_id != null && body.workspace_id !== "") {
    if (typeof body.workspace_id !== "string" || !UUID_RE.test(body.workspace_id)) {
      return "workspace_id must be UUID when set";
    }
  }
  if (body.asset_id != null && body.asset_id !== "") {
    if (typeof body.asset_id !== "string" || !UUID_RE.test(body.asset_id)) {
      return "asset_id must be UUID when set";
    }
  }
  if (typeof body.provider !== "string" || !PROVIDER_RE.test(body.provider)) {
    return "provider must be lowercase_snake (e.g. sentry, github)";
  }
  if (body.secret_ref != null && typeof body.secret_ref !== "string") return "secret_ref invalid";
  if (body.external_hint != null && typeof body.external_hint !== "string") return "external_hint invalid";
  if (body.api_metadata != null && typeof body.api_metadata !== "object") return "api_metadata must be object";
  const src = typeof body.provisioning_source === "string" ? body.provisioning_source : "n8n";
  if (!SOURCES.has(src)) return "provisioning_source invalid";
  const st = typeof body.status === "string" ? body.status : "active";
  if (!STATUSES.has(st)) return "status invalid";
  if (body.last_error != null && typeof body.last_error !== "string") return "last_error invalid";
  return null;
}

/**
 * Ingest from n8n / Trigger.dev: Bearer OPS_INBOX_INGEST_TOKEN.
 * Upserts one row per (organization_id, provider).
 */
export async function POST(req: Request) {
  if (!verifyIngestToken(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  // C3 fix (cross-file抓蟲 2026-05-23 catch-up): same OPS_INBOX_INGEST_TOKEN as the 5
  // audited webhook routes → same DoS surface if token leaks. Migrating to the shared
  // readWebhookBody helper closes the gap (256KB cap) + sets up future per-source HMAC.
  const bodyRead = await readWebhookBody(req);
  if (bodyRead.ok === false) return new NextResponse(bodyRead.error, { status: bodyRead.status });
  const raw = bodyRead.parsed;

  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ ok: false, error: "expected object" }, { status: 400 });
  }

  const body = raw as Record<string, unknown>;
  const err = validate(body);
  if (err) {
    return NextResponse.json({ ok: false, error: err }, { status: 400 });
  }

  const supabase = getSupabaseWriteClient();
  if (!supabase) {
    return new NextResponse("db unavailable", { status: 503 });
  }

  const row = {
    organization_id: body.organization_id as string,
    workspace_id:
      body.workspace_id && String(body.workspace_id).trim() !== ""
        ? String(body.workspace_id)
        : null,
    asset_id:
      body.asset_id && String(body.asset_id).trim() !== ""
        ? String(body.asset_id)
        : null,
    provider: body.provider as string,
    secret_ref: body.secret_ref != null ? String(body.secret_ref) : null,
    external_hint: body.external_hint != null ? String(body.external_hint) : null,
    api_metadata: (body.api_metadata as Record<string, unknown>) ?? {},
    provisioning_source: (body.provisioning_source as string) ?? "n8n",
    status: (body.status as string) ?? "active",
    last_error: body.last_error != null ? String(body.last_error) : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("tenant_integration_bindings")
    .upsert(row, { onConflict: "organization_id,provider" })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
