import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { textCallCostUsd, resolveTextRate } from "@/lib/ai/cost-calculator";
import { claudeFallback, claudeIncomplete, claudeParams } from "@/lib/ai/gateway";
import { askOpenAiText, openAiFallbackNote, type OpenAiMissReason } from "@/lib/ai/openai-text";
import { isOpenAiTextModel, openAiCompletionBudget, resolveFeatureTextModel, TEXT_FEATURE_DEFAULTS } from "@/lib/ai/text-model-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TOKENS = 6144;
/** The OpenAI answer comes whole (not streamed), so a slow one is cut here and the Claude stream takes over. */
const OPENAI_TIMEOUT_MS = 80_000;

const AI_WORDS_BASIC = [
  "Additionally", "Furthermore", "Moreover", "In conclusion",
  "It's worth noting", "It's important to note", "Delve into",
  "Comprehensive", "Leverage", "Utilize", "Navigating", "Showcasing",
];
const AI_WORDS_EXTENDED = [
  ...AI_WORDS_BASIC,
  "Multifaceted", "Nuanced", "In the realm of", "In today's world",
  "In today's digital age", "Ever-evolving", "Vibrant", "Foster",
  "Facilitate", "Paramount", "Subsequently", "Accordingly",
  "Harnessing", "Elevating", "Robust", "Seamlessly", "Transformative",
];

export const POST = withFeature("content.humanize", handlePost);
async function handlePost(req: Request, grant: Grant): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const inputText = (typeof body.text === "string" ? body.text : "").trim();
  if (!inputText) return new NextResponse("text required", { status: 400 });

  const mode = body.mode === "rewrite" ? "rewrite" : "humanize";
  const readability = typeof body.readability === "string" ? body.readability : "8th grade (recommended)";
  const removeAiWords = body.removeAiWords;
  const language = typeof body.language === "string" ? body.language : "English";

  const avoidWords =
    removeAiWords === "extended" ? AI_WORDS_EXTENDED :
    removeAiWords === "basic"    ? AI_WORDS_BASIC :
    [];
  const avoidLine = avoidWords.length > 0
    ? `\nAVOID these overused AI words: ${avoidWords.join(", ")}`
    : "";

  const systemPrompt = mode === "humanize"
    ? `You are an expert editor who transforms AI-generated text into natural, human-sounding writing.

TASK: Rewrite the provided text to:
- Sound natural, conversational, and human-written
- Maintain the original meaning, facts, and structure
- Improve readability to: ${readability}
- Keep the same language: ${language}
- Preserve all Markdown formatting (headings, bold, lists, tables)${avoidLine}

Output ONLY the rewritten text in Markdown, no preamble or explanation.`
    : `You are an expert SEO content rewriter who improves existing content for better search rankings.

TASK: Rewrite the provided content to:
- Improve SEO optimization, clarity, and engagement
- Strengthen keyword usage without stuffing
- Enhance structure and readability
- Keep the same language: ${language}
- Preserve all Markdown formatting (headings, bold, lists, tables)${avoidLine}

Output ONLY the rewritten content in Markdown format, no preamble or explanation.`;

  const model = resolveFeatureTextModel("humanize", undefined, !!process.env.OPENAI_API_KEY);
  const claudeModel = TEXT_FEATURE_DEFAULTS.humanize.claude;
  // built only when Claude answers: the grant's first recordUse names the provider that did the work
  let anthropicStream: { abort(): void } | null = null;

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const skipped: ReturnType<typeof openAiFallbackNote>[] = [];
      try {
        // OpenAI answers whole (not streamed): the answer must pass askOpenAiText before any of it reaches the page. A miss
        // (error, no key, timeout, not ended by "stop") is redone on the feature's Claude stream below; a billed miss gets a cost line.
        if (isOpenAiTextModel(model)) {
          const r = await askOpenAiText({ grant, model, system: systemPrompt, user: inputText, maxTokens: openAiCompletionBudget(MAX_TOKENS),
            route: "/api/content/humanize", actorRole: role, signal: req.signal, timeoutMs: OPENAI_TIMEOUT_MS });
          if (req.signal.aborted) return;
          const vendor = resolveTextRate(r.model).rate.vendor;
          if (r.ok === true) {
            controller.enqueue(encoder.encode(r.text));
            controller.enqueue(encoder.encode(`\n[COST_JSON]${JSON.stringify({ usd: r.costUsd, model: r.model, vendor, route: "content/humanize" })}`));
            return;
          }
          if (r.costUsd > 0) controller.enqueue(encoder.encode(`[COST_JSON]${JSON.stringify({ usd: r.costUsd, model: r.model, vendor, route: "content/humanize" })}\n`));
          skipped.push(openAiFallbackNote(model, (r as { reason: OpenAiMissReason }).reason));
        }
        const client = new (await loadAnthropic(grant))({ apiKey });
        const stream = client.beta.messages.stream({
          ...claudeParams(claudeModel, MAX_TOKENS),
          ...claudeFallback(claudeModel),
          system: systemPrompt,
          messages: [{ role: "user", content: inputText }],
        });

        anthropicStream = stream;
        req.signal.addEventListener("abort", () => { anthropicStream?.abort(); });

        for await (const event of stream) {
          if (req.signal.aborted) break;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        // Capture exact token usage from the completed stream (available on finalMessage) for the
        // cost ledger. Best-effort: never blocks or breaks the already-streamed response.
        if (!req.signal.aborted) {
          const fm = await stream.finalMessage().catch(() => null);
          if (fm && claudeIncomplete(fm)) controller.enqueue(encoder.encode("\n\n<!-- HUMANIZE_ERROR -->"));
          if (fm) {
            void logAiCall({ route: "/api/content/humanize", response: fm, actorRole: role, grant });
            const costUsd = textCallCostUsd({ model: fm.model, inputTokens: fm.usage.input_tokens, outputTokens: fm.usage.output_tokens, cacheReadTokens: fm.usage.cache_read_input_tokens, cacheWriteTokens: fm.usage.cache_creation_input_tokens });
            const { rate: hmRate } = resolveTextRate(fm.model);
            controller.enqueue(encoder.encode(`\n[COST_JSON]${JSON.stringify({ usd: costUsd, model: fm.model, vendor: hmRate.vendor, route: "content/humanize", ...(skipped.length ? { skipped } : {}) })}`));
          }
        }
      } catch {
        if (!req.signal.aborted) {
          controller.enqueue(encoder.encode("\n\n<!-- HUMANIZE_ERROR -->"));
        }
      } finally {
        controller.close();
      }
    },
    cancel() { anthropicStream?.abort(); },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
