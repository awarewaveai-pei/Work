import { NextRequest, NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { createJob, finishJob } from "@/lib/content/video/job-store";
import { submitRemotion } from "@/lib/content/video/remotion-client";
import { prepareTimelineRemotionRequest } from "@/lib/content/video/timeline-remotion-request";

interface TimelineSubmitBody {
  readonly timeline?: unknown;
  readonly outputProfile?: unknown;
}

/**
 * Submits exactly one Timeline output profile. One request maps to one durable
 * tenant-owned video_jobs row, avoiding partial multi-profile batches.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: TimelineSubmitBody;
  try {
    body = await req.json() as TimelineSubmitBody;
  } catch {
    return NextResponse.json({ ok: false, error: "無效 JSON" }, { status: 400 });
  }
  if (body.timeline === undefined) {
    return NextResponse.json({ ok: false, error: "timeline 為必填" }, { status: 400 });
  }
  if (body.outputProfile !== undefined && typeof body.outputProfile !== "string") {
    return NextResponse.json({ ok: false, error: "outputProfile 必須是字串" }, { status: 400 });
  }

  try {
    const prepared = await prepareTimelineRemotionRequest(req, body.timeline);
    if (prepared.ok === false) {
      return NextResponse.json(prepared.body, { status: prepared.status });
    }

    if (body.outputProfile === undefined && prepared.specs.length !== 1) {
      return NextResponse.json(
        { ok: false, error: "多輸出 Timeline 必須指定 outputProfile" },
        { status: 400 },
      );
    }
    const spec = body.outputProfile === undefined
      ? prepared.specs[0]
      : prepared.specs.find((candidate) => candidate.outputProfile === body.outputProfile);
    if (!spec) {
      return NextResponse.json(
        { ok: false, error: "outputProfile 不在此 Timeline 的輸出清單" },
        { status: 400 },
      );
    }

    let job: Awaited<ReturnType<typeof createJob>>;
    try {
      job = await createJob(prepared.timeline.organizationId);
    } catch (error) {
      console.error("[video/timeline/submit] createJob failed", error);
      return NextResponse.json({ ok: false, error: "無法建立影片工作" }, { status: 500 });
    }

    let submission: Awaited<ReturnType<typeof submitRemotion>>;
    try {
      submission = await submitRemotion(
        spec.templateId,
        spec.props as unknown as Record<string, unknown>,
        { outputFormat: spec.outputFormat, fps: spec.props.fps as 24 | 25 | 30 | 60 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Remotion 提交失敗";
      await finishJob(job.id, { status: "error", error: message, statusCode: 502 });
      return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
    if (submission.ok === false) {
      await finishJob(job.id, { status: "error", error: submission.error, statusCode: 502 });
      return NextResponse.json({ ok: false, error: submission.error }, { status: 502 });
    }

    await finishJob(job.id, {
      status: "running",
      euJobId: submission.jobId,
      step: "Remotion 渲染中",
      recordParams: {
        title: prepared.timelineId,
        sceneCount: spec.props.scenes.length,
        organizationId: prepared.timeline.organizationId,
        formats: [spec.outputFormat],
        source: "draft",
        rendererKind: "remotion",
        timelineId: prepared.timelineId,
        outputProfile: spec.outputProfile,
      },
    });

    return NextResponse.json({
      ok: true,
      timelineId: prepared.timelineId,
      outputProfile: spec.outputProfile,
      jobId: job.id,
    }, { status: 202 });
  } catch (error) {
    if (error instanceof OrgAccessError) return toOrgAccessResponse(error) as NextResponse;
    throw error;
  }
}
