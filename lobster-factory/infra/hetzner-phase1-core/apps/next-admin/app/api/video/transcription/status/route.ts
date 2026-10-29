import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { JOB_DEADLINE_MS } from "@/lib/content/video/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Read-side companion to dispatch/route.ts + ../../internal/video/transcription-complete/route.ts.
 * Those two existed with zero way for the browser to ever learn a job finished (dispatch
 * returns 202 + jobId and nothing polls it) -- this closes that loop so step 7 (Whisper
 * captions) in the production pipeline can actually show a result.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const jobId = (searchParams.get("jobId") ?? "").trim();
  // ?sourceAssetId= : the latest job of one video, so a reopened page picks up a job that kept running.
  const sourceAssetId = (searchParams.get("sourceAssetId") ?? "").trim();
  if (!UUID_RE.test(jobId) && !UUID_RE.test(sourceAssetId)) return NextResponse.json({ ok: false, error: "invalid_job_id" }, { status: 400 });

  const { getSupabaseWriteClient } = await import("@/lib/supabase-server");
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "media_database_unavailable" }, { status: 503 });

  const base = db.from("media_transcription_jobs").select("id, organization_id, source_asset_id, status, model, result_json, error_code, created_at, completed_at");
  const { data: job, error } = UUID_RE.test(jobId)
    ? await base.eq("id", jobId).maybeSingle()
    : await base.eq("source_asset_id", sourceAssetId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "job_lookup_failed" }, { status: 502 });
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  try { assertOrgAccess(req, job.organization_id as string); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const result = (job.result_json ?? {}) as Record<string, unknown>;
  const engine = result.engine === "openai" ? "openai" : "host";
  // Past its deadline nothing will finish it (next-admin or the worker restarted mid-job): report it failed so the page
  // stops waiting. GET stays read-only (get-no-side-effects); a late callback can still complete the row.
  if (job.status === "dispatched" && Date.now() - new Date(job.created_at as string).getTime() > JOB_DEADLINE_MS[engine]) {
    job.status = "failed"; job.error_code = "job_timed_out";
  }
  return NextResponse.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    model: job.model,
    engine,
    fallbackFrom: result.fallbackFrom ?? null,
    costUsd: typeof result.costUsd === "number" ? result.costUsd : 0,
    sourceAssetId: job.source_asset_id,
    artifacts: result.artifacts ?? null,
    errorCode: job.error_code,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  });
}
