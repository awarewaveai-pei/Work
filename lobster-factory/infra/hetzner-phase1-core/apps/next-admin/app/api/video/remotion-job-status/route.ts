import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { pollRemotion } from "@/lib/content/video/remotion-client";

/** Tenant-safe Remotion status boundary. The public identifier is video_jobs.id, never EU jobId. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });

  const { getJob, finishJob } = await import("@/lib/content/video/job-store");
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  try { assertOrgAccess(req, job.organizationId ?? null); }
  catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error) as NextResponse; throw error; }
  if (!job.euJobId) return NextResponse.json({ ok: true, status: job.status, step: job.step ?? "準備中…" });
  const poll = await pollRemotion(job.euJobId);
  if (poll.status === "done") {
    const video = { outputs: { remotion: poll.url }, out_dir: "remotion" };
    if (job.recordParams?.organizationId && poll.url?.startsWith("https://")) {
      const { recordVideoAsset } = await import("@/lib/content/blocks/video-pipeline");
      await recordVideoAsset({ organizationId: job.recordParams.organizationId, primaryUrl: poll.url, outputs: video.outputs, title: job.recordParams.title, sceneCount: job.recordParams.sceneCount, source: job.recordParams.source, authoritative: true });
    }
    await finishJob(job.id, { status: "done", video, title: job.recordParams?.title });
    return NextResponse.json({ ok: true, status: "done", video });
  }
  if (poll.status === "error") {
    await finishJob(job.id, { status: "error", error: poll.error, statusCode: 502 });
    return NextResponse.json({ ok: false, status: "error", error: poll.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, ...poll });
}
