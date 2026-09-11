/**
 * POST /api/video/draft
 *
 * 生腳本 + 生圖，不渲染。給草稿審核流程用：
 * 前端拿到 scenes + imageUrls 後讓使用者修改旁白，再 POST /api/video/render-draft 送渲染。
 *
 * Body: { topic, articleTitle?, articleContent?, language?, visualStyle? }
 * Success: { ok: true, scenes, imageUrls, r2Keys, title }
 * Failure: { ok: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

interface DraftBody {
  topic?: string;
  articleTitle?: string;
  articleContent?: string;
  language?: string;
  /** 已解析的英文風格 prompt（前端 resolveStylePrompt 後傳入）。 */
  visualStyle?: string;
  /** "pexels-video" = Pexels 真實影片；"pexels-all" = Pexels 免費照片；其他 = Flux model id。 */
  imageModel?: string;
  /** 目標影片時長（分鐘）→ 控制場景數與旁白字數。1≈6場景, 3≈8場景, 5≈10場景。 */
  targetMinutes?: number;
  /** 明確場景數（前端「場景總數」滑桿）→ AI 生圖模式覆蓋 targetMinutes 推導的場景數。 */
  sceneCount?: number;
  /** 「自訂 AI 圖」數量（前端滑桿）→ AI 生圖模式用 Flux 圖的場景數，其餘走 Pexels B-roll。 */
  customScenes?: number;
  /** 要輸出的格式（["16x9","9x16","4x5"] 子集）→ 每格式各生一組原生圖。省略 = 全三格式。 */
  outputFormats?: string[];
  /** 深層接力：前製腳本場景（台詞→旁白、畫面→生圖提示）→ 跳過 Claude 重生。 */
  scenes?: { narration: string; imagePrompt: string; visual?: "custom" | "broll"; brollKeyword?: string; referenceImageUrl?: string }[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: DraftBody;
  try {
    body = (await req.json()) as DraftBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }

  const topic = body.topic?.trim();
  // referenceImageUrl 會被 buildSceneAsset 直接送進 Replicate（flux-kontext-pro input_image）——
  // 不是我們 R2 designs bucket 的 URL 一律丟掉，不進生圖 call（SSRF/confused-deputy 防線，
  // 對齊 lib/storage/r2.ts isDesignsAsset 既有守則；非法值降級成「沒有定裝照」而非 400 硬擋，
  // 因為這欄位是選填加強，不該讓整個場景生成失敗）。
  const { isDesignsAsset } = await import("@/lib/storage/r2");
  const providedScenes = Array.isArray(body.scenes)
    ? body.scenes
        .filter((s) => s && typeof s.narration === "string" && s.narration.trim())
        .map((s) => (isDesignsAsset(s.referenceImageUrl) ? s : { ...s, referenceImageUrl: undefined }))
    : [];
  if (!topic && providedScenes.length === 0) {
    return NextResponse.json({ ok: false, error: "topic 或 scenes 為必填" }, { status: 400 });
  }

  // 收斂到 video/prepare 積木（D 接線）：anthropicKey 缺漏 + providedScenes 邏輯由積木內處理（同 prepareScenes）。
  await import("@/lib/content/blocks/register-all");
  const { byId } = await import("@/lib/content/blocks/registry");
  const prepare = byId("video/prepare");
  if (!prepare) {
    return NextResponse.json({ ok: false, error: "video/prepare 積木未註冊" }, { status: 500 });
  }

  // 單一 interface + optional（避免 discriminated-union narrowing 的 TS 邊角，對齊 generate route PrepareResult pattern）。
  interface PrepResult {
    ok?: boolean;
    scenes?: { id: number; narration: string; image_prompt: string; broll_keyword: string; visual: "custom" | "broll" }[];
    formatAssets?: Record<string, string[]>;
    formats?: string[];
    r2Keys?: string[];
    title?: string;
    status?: number;
    error?: string;
  }
  const result = (await prepare.run({
    topic,
    articleTitle: body.articleTitle,
    articleContent: body.articleContent,
    language: body.language ?? "繁體中文",
    visualStyle: body.visualStyle,
    imageModel: body.imageModel,
    targetMinutes: typeof body.targetMinutes === "number" ? body.targetMinutes : undefined,
    sceneCount: typeof body.sceneCount === "number" ? body.sceneCount : undefined,
    customScenes: typeof body.customScenes === "number" ? body.customScenes : undefined,
    formats: Array.isArray(body.outputFormats) ? body.outputFormats : undefined,
    providedScenes: providedScenes.length > 0 ? providedScenes : undefined,
  })) as PrepResult;

  if (!result.ok || !result.scenes || !result.formatAssets || !result.formats) {
    return NextResponse.json({ ok: false, error: result.error ?? "草稿生成失敗" }, { status: result.status ?? 500 });
  }

  return NextResponse.json({
    ok: true,
    scenes: result.scenes.map((s) => ({ id: s.id, narration: s.narration, imagePrompt: s.image_prompt, brollKeyword: s.broll_keyword, visual: s.visual })),
    // 每格式一組原生圖；前端以主格式（formats[0]）預覽編輯，render-draft 時送回全部格式。
    formatImageUrls: result.formatAssets,
    formats: result.formats,
    r2Keys: result.r2Keys ?? [],
    title: result.title ?? "",
  });
}
