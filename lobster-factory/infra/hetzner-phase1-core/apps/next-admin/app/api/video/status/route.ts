/**
 * GET /api/video/status?jobId=<id>
 *
 * 前端輪詢。每次呼叫：若 job running 且有 euJobId → 查 EU /job 一次（短請求）。
 *   - EU running → 回 running
 *   - EU done    → **此刻**記錄 media_assets（best-effort）+ 清 R2 暫存 + 標記 job done → 回 done+video
 *   - EU error   → 標記 job error → 回 error
 * 收尾全在這個快速請求內完成 → 不依賴任何背景工作（繞開 Next.js 背景限制）。
 *
 * 授權兩層：① 角色閘 canCreateAiImageJob（viewer 擋掉）② 租戶閘 assertOrgAccess，讀 job 之後
 * 立刻執行、在任何回傳資料的分支之前（見下方註解）。
 */
import { NextRequest, NextResponse } from "next/server";
import type { RenderOutputMeta, RenderOutputs } from "@/lib/content/video/render-client";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";

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

  // ── 租戶閘 ──────────────────────────────────────────────────────────────────
  // 位置很重要：必須在**第一個回傳資料的分支之前**。下面 :status==="done" 那支直接回
  // job.video（該次 render 全部格式的 R2 URL）+ title —— 那是本 route 最有價值的外洩點，
  // 而且它會在走到下方 recordVideoAsset 之前就 return。原始 finding 寫「在 recordVideoAsset
  // 之前補」，照那個位置補出來的是一道**對已完成 job 完全無效**的假閘（2026-08-26 覆核）。
  //
  // 讀 job.organizationId（createJob 建立列時寫定）而**不是** job.recordParams?.organizationId：
  // recordParams 在 prepare 失敗時根本不存在（generate/route.ts:142、:168），拿它當依據會讓
  // client 對自己失敗的 render 永久 403，連錯誤訊息都拿不到。所有權必須獨立於 record payload。
  //
  // organizationId 為 null 的情況：① 本 migration（0060）之前建立的舊列 ② staff 且
  // POD_DESIGNS_DEFAULT_ORG_ID 未設。①**不會自動隨時間消失** —— 1h TTL 的清理只在
  // createJob 時順手執行（job-store.ts:106），不是計時器；2026-08-26 實測該表有 14 列殘留，
  // 因為 2026-08-25 之後 prod 未再生成影片。實務影響為零（舊列只能憑 jobId 定址，而持有該
  // jobId 的瀏覽器早已離開；staff 一律放行），但別把它當成「一小時後就乾淨了」。
  // 兩者 assertOrgAccess 都放行 staff、
  // 擋下 client，即 fail-closed。（client 帳號無 org 綁定時 effectiveOrgId 早在建 job 時就拋，
  // 所以「client 的 job 沒有 org」不可能發生 —— lib/tenant-guard.ts:114-117。）
  try { assertOrgAccess(req, job.organizationId ?? null); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e) as NextResponse; throw e; }

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

  if (job.recordParams?.rendererKind === "remotion") {
    return NextResponse.json({ ok: false, error: "Remotion job 使用 /api/video/remotion-job-status" }, { status: 409 });
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
