// POST /api/internal/schedules/run-due
//
// Called every 5 minutes by the host cron (scripts/schedules-run-due.sh, cron.d/awarewave-schedules) and, until it is
// retired, by the Trigger.dev hourly heartbeat (packages/workflows/src/trigger/schedules-heartbeat.ts).
// All scheduling logic lives here: which (client, job) rows are due (lib/schedules store + isDueNow) and
// running them (the registry's run(), lib/schedules/jobs.ts). Own bearer token (SCHEDULE_INGEST_TOKEN),
// never the shared OPS_INBOX_INGEST_TOKEN (verifyIngestToken.ts M2: one leaked token must not forge others).
//
// Each due firing is CLAIMED before the answer (claimScheduleRun: one run key per client, job and UTC
// day), then run after it: a crawl may take 10 minutes, the Trigger task gives up and retries after
// 300 s, and the claim is what keeps that retry from running the job twice. A run that throws records
// last_error and raises one incident per (job, client); the others still run. A store failure is a 500,
// never a green "nothing due".

import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { claimScheduleRun, listEnabledSchedules, recordScheduleError, recordScheduleRun, type StoredSchedule } from "@/lib/schedules/store";
import { NotDueYet, isDueNow, scheduledRunKey } from "@/lib/schedules/schedule";
import { asRegistered, clientJob } from "@/lib/schedules/jobs";
import { refreshClaimReviewIfDue } from "@/lib/collect/lookups/answer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyToken(request: Request): boolean {
  const expected = process.env.SCHEDULE_INGEST_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

async function raiseIncident(schedule: StoredSchedule, runKey: string, error: string): Promise<void> {
  const sb = getSupabaseWriteClient();
  if (!sb) return console.error(`[schedules] incident not raised (no_supabase_client): ${schedule.jobKey} ${runKey} ${error}`);
  const { data: org } = await sb.from("organizations").select("slug").eq("id", schedule.organizationId).maybeSingle();
  const fingerprint = `schedule:${schedule.jobKey}:${schedule.organizationId}`;
  const r = await ingestIncident(sb, {
    source: "schedule",
    external_id: fingerprint,
    fingerprint,
    signal_type: "error",
    severity: "medium",
    service: "schedules",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    title: `Scheduled job ${schedule.jobKey} failed`,
    message: `run=${runKey}\n${error}`,
    raw: { job_key: schedule.jobKey, organization_id: schedule.organizationId, run_key: runKey, error },
    tags: { job_key: schedule.jobKey },
    client_slug: (org?.slug as string | undefined) ?? null,
  });
  if (r.error) console.error(`[schedules] incident for ${fingerprint} failed: ${r.error}`);
}

/** Runs claimed firings one after another; never throws. */
async function runClaimed(claimed: Array<{ schedule: StoredSchedule; runKey: string }>): Promise<void> {
  for (const { schedule, runKey } of claimed) {
    try {
      const job = clientJob(schedule.jobKey);
      if (!job) throw new Error(`unknown_job:${schedule.jobKey} (row exists, registry entry does not)`);
      const summary = await job.run(schedule.organizationId, runKey);
      await recordScheduleRun(schedule.organizationId, schedule.jobKey);
      console.info(`[schedules] ${runKey} ok ${summary}`);
    } catch (e) {
      // the job's own clock says not yet: nothing happened, so nothing is recorded; the next due day retries
      if (e instanceof NotDueYet) { console.info(`[schedules] ${runKey} not due yet: ${e.message}`); continue; }
      const error = String(e).slice(0, 200);
      await recordScheduleError(schedule.organizationId, schedule.jobKey, error).catch((x) =>
        console.error(`[schedules] ${runKey} last_error not recorded: ${String(x)}`),
      );
      await raiseIncident(schedule, runKey, error);
    }
  }
}

export async function POST(request: Request) {
  if (!verifyToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // The fact-check mirror for collect lookups: at most once a day, after this answer (a refresh takes minutes).
  after(() => refreshClaimReviewIfDue({ log: (msg) => console.info(`[collect/claimreview] ${msg}`) }));

  const now = new Date();
  let schedules: StoredSchedule[];
  try {
    schedules = (await listEnabledSchedules()).map(asRegistered);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
  const due = schedules.filter((s) => isDueNow(s, now));

  const claimed: Array<{ schedule: StoredSchedule; runKey: string }> = [];
  const claimErrors: string[] = [];
  for (const schedule of due) {
    const runKey = scheduledRunKey(schedule.organizationId, schedule.jobKey, now, schedule.frequency);
    try {
      if (await claimScheduleRun(schedule.organizationId, schedule.jobKey, runKey)) claimed.push({ schedule, runKey });
    } catch (e) {
      claimErrors.push(`${runKey}: ${String(e).slice(0, 200)}`);
    }
  }
  if (claimed.length) after(() => runClaimed(claimed));

  return NextResponse.json(
    { ok: claimErrors.length === 0, checked: schedules.length, due: due.length, started: claimed.map((c) => c.runKey), claimErrors },
    { status: claimErrors.length ? 500 : 200 },
  );
}
