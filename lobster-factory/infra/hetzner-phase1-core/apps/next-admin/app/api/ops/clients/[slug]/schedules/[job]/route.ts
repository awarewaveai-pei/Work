// PATCH /api/ops/clients/[slug]/schedules/[job] — one cell of the schedules table (SCHEDULES_PAGE_PLAN.md §4.2).
//
// job = a registry key (lib/schedules/jobs.ts) → client_schedules; job = "site_watch" → site-watch's own
// locked update (adapters/site-watch.ts). Any other key is 404: the page cannot invent a job.
// Body: { enabled, frequency, hourUtc, dayOfWeekUtc } (+ expectedVersion for site_watch; 409 on a
// concurrent edit). owner/admin only, every write audited. The table reloads its view after a write.

import type { Frequency } from "@/lib/schedules/schedule";
import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { clientJob } from "@/lib/schedules/jobs";
import { upsertSchedule } from "@/lib/schedules/store";
import { SITE_WATCH_JOB, writeSiteWatchCell } from "@/lib/schedules/adapters/site-watch";
import { recordOpsAudit } from "@/lib/ops-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function PATCH(request: Request, context: { params: Promise<{ slug: string; job: string }> }) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { slug, job: jobKey } = await context.params;
  const job = clientJob(jobKey);
  if (!job && jobKey !== SITE_WATCH_JOB.key) return NextResponse.json({ ok: false, error: "unknown_job" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const sb = getSupabaseWriteClient();
  if (!sb) return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  const { data: org } = await sb.from("organizations").select("id").eq("slug", slug).maybeSingle();
  if (!org) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  const orgId = org.id as string;

  if (!job) {
    const r = await writeSiteWatchCell(sb, orgId, body, resolved);
    if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  } else {
    const frequency = String(body.frequency ?? "");
    if (!job.frequencies.some((f) => f.value === frequency)) return NextResponse.json({ ok: false, error: "frequency_invalid" }, { status: 400 });
    const result = await upsertSchedule({
      organizationId: orgId,
      jobKey: job.key,
      enabled: body.enabled === true,
      frequency: frequency as Frequency,
      hourUtc: Number.isInteger(body.hourUtc) ? (body.hourUtc as number) : job.defaults.hourUtc,
      dayOfWeekUtc: Number.isInteger(body.dayOfWeekUtc) ? (body.dayOfWeekUtc as number) : job.defaults.dayOfWeekUtc,
      updatedBy: `${resolved.role}:${resolved.source}`,
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.errors.join(",") }, { status: 400 });
    await recordOpsAudit(orgId, resolved.role, resolved.source, "client_schedule_updated", {
      job_key: job.key,
      enabled: result.schedule?.enabled,
      frequency: result.schedule?.frequency,
      hourUtc: result.schedule?.hourUtc,
      dayOfWeekUtc: result.schedule?.dayOfWeekUtc,
    });
  }

  return NextResponse.json({ ok: true });
}
