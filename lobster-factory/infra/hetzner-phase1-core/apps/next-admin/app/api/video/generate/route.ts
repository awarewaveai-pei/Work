/**
 * POST /api/video/generate
 *
 * Parses body → builds BlockCtx → imports register-all → calls byKind("video")[0].run(ctx).
 * Server-only. No secrets or block internals leak to the client.
 *
 * Body: { topic, articleTitle?, articleContent?, language?, customScenes?, brollScenes?, imageModel? }
 * Success: { ok: true, video: { outputs, out_dir }, scenes, title }
 * Failure: { ok: false, status, error }
 */

import { NextRequest, NextResponse } from "next/server";

interface GenerateBody {
  topic?: string;
  articleTitle?: string;
  articleContent?: string;
  language?: string;
  customScenes?: number;
  brollScenes?: number;
  imageModel?: string;
  ttsProvider?: string;
  ttsVoice?: string;
  introTitle?: string;
  introDuration?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ ok: false, status: 400, error: "Request body must be valid JSON" }, { status: 400 });
  }

  const topic = body.topic?.trim();
  if (!topic) {
    return NextResponse.json({ ok: false, status: 400, error: "topic 為必填" }, { status: 400 });
  }

  // Side-effect import to populate the block registry
  await import("@/lib/content/blocks/register-all");
  const { byKind } = await import("@/lib/content/blocks/registry");

  const blocks = byKind("video");
  if (blocks.length === 0) {
    return NextResponse.json(
      { ok: false, status: 500, error: "video 積木未註冊；請確認 register-all.ts 含 video-pipeline" },
      { status: 500 },
    );
  }

  const ctx = {
    topic,
    keyword: topic,
    articleTitle: body.articleTitle,
    articleContent: body.articleContent,
    language: body.language ?? "繁體中文",
    customScenes: body.customScenes,
    brollScenes: body.brollScenes,
    imageModel: body.imageModel,
    ttsProvider: body.ttsProvider,
    ttsVoice: body.ttsVoice,
    introTitle: body.introTitle,
    introDuration: body.introDuration,
  };

  // prepare 回傳（pending handle）— 單一 interface + optional（避免 union narrowing TS 邊角）
  interface PrepareResult {
    ok?: boolean;
    pending?: boolean;
    euJobId?: string;
    r2Keys?: string[];
    title?: string;
    sceneCount?: number;
    error?: string;
    status?: number;
  }

  const { createJob, finishJob, updateJobStep } = await import("@/lib/content/video/job-store");
  const { resolveOrgId, cleanupVideoInputKeys } = await import("@/lib/content/blocks/video-pipeline");
  const job = await createJob();

  // 關鍵：**同步**呼叫 prepare（Claude 腳本 + Flux 圖並行 + 提交 EU，~25s，無背景工作、不撞 CF 100s）。
  // 渲染在 EU thread 跑（持久）；/status 輪詢 EU 收尾。無 after()/fire-and-forget → 不再撞 Next.js 背景限制。
  const ctxWithProgress = {
    ...ctx,
    onProgress: (step: string) => { void updateJobStep(job.id, step); },
  };
  let prep: PrepareResult;
  try {
    prep = (await blocks[0].run(ctxWithProgress)) as unknown as PrepareResult;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[video/generate] prepare threw:", e);
    await finishJob(job.id, { status: "error", error: `prepare 例外：${msg}`, statusCode: 500 });
    return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
  }

  if (prep.ok && prep.euJobId) {
    const orgId = resolveOrgId(); // ctx 無 organizationId → 用 POD_DESIGNS_DEFAULT_ORG_ID
    await finishJob(job.id, {
      status: "running",
      euJobId: prep.euJobId,
      r2Keys: prep.r2Keys ?? [],
      recordParams: orgId
        ? { title: prep.title ?? "", sceneCount: prep.sceneCount ?? 0, organizationId: orgId }
        : undefined,
    });
  } else {
    // prepare 失敗（腳本/生圖/提交）→ 清暫存 + 標記錯誤
    if (prep.r2Keys?.length) await cleanupVideoInputKeys(prep.r2Keys);
    await finishJob(job.id, { status: "error", error: prep.error ?? "prepare 失敗", statusCode: prep.status ?? 500 });
  }

  // 202 + jobId；前端輪詢 /api/video/status?jobId=（由 /status 輪詢 EU 收尾）
  return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
}
