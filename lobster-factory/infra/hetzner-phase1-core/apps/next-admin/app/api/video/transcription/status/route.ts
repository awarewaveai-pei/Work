import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

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
  if (!UUID_RE.test(jobId)) return NextResponse.json({ ok: false, error: "invalid_job_id" }, { status: 400 });

  const { getSupabaseWriteClient } = await import("@/lib/supabase-server");
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "media_database_unavailable" }, { status: 503 });

  const { data: job, error } = await db
    .from("media_transcription_jobs")
    .select("id, organization_id, source_asset_id, status, model, result_json, error_code, created_at, completed_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "job_lookup_failed" }, { status: 502 });
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  try { assertOrgAccess(req, job.organization_id as string); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    model: job.model,
    sourceAssetId: job.source_asset_id,
    artifacts: (job.result_json as Record<string, unknown> | null)?.artifacts ?? null,
    errorCode: job.error_code,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  });
}
