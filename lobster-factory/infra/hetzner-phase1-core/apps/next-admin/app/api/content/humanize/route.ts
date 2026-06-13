import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

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

  const client = new Anthropic({ apiKey });
  let anthropicStream: ReturnType<typeof client.messages.stream> | null = null;

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        anthropicStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 6144,
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
