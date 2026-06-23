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
  /** 舊單組（向後相容）：每場景一張圖。 */
  imageUrls?: string[];
  /** 多格式：每格式一組原生圖 URL（與 scenes 等長）。提供時取代 imageUrls。 */
  formatImageUrls?: Record<string, string[]>;
  /** 多格式：要輸出的格式（formatImageUrls 的鍵集）。 */
  formats?: string[];
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

  const { scenes, imageUrls, formatImageUrls, formats: bodyFormats, r2Keys: clientR2Keys = [], title = "影片" } = body;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return NextResponse.json({ ok: false, error: "scenes 為必填非空陣列" }, { status: 400 });
  }

  // 多格式（formatImageUrls + formats）vs 舊單組（imageUrls）。urlGroups 統一後續驗證/重導/傳遞。
  const useMulti =
    !!formatImageUrls && typeof formatImageUrls === "object" &&
    Array.isArray(bodyFormats) && bodyFormats.length > 0;
  const urlGroups: Record<string, string[]> = {};
  if (useMulti) {
    for (const f of bodyFormats!) {
      const arr = formatImageUrls![f];
      if (!Array.isArray(arr) || arr.length !== scenes.length) {
        return NextResponse.json({ ok: false, error: `formatImageUrls[${f}] 長度必須與 scenes 相同` }, { status: 400 });
      }
      urlGroups[f] = arr;
    }
  } else {
    if (!Array.isArray(imageUrls) || imageUrls.length !== scenes.length) {
      return NextResponse.json({ ok: false, error: "imageUrls 長度必須與 scenes 相同" }, { status: 400 });
    }
    urlGroups._single = imageUrls;
  }
  const allUrls = Object.values(urlGroups).flat();

  // Validate scene shape (prevent empty/garbage narration reaching TTS)
  for (const s of scenes) {
    if (typeof s.id !== "number" || typeof s.narration !== "string" || !s.narration.trim()) {
      return NextResponse.json({ ok: false, error: "scenes 每項須含 id(number) 和非空 narration(string)" }, { status: 400 });
    }
  }

  // Major: validate all asset URLs to our known origins — prevents using EU box as open fetch-proxy.
  // Assets come from: R2 designs bucket public base OR Pexels CDN. 多格式時驗每格式每張。
  const { getDesignsPublicBase } = await import("@/lib/storage/r2");
  const r2PublicBase = getDesignsPublicBase();
  const R2_VIDEO_PUBLIC_BASE = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/+$/, "");
  const ALLOWED_HOSTS = new Set<string>([
    new URL(r2PublicBase).hostname,
    ...(R2_VIDEO_PUBLIC_BASE ? [new URL(R2_VIDEO_PUBLIC_BASE).hostname] : []),
    "images.pexels.com",
    "videos.pexels.com",
    "player.vimeo.com",  // Pexels API 舊影片 host（Vimeo-sourced clips）
  ]);
  for (const url of allUrls) {
    try {
      const h = new URL(url).hostname;
      if (!ALLOWED_HOSTS.has(h)) {
        return NextResponse.json({ ok: false, error: `imageUrl 非允許的素材來源：${h}` }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: `imageUrl 格式無效：${url}` }, { status: 400 });
    }
  }

  // Major: don't trust client r2Keys for deletion — re-derive from all R2 imageUrls.
  // Only paths matching buildDesignKey format (designs/YYYY-MM/<uuid>.<ext>) should be deleted.
  const DESIGN_KEY_RE = /^designs\/\d{4}-\d{2}\/[0-9a-f-]+\.\w+$/i;
  const r2Keys: string[] = [];
  for (const url of allUrls) {
    try {
      const path = new URL(url).pathname.replace(/^\//, "");
      if (DESIGN_KEY_RE.test(path) && !r2Keys.includes(path)) r2Keys.push(path);
    } catch { /* skip */ }
  }
  // Also include any client keys that passed the design-key format check (belt-and-suspenders)
  for (const key of clientR2Keys) {
    if (DESIGN_KEY_RE.test(key) && !r2Keys.includes(key)) r2Keys.push(key);
  }

  const { createJob, finishJob } = await import("@/lib/content/video/job-store");
  const { resolveOrgId } = await import("@/lib/content/blocks/video-pipeline");

  // 收斂到 video/render 積木（D 接線）：本 route 仍負責素材 host 白名單 + r2Keys 重導（安全閘），
  // 僅把「提交 EU 渲染」這步委派給積木（submitRender 的單一入口）。
  await import("@/lib/content/blocks/register-all");
  const { byId } = await import("@/lib/content/blocks/registry");
  const render = byId("video/render");
  if (!render) {
    return NextResponse.json({ ok: false, error: "video/render 積木未註冊" }, { status: 500 });
  }
  const sub = (await render.run({
    scenes: scenes.map((s) => ({ id: s.id, narration: s.narration })),
    // 多格式 → 傳 formatAssets+formats（EU 原生多格式）；否則舊單組 assets。
    ...(useMulti ? { formatAssets: urlGroups, formats: bodyFormats } : { assets: imageUrls }),
    title,
    ttsProvider: body.ttsProvider,
    ttsVoice: body.ttsVoice,
    introTitle: body.introTitle,
    introDuration: body.introDuration,
  })) as { ok: true; jobId: string } | { ok: false; status: number; error: string };

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
