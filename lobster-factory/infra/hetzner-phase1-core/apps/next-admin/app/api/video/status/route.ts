/**
 * GET /api/video/status?jobId=<id>
 *
 * 前端輪詢。每次呼叫：若 job running 且有 euJobId → 查 EU /job 一次（短請求）。
 *   - EU running → 回 running
 *   - EU done    → **此刻**記錄 media_assets（best-effort）+ 清 R2 暫存 + 標記 job done → 回 done+video
 *   - EU error   → 標記 job error → 回 error
 * 收尾全在這個快速請求內完成 → 不依賴任何背景工作（繞開 Next.js 背景限制）。
 */
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId is required" }, { status: 400 });
  }

  const { getJob, finishJob } = await import("@/lib/content/video/job-store");
  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "job_not_found" }, { status: 404 });
  }

  // 已結束 → 直接回
  if (job.status === "done") {
    return NextResponse.json({ ok: true, status: "done", video: job.video, title: job.title });
  }
  if (job.status === "error") {
    return NextResponse.json({ ok: true, status: "error", error: job.error, statusCode: job.statusCode });
  }

  // running：若還沒提交 EU（prepare 仍在/失敗已轉 error），回 running + step
  if (!job.euJobId) {
    return NextResponse.json({ ok: true, status: "running", step: job.step ?? "準備中…" });
  }

  // 查 EU 一次
  const { pollRenderJob } = await import("@/lib/content/video/render-client");
  const poll = await pollRenderJob(job.euJobId);

  if (poll.status === "running") {
    return NextResponse.json({ ok: true, status: "running", step: "TTS 配音 + ffmpeg 合成中（EU 伺服器）…" });
  }

  if (poll.status === "done") {
    // 收尾：記 media_assets（best-effort，只記一次）+ 清 R2 暫存
    const { recordVideoAsset, cleanupVideoInputKeys } = await import("@/lib/content/blocks/video-pipeline");
    if (!job.recorded && job.recordParams) {
      const primaryUrl = poll.outputs["16x9"] ?? poll.outputs["youtube_linkedin"] ?? Object.values(poll.outputs)[0];
      if (primaryUrl && primaryUrl.startsWith("https://")) {
        try {
          await recordVideoAsset({
            organizationId: job.recordParams.organizationId,
            primaryUrl,
            outputs: poll.outputs,
            title: job.recordParams.title,
            sceneCount: job.recordParams.sceneCount,
          });
        } catch (e) {
          console.warn("[video/status] recordVideoAsset threw (best-effort):", e);
        }
      }
    }
    if (job.r2Keys?.length) await cleanupVideoInputKeys(job.r2Keys);
    await finishJob(jobId, { status: "done", recorded: true, video: { outputs: poll.outputs, out_dir: poll.out_dir }, title: job.recordParams?.title });
    return NextResponse.json({ ok: true, status: "done", video: { outputs: poll.outputs, out_dir: poll.out_dir }, title: job.recordParams?.title });
  }

  // EU error → 只標記錯誤；**不**清暫存圖：保留 Flux 輸入圖讓使用者能重試 render（先前在失敗時就刪掉
  // 輸入圖 → 重試時 EU 抓圖 404，即此 bug 根因，2026-06-20）。孤兒圖為小量 PNG，由 age-based 清理處理。
  await finishJob(jobId, { status: "error", error: poll.error, statusCode: 502 });
  return NextResponse.json({ ok: true, status: "error", error: poll.error, statusCode: 502 });
}
