// GET/PATCH /api/ops/clients/[slug]/collection-schedule
//
// The operator's switch for "this tenant's approved sources crawl themselves" (migration 0081).
// Separate from collection-sources' own PATCH: that one approves/disables individual sources,
// this one is the single per-tenant on/off + cadence, read by the Trigger.dev heartbeat via
// /api/internal/collect/run-due-schedules (bearer-token auth, not this route's human-role auth).
//
// GET   — current config, or the untouched defaults (enabled:false) if no row exists yet.
// PATCH — { enabled, frequency, hourUtc, dayOfWeekUtc }. Same write gate as every other
//         tenant-config mutation in this console (owner/admin), same audit trail.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { getSchedule, upsertSchedule } from "@/lib/collect/schedule-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function orgIdOf(slug: string): Promise<string | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) return null;
  const { data, error } = await sb.from("organizations").select("id").eq("slug", slug).single();
  return error || !data ? null : (data.id as string);
}

function audit(orgId: string, role: string, source: string, event: string, payload: Record<string, unknown>) {
  void getSupabaseWriteClient()?.from("ops_audit_events").insert({
    organization_id: orgId,
    actor_role: role,
    event_type: event,
    target_type: "organizations",
    target_id: orgId,
    trace_id: crypto.randomUUID(),
    payload: { ...payload, role_source: source },
  });
}

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  resolveOpsRole(request); // internal console — viewer+ may read
  const { slug } = await context.params;
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const schedule = await getSchedule(orgId);
  return NextResponse.json({
    ok: true,
    // AGENTS.md "自動化預設 OFF": a tenant with no row yet reads as disabled, never as "unconfigured".
    schedule: schedule ?? { organizationId: orgId, enabled: false, frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 1, lastRunAt: null, lastRunKey: null, updatedBy: null },
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ slug: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const orgId = await orgIdOf(slug);
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });

  const frequency = body.frequency === "daily" ? "daily" : "weekly";
  const result = await upsertSchedule({
    organizationId: orgId,
    enabled: body.enabled === true,
    frequency,
    hourUtc: Number.isInteger(body.hourUtc) ? (body.hourUtc as number) : 3,
    dayOfWeekUtc: Number.isInteger(body.dayOfWeekUtc) ? (body.dayOfWeekUtc as number) : 1,
    updatedBy: `${resolved.role}:${resolved.source}`,
  });
  if (!result.ok) return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });

  audit(orgId, resolved.role, resolved.source, "collection_schedule_updated", {
    enabled: result.schedule?.enabled,
    frequency: result.schedule?.frequency,
    hourUtc: result.schedule?.hourUtc,
  });
  return NextResponse.json({ ok: true, schedule: result.schedule });
}
