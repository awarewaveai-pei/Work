// POST /api/internal/collect/run-due-schedules
//
// The one call the Trigger.dev hourly heartbeat makes (packages/workflows/src/trigger/
// collect-scheduled-crawl.ts). All the actual scheduling logic lives HERE, not in the Trigger.dev
// task: the task is a thin "ping this endpoint" cron caller, and this route owns "which tenants are
// due" (schedule-store.ts + isDueNow) and "run them" (runCollection) as one testable unit in the
// same codebase as the crawler itself. A dedicated bearer token (COLLECT_SCHEDULE_INGEST_TOKEN),
// never the shared OPS_INBOX_INGEST_TOKEN — see verifyIngestToken.ts's own M2 history for why one
// token shared across unrelated callers is a blast-radius mistake this project already paid for once.
//
// Idempotent within an hour by construction: isDueNow() reads lastRunAt, and recordScheduleRun()
// writes it only AFTER runCollection() returns — a crash mid-run leaves lastRunAt untouched, so the
// NEXT heartbeat (within the same due hour, or the next day/week) retries rather than silently
// skipping a tenant forever.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { listEnabledSchedules, recordScheduleRun } from "@/lib/collect/schedule-store";
import { isDueNow, scheduledRunKey } from "@/lib/collect/schedule";
import { runCollection } from "@/lib/collect/run";
import "@/lib/collect/blocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyToken(request: Request): boolean {
  const expected = process.env.COLLECT_SCHEDULE_INGEST_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const schedules = await listEnabledSchedules();
  const due = schedules.filter((s) => isDueNow(s, now));

  const results: Array<{ organizationId: string; runKey: string; written: number; error?: string }> = [];
  for (const schedule of due) {
    const runKey = scheduledRunKey(schedule.organizationId, now);
    try {
      const result = await runCollection({ organizationId: schedule.organizationId, runKey });
      // Recorded AFTER a successful call, not before — see the file header.
      await recordScheduleRun(schedule.organizationId, runKey);
      results.push({ organizationId: schedule.organizationId, runKey, written: result.sink.written });
    } catch (e) {
      // One tenant's crawl throwing must not stop the sweep for every other tenant due this hour.
      results.push({ organizationId: schedule.organizationId, runKey, written: 0, error: String(e).slice(0, 200) });
    }
  }

  return NextResponse.json({ ok: true, checked: schedules.length, due: due.length, results });
}
