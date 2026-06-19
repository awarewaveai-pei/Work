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
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: DraftBody;
  try {
    body = (await req.json()) as DraftBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Request body must be valid JSON" }, { status: 400 });
  }

  const topic = body.topic?.trim();
  if (!topic) {
    return NextResponse.json({ ok: false, error: "topic 為必填" }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
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
    },
    anthropicKey,
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
