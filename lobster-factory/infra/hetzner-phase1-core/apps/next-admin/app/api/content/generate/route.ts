import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SIZE_TOKENS: Record<string, number> = {
  short: 2048,
  medium: 4096,
  long: 6144,
};

const SIZE_WORDS: Record<string, string> = {
  short: "~1200",
  medium: "~2500",
  long: "~4000",
};

const SYSTEM_PROMPT = `You are a professional SEO/GEO content writer. Write a complete, publication-ready article in Markdown.

OUTPUT FORMAT (follow this order exactly):
1. # H1 title
2. ## Quick Answer (80–150 words; first sentence directly answers the main question)
3. ## Key Takeaways (4–5 bullet points)
4. Main body sections — each H2 answers one specific reader question; use H3 sub-sections where helpful
5. At least one comparison or evaluation table
6. ## FAQ (5–8 questions; each answer is 40–120 words; first sentence directly answers; no vague pronouns like "this" or "the above")
7. ## Conclusion (with a clear CTA)

RULES:
- Output clean Markdown only — no preamble, no "here is your article" opener
- Use brand facts from the instructions provided; mark any unverified brand claim with <!-- NEEDS_BRAND_VERIFY --> inline
- Mark any statistic, superlative, or claim requiring a source with <!-- NEEDS_FACT_CHECK -->
- YMYL (health/wellness/mental health): include a brief disclaimer that this is educational content — not medical treatment, psychotherapy, or a substitute for professional care. Add crisis line if content is Taiwan-facing: 台灣安心專線 1925 / 生命線 1995
- FORBIDDEN: cure / treat illness / heal illness / diagnose / guaranteed results / therapy (unless drawing a clear distinction from your own service) / therapist (same rule)
- No keyword stuffing — use the primary keyword naturally
- FAQ answers must be self-contained; spell out names/brand/place instead of using "it", "this approach", "above"`;

function buildUserPrompt(params: {
  keyword: string;
  title: string;
  language: string;
  articleType: string;
  articleSize: string;
  tone: string;
  pointOfView: string;
  readability: string;
  details: string;
}): string {
  const lines: string[] = [];

  if (params.details.trim()) {
    lines.push("=== BRAND / ADDITIONAL INSTRUCTIONS ===");
    lines.push(params.details.trim());
    lines.push("=== END INSTRUCTIONS ===");
    lines.push("");
  }

  lines.push(`Primary keyword: ${params.keyword}`);
  if (params.title.trim()) lines.push(`Article title: ${params.title.trim()}`);
  lines.push(`Language: ${params.language}`);
  lines.push(`Article type: ${params.articleType}`);
  lines.push(`Target length: ${SIZE_WORDS[params.articleSize] ?? "~2500"} words`);
  lines.push(`Tone of voice: ${params.tone}`);
  if (params.pointOfView !== "none") lines.push(`Point of view: ${params.pointOfView}`);
  lines.push(`Text readability: ${params.readability}`);
  lines.push("");
  lines.push("Write the complete article now.");

  return lines.join("\n");
}

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const keyword = (body.keyword ?? "").trim();
  if (!keyword) return new NextResponse("keyword required", { status: 400 });

  const maxTokens = SIZE_TOKENS[body.articleSize ?? "medium"] ?? 4096;
  const userPrompt = buildUserPrompt({
    keyword,
    title: body.title ?? "",
    language: body.language ?? "English",
    articleType: body.articleType ?? "Pillar Article",
    articleSize: body.articleSize ?? "medium",
    tone: body.tone ?? "Friendly",
    pointOfView: body.pointOfView ?? "none",
    readability: body.readability ?? "8th grade",
    details: body.details ?? "",
  });

  const client = new Anthropic({ apiKey });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const stream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: maxTokens,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        });
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(`\n\n<!-- GENERATION_ERROR: ${String(err)} -->`),
        );
      } finally {
        controller.close();
      }
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
