import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { codexAllowed, deferCodexWork } from "@/lib/tarot/codex-bridge";
import { subErrorText } from "@/lib/ai/sub-text";
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
// A chain with subscription segments, asked by the operator herself, never holds the request open for a worker (PLAN
// I5): the same stream runs detached and the 202 job's result is { ok: true, markdown } (the whole stream as one string).
async function handlePost(req: Request, grant: Grant): Promise<Response> {
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
  // (same idiom as newsletter/route.ts:213 and the publish route).
  if (!prepared.ok) {
    const fail = prepared as ArticleGenerateFailure;
    return new NextResponse(fail.error, { status: fail.status });
  }
  const { config } = prepared as ArticlePrepareSuccess;

  if (config.chain && codexAllowed(grant.actor)) {
    // Detached from the request: its signal ends with the 202 answer; the deferred signal is the browser's 停止 (DELETE
    // on the job). The bridge's queue and lease timers bound the wait.
    // Collected here, not through streamResponse: that stream closes on a throw, so a failure would read as an empty
    // article. A throw answers as an article error, not with deferCodexWork's picture fallback.
    return deferCodexWork(grant.actor, async (signal) => {
      try {
        let markdown = "";
        for await (const chunk of streamArticleGeneration(config, apiKey, signal)) markdown += chunk;
        return Response.json({ ok: true, markdown });
      } catch {
        return Response.json({ ok: false, error: subErrorText("article_failed"), code: "article_failed" });
      }
    });
  }

  // Abort plumbing — restore the original route's belt-and-suspenders (the pre-refactor route had
  // BOTH a req.signal listener AND cancel(){ anthropicStream.abort() }). In App Router the request
  // abort event is not reliably fired on client disconnect, so the ReadableStream cancel() hook is
  // the dependable backstop. Both feed one controller whose signal the core generator listens on to
  // abort the in-flight Anthropic stream (→ no wasted tokens / held connection on disconnect).
  const ac = new AbortController();
  if (req.signal.aborted) ac.abort();
  else req.signal.addEventListener("abort", () => ac.abort());
  return streamResponse(config, apiKey, ac);
}

function streamResponse(config: ArticlePrepareSuccess["config"], apiKey: string, ac: AbortController): Response {
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of streamArticleGeneration(config, apiKey, ac.signal)) {
          if (ac.signal.aborted) break;
          controller.enqueue(encoder.encode(chunk));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

// Article generation asks content.article first; generate-core's own ask reuses this grant (ADR 017 §4).
export const POST = withFeature("content.article", handlePost);
