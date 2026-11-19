// POST /api/internal/schedules/run-due
//
// Called every 5 minutes by the host cron (scripts/poke.sh, cron.d/awarewave-schedules); the Trigger.dev
// heartbeat that also called it was removed 2026-10-25.
// All scheduling logic lives here: which (client, job) rows are due (lib/schedules store + isDueNow) and
// running them (the registry's run(), lib/schedules/jobs.ts). Own bearer token (SCHEDULE_INGEST_TOKEN),
// never the shared OPS_INBOX_INGEST_TOKEN (verifyIngestToken.ts M2: one leaked token must not forge others).
//
// Each due firing is CLAIMED before the answer (claimScheduleRun: one run key per client, job and UTC
// day), then run after it: a crawl may take 10 minutes, a caller may give up and retry after
// 300 s, and the claim is what keeps that retry from running the job twice. A run that throws records
// last_error and raises one incident per (job, client); the others still run. A store failure is a 500,
// never a green "nothing due".
//
// Every firing also advances the 「做到草稿」 video projects of every organization that has one (lib/content/video/
// advance-auto-projects.ts): pressing the button is the consent, so it needs no client_schedules row. The organizations
// are listed in the answer (autoAdvance); the advancing runs after it, after the claimed jobs were handed over. A failure
// there never stops a claimed job; a video list that cannot be read makes the answer a 500 (the host clock alerts), and a
// stopped project or a failed organization raises one incident per organization.

import { after, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/security/timingSafeEqual";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { claimScheduleRun, listEnabledSchedules, recordScheduleError, recordScheduleRun, type StoredSchedule } from "@/lib/schedules/store";
import { NotDueYet, isDueNow, scheduledRunKey } from "@/lib/schedules/schedule";
import { asRegistered, clientJob } from "@/lib/schedules/jobs";
import { refreshClaimReviewIfDue } from "@/lib/collect/lookups/answer";
import { raiseNotice, videoStopNotice } from "@/lib/schedules/stop-notice";
import { advanceAutoProjects, autoAdvanceDeps, autoAdvanceOrganizations } from "@/lib/content/video/advance-auto-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyToken(request: Request): boolean {
  const expected = process.env.SCHEDULE_INGEST_TOKEN;
  if (!expected) return false; // fail closed: unset means nobody is authorized, not everybody
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && timingSafeEqual(m[1], expected);
}

async function raiseIncident(schedule: Pick<StoredSchedule, "jobKey" | "organizationId">, runKey: string, error: string): Promise<void> {
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
    title: `排程「${schedule.jobKey}」執行失敗：${error}`.slice(0, 200),
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
      const summary = await job.run(schedule.organizationId, runKey, schedule);
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

/** 「做到草稿」 video projects: listed now, advanced after the answer. Never throws; not part of ok/status. */
async function startAutoAdvance(now: Date): Promise<{ organizations: string[] } | { error: string }> {
  const sb = getSupabaseWriteClient();
  try {
    if (!sb) throw new Error("no_supabase_client");
    const organizations = await autoAdvanceOrganizations(sb);
    const runKey = `video_project_advance:${now.toISOString()}`;
    if (organizations.length) after(() => advanceAutoProjects(autoAdvanceDeps(sb, async (organizationId, r) => {
      if (r.kind === "failed") return raiseIncident({ jobKey: "video_project_advance", organizationId }, runKey, r.error);
      await raiseNotice(sb, organizationId, videoStopNotice(r));
    }), organizations));
    return { organizations };
  } catch (e) {
    const error = String(e).slice(0, 200);
    console.error(`[schedules] video_project_advance not started: ${error}`);
    return { error };
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
    // client_schedules unreadable: the 做到草稿 projects need no row there, so they still move on
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200), autoAdvance: await startAutoAdvance(now) }, { status: 500 });
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

  const autoAdvance = await startAutoAdvance(now);

  // A video list that could not be read is a failure the host clock must see (500), though the claimed jobs still run.
  const failed = claimErrors.length > 0 || "error" in autoAdvance;
  return NextResponse.json(
    { ok: !failed, checked: schedules.length, due: due.length, started: claimed.map((c) => c.runKey), claimErrors, autoAdvance },
    { status: failed ? 500 : 200 },
  );
}
