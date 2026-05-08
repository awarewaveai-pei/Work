// POST /api/ops/clients/:slug/wp-report
// Receives the structured JSON report from scripts/update-client-wp-plugins.ps1
// and upserts it into organizations.metadata under "wp_update_latest".
//
// Auth: requires operator role or above (same as canModifyIncidentStatus).
// The caller (local PowerShell script) passes the OPS_PROXY_SHARED_SECRET in
// X-Ops-Sync-Key so production middleware allows it through without Clerk SSO.
//
// Phase 2c client management dashboard — 2026-05-08

import { NextResponse } from "next/server";
import { resolveOpsRole, canModifyIncidentStatus } from "../../../../../../lib/ops-role";
import {
  getSupabaseServerClient,
  getSupabaseWriteClient,
} from "../../../../../../lib/supabase-server";

export const dynamic = "force-dynamic";

// The PowerShell script also sends a lightweight sync-key header so the route
// can accept calls that don't have a full Clerk session (they come from the
// operator's local machine, not from a browser).
const SYNC_KEY = process.env.OPS_PROXY_SHARED_SECRET ?? "";

function isAuthorized(request: Request): boolean {
  // Path 1: trusted-proxy role header set by nginx (browser SSO path)
  const { role } = resolveOpsRole(request);
  if (canModifyIncidentStatus(role)) return true;

  // Path 2: script sends X-Ops-Sync-Key matching OPS_PROXY_SHARED_SECRET
  const syncKey = request.headers.get("x-ops-sync-key");
  return !!(SYNC_KEY && syncKey === SYNC_KEY);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // Validate minimum required fields
  if (!body.ran_at || typeof body.client !== "string") {
    return NextResponse.json(
      { ok: false, error: "missing_required_fields", required: ["ran_at", "client"] },
      { status: 400 },
    );
  }

  // Look up org by slug (read client)
  const supabaseRead = getSupabaseServerClient();
  if (!supabaseRead) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  }

  const { data: org, error: fetchError } = await supabaseRead
    .from("organizations")
    .select("id,metadata")
    .eq("slug", slug)
    .maybeSingle();

  if (fetchError || !org) {
    return NextResponse.json(
      { ok: false, error: "org_not_found", slug },
      { status: 404 },
    );
  }

  // Merge wp_update_latest into existing metadata (preserve other keys)
  const existingMeta = (org.metadata as Record<string, unknown>) ?? {};
  const updatedMeta = {
    ...existingMeta,
    wp_update_latest: {
      ...body,
      // Don't expose backup_path in the DB (stays local-only)
      backup_path: undefined,
      synced_at: new Date().toISOString(),
    },
  };

  // Write (upsert) via service-role write client
  const supabaseWrite = getSupabaseWriteClient();
  if (!supabaseWrite) {
    return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  }

  const { error: updateError } = await supabaseWrite
    .from("organizations")
    .update({ metadata: updatedMeta })
    .eq("id", org.id);

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: "update_failed", details: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    slug,
    synced_at: updatedMeta.wp_update_latest
      ? (updatedMeta.wp_update_latest as Record<string, unknown>).synced_at
      : null,
    updated_count: body.updated_count,
    skipped_license_count: body.skipped_license_count,
    failed_count: body.failed_count,
  });
}
