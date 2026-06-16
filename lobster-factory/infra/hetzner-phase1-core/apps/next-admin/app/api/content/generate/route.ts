import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import {
  prepareArticleGeneration,
  streamArticleGeneration,
  type ArticleGenerateFailure,
  type ArticlePrepareSuccess,
} from "@/lib/content/article/generate-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Thin HTTP/streaming shell (P2 積木化). All article-generation logic lives in
// lib/content/article/generate-core.ts so the headless block
// (lib/content/blocks/article-generate.ts) shares byte-identical prep + generation:
// 一段邏輯、兩個入口、零重複. This route owns only the HTTP concerns — role gate, apiKey
// check, json parse — and wraps the core async generator in a ReadableStream for
// text/plain streaming. The streamed output (incl. GENERATION_TRUNCATED / GENERATION_ERROR
// markers) is byte-identical to the previous inline implementation.
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const prepared = await prepareArticleGeneration(body);
  // tsconfig strict:false → `!prepared.ok` does not narrow the discriminated union; cast
  // (same idiom as newsletter/route.ts:171 and the publish route).
  if (!prepared.ok) {
    const fail = prepared as ArticleGenerateFailure;
    return new NextResponse(fail.error, { status: fail.status });
  }
  const { config } = prepared as ArticlePrepareSuccess;

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        // req.signal aborts on client disconnect → the generator aborts the Anthropic stream
        // (it registers its own abort listener), so an empty cancel() is sufficient here.
        for await (const chunk of streamArticleGeneration(config, apiKey, req.signal)) {
          if (req.signal.aborted) break;
          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {},
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
