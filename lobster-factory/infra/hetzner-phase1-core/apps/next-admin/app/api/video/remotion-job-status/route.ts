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

  const { getJob } = await import("@/lib/content/video/job-store");
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  try { assertOrgAccess(req, job.organizationId ?? null); }
  catch (error) { if (error instanceof OrgAccessError) return toOrgAccessResponse(error) as NextResponse; throw error; }
  if (!job.euJobId) return NextResponse.json({ ok: true, status: job.status, step: job.step ?? "準備中…" });
  const poll = await pollRemotion(job.euJobId);
  return NextResponse.json({ ok: true, ...poll });
}
