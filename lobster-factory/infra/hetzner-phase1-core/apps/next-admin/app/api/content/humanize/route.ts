import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { textCallCostUsd, resolveTextRate } from "@/lib/ai/cost-calculator";
import { CLAUDE_DEFAULT_MODEL, claudeFallback, claudeIncomplete, claudeParams } from "@/lib/ai/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

export async function POST(req: Request): Promise<Response> {
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

  const Anthropic = await loadAnthropic();
  const client = new Anthropic({ apiKey });
  let anthropicStream: ReturnType<typeof client.beta.messages.stream> | null = null;

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        anthropicStream = client.beta.messages.stream({
          ...claudeParams(CLAUDE_DEFAULT_MODEL, 6144),
          ...claudeFallback(CLAUDE_DEFAULT_MODEL),
          system: systemPrompt,
          messages: [{ role: "user", content: inputText }],
        });

        req.signal.addEventListener("abort", () => { anthropicStream?.abort(); });

        for await (const event of anthropicStream) {
          if (req.signal.aborted) break;
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        // Capture exact token usage from the completed stream (available on finalMessage) for the
        // cost ledger. Best-effort: never blocks or breaks the already-streamed response.
        if (!req.signal.aborted) {
          const fm = await anthropicStream.finalMessage().catch(() => null);
          if (fm && claudeIncomplete(fm)) controller.enqueue(encoder.encode("\n\n<!-- HUMANIZE_ERROR -->"));
          if (fm) {
            void logAiCall({ route: "/api/content/humanize", response: fm, actorRole: role });
            const costUsd = textCallCostUsd({ model: fm.model, inputTokens: fm.usage.input_tokens, outputTokens: fm.usage.output_tokens, cacheReadTokens: fm.usage.cache_read_input_tokens, cacheWriteTokens: fm.usage.cache_creation_input_tokens });
            const { rate: hmRate } = resolveTextRate(fm.model);
            controller.enqueue(encoder.encode(`\n[COST_JSON]${JSON.stringify({ usd: costUsd, model: fm.model, vendor: hmRate.vendor, route: "content/humanize" })}`));
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
