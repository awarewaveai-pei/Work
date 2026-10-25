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
import { startVideoJob, type VideoStartInput } from "@/lib/content/video/start";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { thenRun, withFeature } from "@/lib/entitlements/grant";
import { siteVoiceFor } from "@/lib/content/brand-voice-store";

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
  /** The article's site: its stored brand voice goes into the script prompt. */
  siteId?: string;
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

  // siteId = the article's site; its stored brand voice shapes the script (lib/content/brand-voice-store.ts).
  let brandVoice: string | null;
  try { brandVoice = await siteVoiceFor(req, typeof body.siteId === "string" ? body.siteId.trim() : ""); }
  catch (e) {
    console.error("[video/generate] brand voice lookup failed:", e);
    return NextResponse.json({ ok: false, status: 500, error: "brand voice lookup failed" }, { status: 500 });
  }
  if (brandVoice === null) return NextResponse.json({ ok: false, status: 404, error: "site not found" }, { status: 404 });

  const input: VideoStartInput = {
    topic,
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
    brandVoice,
  };

  // The job row, the synchronous prepare and the row's result: lib/content/video/start.ts (shared with the pipeline).
  // 202 + jobId；前端輪詢 /api/video/status?jobId=（由 /status 輪詢 EU 收尾）
  const run = async (): Promise<Response> => {
    const started = await startVideoJob(orgId, input);
    if (!started.ok) {   // strict:false: !ok does not narrow
      return NextResponse.json({ ok: false, status: 500, error: (started as Extract<typeof started, { ok: false }>).error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, jobId: started.jobId }, { status: 202 });
  };
  // Asked before the job row exists; billed to the video's org (ADR 017 §0 代操), inherited by every pipeline step.
  return withFeature("video.script", thenRun, { org: () => orgId })(req, run);
}
