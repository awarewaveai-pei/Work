/**
 * POST /api/video/render-draft
 *
 * 接收使用者編輯後的草稿 scenes + 原始 imageUrls，提交 EU 渲染。
 * 立即回 202 + jobId；前端輪詢 GET /api/video/status?jobId= 取進度。
 *
 * Body: {
 *   scenes: { id: number; narration: string }[];
 *   imageUrls: string[];
 *   r2Keys: string[];
 *   title: string;
 *   ttsProvider?: string;
 *   ttsVoice?: string;
 *   introTitle?: string;
 *   introDuration?: number;
 * }
 */

import { NextRequest, NextResponse } from "next/server";

interface RenderDraftBody {
  scenes?: { id: number; narration: string }[];
  imageUrls?: string[];
  r2Keys?: string[];
  title?: string;
  ttsProvider?: string;
  ttsVoice?: string;
  introTitle?: string;
  introDuration?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RenderDraftBody;
  try {
    body = (await req.json()) as RenderDraftBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }

  const { scenes, imageUrls, r2Keys = [], title = "影片" } = body;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return NextResponse.json({ ok: false, error: "scenes 為必填非空陣列" }, { status: 400 });
  }
  if (!Array.isArray(imageUrls) || imageUrls.length !== scenes.length) {
    return NextResponse.json({ ok: false, error: "imageUrls 長度必須與 scenes 相同" }, { status: 400 });
  }

  const { submitRender } = await import("@/lib/content/video/render-client");
  const { createJob, finishJob } = await import("@/lib/content/video/job-store");
  const { resolveOrgId } = await import("@/lib/content/blocks/video-pipeline");

  const sub = await submitRender(
    scenes.map((s) => ({ id: s.id, narration: s.narration })),
    imageUrls,
    title,
    undefined,
    {
      ttsProvider: body.ttsProvider,
      ttsVoice: body.ttsVoice,
      introTitle: body.introTitle,
      introDuration: body.introDuration,
    },
  );

  if (!sub.ok) {
    return NextResponse.json({ ok: false, error: sub.error }, { status: sub.status });
  }

  const job = createJob();
  const orgId = resolveOrgId();
  finishJob(job.id, {
    status: "running",
    euJobId: sub.jobId,
    r2Keys,
    recordParams: orgId
      ? { title, sceneCount: scenes.length, organizationId: orgId }
      : undefined,
  });

  return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
}
