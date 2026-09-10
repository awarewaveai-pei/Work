import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { prepareTimelineRemotionRequest } from "@/lib/content/video/timeline-remotion-request";

/**
 * Compile-only boundary for the Director UI. It never submits a render or writes
 * storage. Artifact URLs are resolved from tenant-owned media_assets server-side.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  let body: { timeline?: unknown };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ ok: false, error: "無效 JSON" }, { status: 400 }); }
  if (body.timeline === undefined) return NextResponse.json({ ok: false, error: "timeline 為必填" }, { status: 400 });

  try {
    const result = await prepareTimelineRemotionRequest(req, body.timeline);
    if (result.ok === false) return NextResponse.json(result.body, { status: result.status });
    return NextResponse.json({ ok: true, stage: "compiled", renderSubmission: "pending", timelineId: result.timelineId, specs: result.specs });
  } catch (error) {
    if (error instanceof OrgAccessError) return toOrgAccessResponse(error);
    throw error;
  }
}
