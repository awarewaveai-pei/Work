/**
 * Finishing a video job. Takes no Request, so the browser route and the pipeline clock finish a video
 * through the same code (AUTO_CONTENT I4). The caller loads the job and runs its own access check first.
 */
import type { RenderOutputMeta, RenderOutputs } from "@/lib/content/video/render-client";
import type { VideoJob } from "@/lib/content/video/job-store";

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

export type FinalizeResult =
  | { status: "done"; video: VideoJob["video"]; title: string | undefined }
  | { status: "error"; error: string | undefined; statusCode: number | undefined }
  | { status: "running"; step: string }
  | { status: "wrong_poller" }; // remotion job: caller answers 409 as today

export async function finalizeVideoJob(job: VideoJob): Promise<FinalizeResult> {
  const { finishJob } = await import("@/lib/content/video/job-store");

  // 已結束 → 直接回
  if (job.status === "done") {
    return { status: "done", video: job.video, title: job.title };
  }
  if (job.status === "error") {
    return { status: "error", error: job.error, statusCode: job.statusCode };
  }

  // running：若還沒提交 EU（prepare 仍在/失敗已轉 error），回 running + step
  if (!job.euJobId) {
    return { status: "running", step: job.step ?? "準備中…" };
  }

  if (job.recordParams?.rendererKind === "remotion") {
    return { status: "wrong_poller" };
  }

  // 查 EU 一次
  const { pollRenderJob } = await import("@/lib/content/video/render-client");
  const poll = await pollRenderJob(job.euJobId);

  if (poll.status === "running") {
    return { status: "running", step: "TTS 配音 + ffmpeg 合成中（EU 伺服器）…" };
  }

  if (poll.status === "done") {
    // 收尾：記 media_assets（best-effort，只記一次）+ 清 R2 暫存
    const { recordVideoAsset, cleanupVideoInputKeys, pickPrimaryOutput } = await import("@/lib/content/blocks/video-pipeline");
    const validationError = validateRenderOutputs(poll.outputs, poll.outputMeta, job.recordParams?.formats);
    if (validationError) {
      if (job.r2Keys?.length) await cleanupVideoInputKeys(job.r2Keys);
      await finishJob(job.id, { status: "error", error: validationError, statusCode: 502 });
      return { status: "error", error: validationError, statusCode: 502 };
    }
    if (!job.recorded && job.recordParams) {
      // 與對帳 sweep 共用同一個挑選函式（單一真相）。兩邊若各寫 fallback 鏈，只選了
      // 非 16x9 格式的 render 會被兩邊導出不同 object_key → 同一支影片變兩列。
      const primaryUrl = pickPrimaryOutput(poll.outputs);
      if (primaryUrl && primaryUrl.startsWith("https://")) {
        try {
          const asset = await recordVideoAsset({
            organizationId: job.recordParams.organizationId,
            primaryUrl,
            outputs: poll.outputs,
            title: job.recordParams.title,
            sceneCount: job.recordParams.sceneCount,
            script: job.recordParams.script,
            rightsSources: job.recordParams.rightsSources,
            // D11: our own voice (script_tts) vs real footage audio (transcription); anything else records nothing.
            captions: poll.captions
              ? { source: "script_tts", srt: poll.captions.srt, vtt: poll.captions.vtt, cues: poll.captions.cues }
              : job.recordParams.rendererKind === "footage" ? { source: "transcription" } : undefined,
            cleanOutputs: poll.cleanOutputs,
            formats: job.recordParams.formats,
            visualBreakdown: job.recordParams.visualBreakdown,
            imageModel: job.recordParams.imageModel,
            source: job.recordParams.source,
            serviceCapability: job.recordParams.serviceCapability,
            outputMeta: poll.outputMeta,
            mediaProjectId: job.recordParams.projectId,
            // This path owns the real render metadata; the reconcile sweep only has
            // placeholders. Merge on conflict so a sweep that got there first is
            // enriched rather than freezing `title: <dir>` / `sceneCount: 0`.
            authoritative: true,
          });
          if (asset) {
            const { persistAutomaticTechnicalQa } = await import("@/lib/content/video/qa-persistence");
            // D6: technical QA per delivered ratio, against that row's own checksum.
            for (const r of asset.rows) {
              await persistAutomaticTechnicalQa({
                organizationId: job.recordParams.organizationId,
                candidateAssetId: r.id,
                candidateChecksum: r.checksumSha256,
                outputs: { [r.format]: r.url },
                outputMeta: poll.outputMeta?.[r.format] ? { [r.format]: poll.outputMeta[r.format] } : undefined,
              });
            }
            // D11: script_tts renders bring their own cues (script + voice timing); the same timeline is on every ratio.
            const captionCues = poll.captions?.cues ?? job.recordParams.captionCues;
            if (captionCues) {
              const { persistAutomaticCaptionQa } = await import("@/lib/content/video/caption-qa-persistence");
              for (const r of asset.rows) {
                if (!r.checksumSha256) continue;
                await persistAutomaticCaptionQa({
                  organizationId: job.recordParams.organizationId,
                  candidateAssetId: r.id,
                  candidateChecksum: r.checksumSha256,
                  captions: captionCues,
                });
              }
            }
          }
        } catch (e) {
          console.warn("[video/status] recordVideoAsset threw (best-effort):", e);
        }
      }
    }
    if (job.r2Keys?.length) await cleanupVideoInputKeys(job.r2Keys);
    const video = { outputs: poll.outputs, out_dir: poll.out_dir, outputMeta: poll.outputMeta };
    await finishJob(job.id, { status: "done", recorded: true, video, title: job.recordParams?.title });
    return { status: "done", video, title: job.recordParams?.title };
  }

  // EU error → 只標記錯誤；**不**清暫存圖：保留 Flux 輸入圖讓使用者能重試 render（先前在失敗時就刪掉
  // 輸入圖 → 重試時 EU 抓圖 404，即此 bug 根因，2026-06-20）。孤兒圖為小量 PNG，由 age-based 清理處理。
  await finishJob(job.id, { status: "error", error: poll.error, statusCode: 502 });
  return { status: "error", error: poll.error, statusCode: 502 };
}
