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

interface DraftBody {
  topic?: string;
  articleTitle?: string;
  articleContent?: string;
  language?: string;
  /** 已解析的英文風格 prompt（前端 resolveStylePrompt 後傳入）。 */
  visualStyle?: string;
  /** 深層接力：前製腳本場景（台詞→旁白、畫面→生圖提示）→ 跳過 Claude 重生。 */
  scenes?: { narration: string; imagePrompt: string }[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: DraftBody;
  try {
    body = (await req.json()) as DraftBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }

  const topic = body.topic?.trim();
  const providedScenes = Array.isArray(body.scenes)
    ? body.scenes.filter((s) => s && typeof s.narration === "string" && s.narration.trim())
    : [];
  if (!topic && providedScenes.length === 0) {
    return NextResponse.json({ ok: false, error: "topic 或 scenes 為必填" }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  // providedScenes 路徑跳過 Claude 生腳本 → 不需 anthropicKey；只有要生腳本時才強制。
  if (!anthropicKey && providedScenes.length === 0) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const { prepareScenes } = await import("@/lib/content/blocks/video-pipeline");

  const result = await prepareScenes(
    {
      topic,
      articleTitle: body.articleTitle,
      articleContent: body.articleContent,
      language: body.language ?? "繁體中文",
      visualStyle: body.visualStyle,
      providedScenes: providedScenes.length > 0 ? providedScenes : undefined,
    },
    anthropicKey ?? "",
  );

  if (!result.ok) {
    const err = result as { ok: false; status: number; error: string };
    return NextResponse.json({ ok: false, error: err.error }, { status: err.status });
  }

  return NextResponse.json({
    ok: true,
    scenes: result.scenes.map((s) => ({ id: s.id, narration: s.narration, imagePrompt: s.image_prompt })),
    imageUrls: result.assets,
    r2Keys: result.r2Keys,
    title: result.title,
  });
}
