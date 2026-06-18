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

import { NextRequest, NextResponse, after } from "next/server";

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

  // 單一 interface + optional 欄位（避免 discriminated-union narrowing 的 TS 邊角；防禦式讀取）
  interface BlockResult {
    ok?: boolean;
    video?: { outputs: Record<string, string>; out_dir: string };
    title?: string;
    error?: string;
    status?: number;
  }

  // Async：建 job，背景跑管線（不 await），立即回 jobId。
  // 同步生成 >100s 會撞 app.aware-wave.com 的 CF orange 100s 上限（524）→ 必須 async。
  // next-admin 為常駐 Node 容器，回應後未 await 的 promise 會在 event loop 繼續執行。
  const { createJob, finishJob } = await import("@/lib/content/video/job-store");
  const job = createJob();

  // after()：回應送出後仍保證執行（比裸 fire-and-forget 在 Next.js 可靠）。
  // 管線內的 render 已改「短輪詢 EU /job」，無長連線；after 跑完整個 ~3 分鐘流程後 finishJob。
  after(async () => {
    try {
      const result = (await blocks[0].run(ctx)) as unknown as BlockResult;
      if (result.ok && result.video) {
        finishJob(job.id, { status: "done", video: result.video, title: result.title ?? "" });
      } else {
        finishJob(job.id, { status: "error", error: result.error ?? "unknown", statusCode: result.status ?? 500 });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      finishJob(job.id, { status: "error", error: `積木執行例外：${msg}`, statusCode: 500 });
    }
  });

  // 202 Accepted + jobId；前端輪詢 /api/video/status?jobId=
  return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
}
