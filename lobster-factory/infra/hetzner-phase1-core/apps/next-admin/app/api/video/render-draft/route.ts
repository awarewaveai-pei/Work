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

  const { scenes, imageUrls, r2Keys: clientR2Keys = [], title = "影片" } = body;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return NextResponse.json({ ok: false, error: "scenes 為必填非空陣列" }, { status: 400 });
  }
  if (!Array.isArray(imageUrls) || imageUrls.length !== scenes.length) {
    return NextResponse.json({ ok: false, error: "imageUrls 長度必須與 scenes 相同" }, { status: 400 });
  }

  // Validate scene shape (prevent empty/garbage narration reaching TTS)
  for (const s of scenes) {
    if (typeof s.id !== "number" || typeof s.narration !== "string" || !s.narration.trim()) {
      return NextResponse.json({ ok: false, error: "scenes 每項須含 id(number) 和非空 narration(string)" }, { status: 400 });
    }
  }

  // Major: validate imageUrls to our known asset origins — prevents using EU box as open fetch-proxy.
  // Assets come from: R2 designs bucket public base OR Pexels CDN.
  const { getDesignsPublicBase } = await import("@/lib/storage/r2");
  const r2PublicBase = getDesignsPublicBase();
  const R2_VIDEO_PUBLIC_BASE = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  const ALLOWED_HOSTS = new Set<string>([
    new URL(r2PublicBase).hostname,
    ...(R2_VIDEO_PUBLIC_BASE ? [new URL(R2_VIDEO_PUBLIC_BASE).hostname] : []),
    "images.pexels.com",
    "videos.pexels.com",
  ]);
  for (const url of imageUrls) {
    try {
      const h = new URL(url).hostname;
      if (!ALLOWED_HOSTS.has(h)) {
        return NextResponse.json({ ok: false, error: `imageUrl 非允許的素材來源：${h}` }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: `imageUrl 格式無效：${url}` }, { status: 400 });
    }
  }

  // Major: don't trust client r2Keys for deletion — re-derive from R2 imageUrls.
  // Only paths matching buildDesignKey format (designs/YYYY-MM/<uuid>.<ext>) should be deleted.
  const DESIGN_KEY_RE = /^designs\/\d{4}-\d{2}\/[0-9a-f-]+\.\w+$/i;
  const r2Keys: string[] = imageUrls
    .map((url) => {
      try {
        const path = new URL(url).pathname.replace(/^\//, "");
        return DESIGN_KEY_RE.test(path) ? path : null;
      } catch {
        return null;
      }
    })
    .filter((k): k is string => k !== null);
  // Also include any client keys that passed the design-key format check (belt-and-suspenders)
  for (const key of clientR2Keys) {
    if (DESIGN_KEY_RE.test(key) && !r2Keys.includes(key)) r2Keys.push(key);
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
    const err = sub as { ok: false; status: number; error: string };
    return NextResponse.json({ ok: false, error: err.error }, { status: err.status });
  }

  const job = await createJob();
  const orgId = resolveOrgId();
  await finishJob(job.id, {
    status: "running",
    euJobId: sub.jobId,
    r2Keys,
    recordParams: orgId
      ? { title, sceneCount: scenes.length, organizationId: orgId }
      : undefined,
  });

  return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
}
