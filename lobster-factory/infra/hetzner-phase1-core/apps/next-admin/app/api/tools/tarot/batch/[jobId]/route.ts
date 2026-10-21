import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../../lib/ops-role";
import { BatchStoreUnavailableError, getJob, toPublicJob } from "../../../../../../lib/tarot/batch-store";
import { fetchTriggerRunStatus } from "../../../../../../lib/tarot/batch-run-status";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "../../../../../../lib/tenant-guard";

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
  let job;
  try {
    job = await getJob(jobId, { runStatus: fetchTriggerRunStatus });
  } catch (e) {
    if (!(e instanceof BatchStoreUnavailableError)) throw e;
    console.error("[tarot-batch]", e.message);
    return NextResponse.json({ ok: false, error: "batch_store_unavailable" }, { status: 503 });
  }
  if (!job) return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  try { assertOrgAccess(req, job.organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  return NextResponse.json({ ok: true, job: toPublicJob(job) });
}
