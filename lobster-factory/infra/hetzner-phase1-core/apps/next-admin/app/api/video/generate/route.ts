/**
 * POST /api/video/generate
 *
 * Parses body → builds BlockCtx → imports register-all → calls byId("video/pipeline").run(ctx).
 * Server-only. No secrets or block internals leak to the client.
 *
 * Body: { topic, articleTitle?, articleContent?, language?, visualStyle?, customScenes?, brollScenes?, imageModel? }
 * Success: { ok: true, video: { outputs, out_dir }, scenes, title }
 * Failure: { ok: false, status, error }
 */

import { NextRequest, NextResponse } from "next/server";
import type { VideoServiceCapability } from "@/lib/content/video/render-client";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { thenRun, withFeature } from "@/lib/entitlements/grant";

interface GenerateBody {
  topic?: string;
  articleTitle?: string;
  articleContent?: string;
  language?: string;
  visualStyle?: string;
  sceneCount?: number;
  customScenes?: number;
  brollScenes?: number;
  imageModel?: string;
  ttsProvider?: string;
  ttsVoice?: string;
  introTitle?: string;
  introDuration?: number;
  /** 要輸出的格式（["16x9","9x16","4x5"] 子集）；每格式原生生成。省略 = 全三格式。 */
  outputFormats?: string[];
}

export async function POST(req: NextRequest): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, status: 403, error: "forbidden" }, { status: 403 });
  }

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

  // 租戶身分：走 app 既有的唯一解析器（designs/presets 同一條 seam），**不是**全域預設值。
  // client 帳號一律綁回自己的 org、無綁定則 fail closed；ops 帳號維持既有行為（吃 env 預設）。
  // 解析刻意放在提交 EU **之前**：失敗要在花掉渲染算力前擋下，而不是等 EU 跑完才發現這筆
  // 影片沒有合法歸屬（2026-08-25：本路徑原本在 EU 提交後才呼叫無參數的 resolveOrgId()）。
  const { resolveOrgId: resolveDefaultOrgId } = await import("@/lib/content/blocks/video-pipeline");
  let orgId: string | null;
  try { orgId = effectiveOrgId(req, resolveDefaultOrgId()); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e) as NextResponse; throw e; }

  // Side-effect import to populate the block registry
  await import("@/lib/content/blocks/register-all");
  const { byId } = await import("@/lib/content/blocks/registry");

  // 精確選 video/pipeline（不用 byKind("video")[0]：自從 video/prepare、video/render 也註冊為 kind=video 後，
  // [0] 會變成順序相依的脆弱選法）。
  const pipeline = byId("video/pipeline");
  if (!pipeline) {
    return NextResponse.json(
      { ok: false, status: 500, error: "video/pipeline 積木未註冊；請確認 register-all.ts 含 video-pipeline" },
      { status: 500 },
    );
  }

  const ctx = {
    topic,
    keyword: topic,
    articleTitle: body.articleTitle,
    articleContent: body.articleContent,
    language: body.language ?? "繁體中文",
    visualStyle: body.visualStyle,
    sceneCount: body.sceneCount,
    customScenes: body.customScenes,
    brollScenes: body.brollScenes,
    imageModel: body.imageModel,
    ttsProvider: body.ttsProvider,
    ttsVoice: body.ttsVoice,
    introTitle: body.introTitle,
    introDuration: body.introDuration,
    outputFormats: body.outputFormats,
    // 供積木組出帶租戶身分的 R2 目錄名（見 buildVideoOutName）。ctx 是 BlockCtx（index signature），
    // 積木讀不到就退回舊行為，所以這個欄位缺失是「少了租戶前綴」而非崩潰。
    organizationId: orgId,
  };

  // prepare 回傳（pending handle）— 單一 interface + optional（避免 union narrowing TS 邊角）
  interface PrepareResult {
    ok?: boolean;
    pending?: boolean;
    euJobId?: string;
    r2Keys?: string[];
    title?: string;
    sceneCount?: number;
    formats?: string[];
    visualBreakdown?: { custom: number; broll: number };
    serviceCapability?: VideoServiceCapability;
    error?: string;
    status?: number;
  }

  const { createJob, finishJob, updateJobStep } = await import("@/lib/content/video/job-store");
  const { cleanupVideoInputKeys } = await import("@/lib/content/blocks/video-pipeline");

  // 租戶身分在**建立列的當下**就寫進 job（上方 :59 已解析完成）。/api/video/status 的租戶閘
  // 讀的是這個欄位，而不是下方才寫入的 recordParams —— prepare 失敗時（:128 / :154）
  // recordParams 根本不存在，拿它當授權依據等於讓 client 永遠看不到自己失敗的原因。
  // createJob 現在會在 insert 失敗時拋出（不再靜默降級成「之後每次 /status 都 job_not_found」）。
  const run = async (): Promise<Response> => {
    let job: Awaited<ReturnType<typeof createJob>>;
    try {
      job = await createJob(orgId);
    } catch (e: unknown) {
      console.error("[video/generate] createJob failed:", e);
      return NextResponse.json(
        { ok: false, status: 500, error: "無法建立影片工作（job 儲存失敗）" },
        { status: 500 },
      );
    }

    // 關鍵：**同步**呼叫 prepare（Claude 腳本 + Flux 圖並行 + 提交 EU，~25s，無背景工作、不撞 CF 100s）。
    // 渲染在 EU thread 跑（持久）；/status 輪詢 EU 收尾。無 after()/fire-and-forget → 不再撞 Next.js 背景限制。
    const ctxWithProgress = {
      ...ctx,
      onProgress: (step: string) => { void updateJobStep(job.id, step); },
    };
    let prep: PrepareResult;
    try {
      prep = (await pipeline.run(ctxWithProgress)) as unknown as PrepareResult;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[video/generate] prepare threw:", e);
      await finishJob(job.id, { status: "error", error: `prepare 例外：${msg}`, statusCode: 500 });
      return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
    }

    if (prep.ok && prep.euJobId) {
      // orgId 已在提交 EU 之前解析完成（見上方 effectiveOrgId 區塊），此處直接使用。
      await finishJob(job.id, {
        status: "running",
        euJobId: prep.euJobId,
        r2Keys: prep.r2Keys ?? [],
        recordParams: orgId
          ? {
              title: prep.title ?? "",
              sceneCount: prep.sceneCount ?? 0,
              organizationId: orgId,
              formats: prep.formats,
              visualBreakdown: prep.visualBreakdown,
              imageModel: body.imageModel,
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

    // 202 + jobId；前端輪詢 /api/video/status?jobId=（由 /status 輪詢 EU 收尾）
    return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
  };
  // Asked before the job row exists; billed to the video's org (ADR 017 §0 代操), inherited by every pipeline step.
  return withFeature("video.script", thenRun, { org: () => orgId })(req, run);
}
