import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../../lib/ops-role";
import { getJob, markRunning } from "../../../../../../lib/tarot/batch-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  }
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, job });
}

/** Called by Trigger.dev task to mark job as started. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role" }, { status: 403 });
  }
  const { jobId } = await params;
  const ok = markRunning(jobId);
  return NextResponse.json({ ok });
}
