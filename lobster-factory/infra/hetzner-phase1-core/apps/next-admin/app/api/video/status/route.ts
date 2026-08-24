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
import type { RenderOutputMeta, RenderOutputs } from "@/lib/content/video/render-client";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

const EXPECTED_VIDEO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "16x9": { width: 1920, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
  "4x5": { width: 1080, height: 1350 },
};

function validateRenderOutputs(
  outputs: RenderOutputs,
  outputMeta: RenderOutputMeta | undefined,
  expectedFormats?: string[],
): string | null {
  const formats = (expectedFormats ?? []).filter((fmt) => fmt in EXPECTED_VIDEO_DIMENSIONS);
  if (formats.length === 0) return null;

  for (const fmt of formats) {
    if (!outputs[fmt]) return `render 缺少輸出格式：${fmt}`;
    const meta = outputMeta?.[fmt];
    if (!meta) return `render 缺少 ${fmt} 尺寸驗證資料`;
    const expected = EXPECTED_VIDEO_DIMENSIONS[fmt];
    if (meta.width !== expected.width || meta.height !== expected.height) {
      return `${fmt} 輸出尺寸錯誤：${meta.width}x${meta.height}，預期 ${expected.width}x${expected.height}`;
    }
  }
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

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
    const { recordVideoAsset, cleanupVideoInputKeys, pickPrimaryOutput } = await import("@/lib/content/blocks/video-pipeline");
    const validationError = validateRenderOutputs(poll.outputs, poll.outputMeta, job.recordParams?.formats);
    if (validationError) {
      if (job.r2Keys?.length) await cleanupVideoInputKeys(job.r2Keys);
      await finishJob(jobId, { status: "error", error: validationError, statusCode: 502 });
      return NextResponse.json({ ok: true, status: "error", error: validationError, statusCode: 502 });
    }
    if (!job.recorded && job.recordParams) {
      // 與對帳 sweep 共用同一個挑選函式（單一真相）。兩邊若各寫 fallback 鏈，只選了
      // 非 16x9 格式的 render 會被兩邊導出不同 object_key → 同一支影片變兩列。
      const primaryUrl = pickPrimaryOutput(poll.outputs);
      if (primaryUrl && primaryUrl.startsWith("https://")) {
        try {
          await recordVideoAsset({
            organizationId: job.recordParams.organizationId,
            primaryUrl,
            outputs: poll.outputs,
            title: job.recordParams.title,
            sceneCount: job.recordParams.sceneCount,
            formats: job.recordParams.formats,
            visualBreakdown: job.recordParams.visualBreakdown,
            imageModel: job.recordParams.imageModel,
            source: job.recordParams.source,
            serviceCapability: job.recordParams.serviceCapability,
            outputMeta: poll.outputMeta,
            // This path owns the real render metadata; the reconcile sweep only has
            // placeholders. Merge on conflict so a sweep that got there first is
            // enriched rather than freezing `title: <dir>` / `sceneCount: 0`.
            authoritative: true,
          });
        } catch (e) {
          console.warn("[video/status] recordVideoAsset threw (best-effort):", e);
        }
      }
    }
    if (job.r2Keys?.length) await cleanupVideoInputKeys(job.r2Keys);
    await finishJob(jobId, { status: "done", recorded: true, video: { outputs: poll.outputs, out_dir: poll.out_dir, outputMeta: poll.outputMeta }, title: job.recordParams?.title });
    return NextResponse.json({ ok: true, status: "done", video: { outputs: poll.outputs, out_dir: poll.out_dir, outputMeta: poll.outputMeta }, title: job.recordParams?.title });
  }

  // EU error → 只標記錯誤；**不**清暫存圖：保留 Flux 輸入圖讓使用者能重試 render（先前在失敗時就刪掉
  // 輸入圖 → 重試時 EU 抓圖 404，即此 bug 根因，2026-06-20）。孤兒圖為小量 PNG，由 age-based 清理處理。
  await finishJob(jobId, { status: "error", error: poll.error, statusCode: 502 });
  return NextResponse.json({ ok: true, status: "error", error: poll.error, statusCode: 502 });
}
