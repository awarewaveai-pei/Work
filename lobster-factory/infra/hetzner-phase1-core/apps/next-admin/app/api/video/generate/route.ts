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
  };

  type BlockResult =
    | { ok: true; video: { outputs: Record<string, string>; out_dir: string }; scenes: unknown[]; title: string }
    | { ok: false; status: number; error: string };

  let result: BlockResult;
  try {
    result = (await blocks[0].run(ctx)) as BlockResult;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, status: 500, error: `積木執行例外：${msg}` }, { status: 500 });
  }

  if (!result.ok) {
    const failResult = result as { ok: false; status: number; error: string };
    return NextResponse.json(failResult, { status: failResult.status ?? 500 });
  }

  return NextResponse.json(result, { status: 200 });
}
