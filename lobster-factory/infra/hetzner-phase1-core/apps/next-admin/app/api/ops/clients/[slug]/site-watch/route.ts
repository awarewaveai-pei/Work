// GET/PATCH /api/ops/clients/[slug]/site-watch — the client page's 網站巡檢 card.
// GET   — config (or the defaults the next sync will create), per-page state, last 10 results.
// PATCH — { expectedVersion, enabled, frequency, hourUtc }. owner/admin; optimistic version (C7);
//         409 on a concurrent edit so the card reloads instead of overwriting someone else's change.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { auditSiteWatch, loadOverview, orgBySlug, parseConfigInput, updateConfig } from "@/lib/site-watch/console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  resolveOpsRole(request); // internal console — viewer+ may read (middleware enforces the session)
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const org = await orgBySlug(sb, (await context.params).slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, overview: await loadOverview(sb, org) });
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const input = parseConfigInput(body);
  if ("error" in input) return NextResponse.json({ ok: false, error: input.error }, { status: 400 });

  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const org = await orgBySlug(sb, (await context.params).slug);
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const result = await updateConfig(sb, org.id, input, `${resolved.role}:${resolved.source}`);
  if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  await auditSiteWatch(sb, org.id, resolved, "site_watch_config_updated", {
    enabled: result.target.enabled,
    frequency: result.target.frequency,
    hourUtc: result.target.hour_utc,
    version: result.target.version,
  });
  return NextResponse.json({ ok: true, overview: await loadOverview(sb, org) });
}
