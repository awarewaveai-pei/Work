// Starting a video job: the job row first (its owner written at creation, the status gate reads it), then the
// synchronous prepare (script + images + submit to the video service, under ~100s), then the row says running or
// error. The render itself runs on the video service; finalizeVideoJob (finalize.ts) finishes it. One core for the
// browser route (/api/video/generate) and the content pipeline (lib/content/topics/make.ts), plan I4. The caller holds
// the grant (withFeature or runForOrg + grantFor "video.script"); every paid step inside inherits it.
import type { VideoServiceCapability } from "@/lib/content/video/render-client";

/** What the video/pipeline block reads from its ctx (lib/content/blocks/video-pipeline.ts run). */
export interface VideoStartInput {
  topic: string;
  articleTitle?: string;
  articleContent?: string;
  language: string;
  visualStyle?: string;
  sceneCount?: number;
  customScenes?: number;
  brollScenes?: number;
  imageModel?: string;
  ttsProvider?: string;
  ttsVoice?: string;
  introTitle?: string;
  introDuration?: number;
  outputFormats?: string[];
  brandVoice: string;
}

interface PrepareResult {
  ok?: boolean;
  euJobId?: string;
  r2Keys?: string[];
  title?: string;
  sceneCount?: number;
  script?: string;
  rightsSources?: import("@/lib/content/video/asset-origin").RightsSource[];
  formats?: string[];
  visualBreakdown?: { custom: number; broll: number };
  serviceCapability?: VideoServiceCapability;
  error?: string;
  status?: number;
}

export type VideoStart = { ok: true; jobId: string } | { ok: false; error: string };

/**
 * `beforePrepare(jobId)` runs after the job row exists and before anything is paid for; false = do not prepare (the
 * job is closed as an error). The pipeline uses it to record the job on its topic first, so two sweeps never both pay.
 */
export async function startVideoJob(orgId: string | null, input: VideoStartInput,
  opts: { beforePrepare?: (jobId: string) => Promise<boolean> } = {}): Promise<VideoStart> {
  await import("@/lib/content/blocks/register-all");
  const { byId } = await import("@/lib/content/blocks/registry");
  const pipeline = byId("video/pipeline");
  if (!pipeline) return { ok: false, error: "video/pipeline 積木未註冊；請確認 register-all.ts 含 video-pipeline" };

  const { createJob, finishJob, updateJobStep } = await import("@/lib/content/video/job-store");
  const { cleanupVideoInputKeys } = await import("@/lib/content/blocks/video-pipeline");

  let job: Awaited<ReturnType<typeof createJob>>;
  try {
    job = await createJob(orgId);
  } catch (e: unknown) {
    console.error("[video/start] createJob failed:", e);
    return { ok: false, error: "無法建立影片工作（job 儲存失敗）" };
  }
  if (opts.beforePrepare && !(await opts.beforePrepare(job.id))) {
    await finishJob(job.id, { status: "error", error: "已由另一次排程接手", statusCode: 409 });
    return { ok: false, error: "taken" };
  }

  // 供積木組出帶租戶身分的 R2 目錄名（buildVideoOutName）；讀不到就退回無租戶前綴，不是崩潰。
  const ctx = { ...input, keyword: input.topic, organizationId: orgId, onProgress: (step: string) => { void updateJobStep(job.id, step); } };
  let prep: PrepareResult;
  try {
    prep = (await pipeline.run(ctx)) as unknown as PrepareResult;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[video/start] prepare threw:", e);
    await finishJob(job.id, { status: "error", error: `prepare 例外：${msg}`, statusCode: 500 });
    return { ok: true, jobId: job.id };
  }

  if (prep.ok && prep.euJobId) {
    await finishJob(job.id, {
      status: "running",
      euJobId: prep.euJobId,
      r2Keys: prep.r2Keys ?? [],
      recordParams: orgId
        ? {
            title: prep.title ?? "",
            sceneCount: prep.sceneCount ?? 0,
            script: prep.script,
            rightsSources: prep.rightsSources,
            organizationId: orgId,
            formats: prep.formats,
            visualBreakdown: prep.visualBreakdown,
            imageModel: input.imageModel,
            source: "generate",
            serviceCapability: prep.serviceCapability,
          }
        : undefined,
    });
  } else {
    // prepare 失敗（腳本/生圖/提交）→ 清暫存 + 標記錯誤
    if (prep.r2Keys?.length) await cleanupVideoInputKeys(prep.r2Keys);
    await finishJob(job.id, { status: "error", error: prep.error ?? "prepare 失敗", statusCode: prep.status ?? 500 });
  }
  return { ok: true, jobId: job.id };
}
