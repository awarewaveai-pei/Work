import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SIZE_TOKENS: Record<string, number> = { short: 2048, medium: 4096, long: 6144 };
const SIZE_WORDS: Record<string, string>  = { short: "~1200", medium: "~2500", long: "~4000" };

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

const SYSTEM_PROMPT = `You are a professional SEO/GEO content writer. Write a complete, publication-ready article in Markdown.

DEFAULT OUTPUT FORMAT (follow unless overridden in user instructions):
1. # H1 title
2. ## Quick Answer (80–150 words; first sentence directly answers the main question)
3. ## Key Takeaways (4–5 bullet points)
4. Main body sections — each H2 answers one specific reader question; use H3 sub-sections where helpful
5. At least one comparison or evaluation table
6. ## FAQ (5–8 questions; each answer is 40–120 words; first sentence directly answers; no vague pronouns)
7. ## Conclusion (with a clear CTA)

RULES:
- Output clean Markdown only — no preamble, no "here is your article" opener
- Use brand facts from the instructions provided; mark any unverified brand claim with <!-- NEEDS_BRAND_VERIFY --> inline
- Mark any statistic, superlative, or claim requiring a source with <!-- NEEDS_FACT_CHECK -->
- YMYL (health/wellness/mental health): include a brief disclaimer that this is educational content — not medical treatment, psychotherapy, or a substitute for professional care. Add crisis line if content is Taiwan-facing: 台灣安心專線 1925 / 生命線 1995
- FORBIDDEN: cure / treat illness / heal illness / diagnose / guaranteed results / therapy (unless drawing a clear distinction from your own service) / therapist (same rule)
- No keyword stuffing — use the primary keyword naturally
- FAQ answers must be self-contained; spell out names/brand/place instead of using "it", "this approach", "above"

RANK MATH COMPLIANCE (mandatory for every article):
- Primary keyword must appear in: H1 title, first paragraph (within first 150 words), at least one H2 or H3 heading
- Keyword density: 1–1.5%; do not repeat exact phrase more than once per 100 words
- Minimum 600 words; target 1200+ for medium, 2500+ for long
- No paragraph longer than 120 words; split into shorter paragraphs
- Include at least 1 external reference link cited inline with natural anchor text
- For articles >1500 words: add a Table of Contents (bulleted list) immediately after H1`;

interface ArticleStructure {
  quickAnswer?: boolean;
  keyTakeaways?: boolean;
  comparisonTable?: boolean;
  faq?: boolean;
  conclusion?: boolean;
}

const ALLOWED_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-8",
];

async function fetchUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 3000);
  } catch {
    return "";
  }
}

function buildUserPrompt(params: {
  keyword: string;
  title: string;
  language: string;
  targetCountry: string;
  articleType: string;
  articleSize: string;
  tone: string;
  pointOfView: string;
  readability: string;
  removeAiWords: string;
  details: string;
  nlpKeywords: string;
  outline: string;
  externalLinks: string[];
  internalLinks: string[];
  referenceContext: string;
  structure: ArticleStructure;
  generateMeta: boolean;
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
  if (params.targetCountry && params.targetCountry !== "Global") {
    lines.push(`Target country/audience: ${params.targetCountry}`);
  }
  lines.push(`Article type: ${params.articleType}`);
  lines.push(`Target length: ${SIZE_WORDS[params.articleSize] ?? "~2500"} words`);
  lines.push(`Tone of voice: ${params.tone}`);
  if (params.pointOfView !== "none") lines.push(`Point of view: ${params.pointOfView}`);
  lines.push(`Text readability: ${params.readability}`);

  // Structure overrides
  const s = params.structure;
  if (s.quickAnswer === false)    lines.push("DO NOT include a Quick Answer section.");
  if (s.keyTakeaways === false)   lines.push("DO NOT include a Key Takeaways section.");
  if (s.comparisonTable === false) lines.push("DO NOT include a comparison or evaluation table.");
  if (s.faq === false)            lines.push("DO NOT include a FAQ section.");
  if (s.conclusion === false)     lines.push("DO NOT include a Conclusion section.");

  // Remove AI words
  if (params.removeAiWords === "basic") {
    lines.push(`\nAVOID these overused AI filler words: ${AI_WORDS_BASIC.join(", ")}`);
  } else if (params.removeAiWords === "extended") {
    lines.push(`\nAVOID these overused AI filler words: ${AI_WORDS_EXTENDED.join(", ")}`);
  }

  // NLP keywords
  if (params.nlpKeywords.trim()) {
    lines.push("");
    lines.push("SEO/NLP keywords to include naturally (do not keyword-stuff):");
    lines.push(params.nlpKeywords.trim());
  }

  // Custom outline
  if (params.outline.trim()) {
    lines.push("");
    lines.push("Custom article outline (follow this heading structure exactly):");
    lines.push(params.outline.trim());
  }

  // Reference context (Connect to Web)
  if (params.referenceContext.trim()) {
    lines.push("");
    lines.push("=== REFERENCE CONTENT (use as factual context, cite appropriately) ===");
    lines.push(params.referenceContext.trim());
    lines.push("=== END REFERENCE CONTENT ===");
  }

  // External links
  const validLinks = params.externalLinks.filter(u => /^https?:\/\//.test(u.trim()));
  if (validLinks.length > 0) {
    lines.push("");
    lines.push("External links to include naturally as contextual anchors:");
    validLinks.forEach(u => lines.push(`- ${u.trim()}`));
  }

  // Internal links
  const validInternal = params.internalLinks.filter(u => /^(https?:\/\/|\/[/#])/.test(u.trim()));
  if (validInternal.length > 0) {
    lines.push("");
    lines.push("Internal links to weave naturally into the article content (use relevant anchor text, not 'click here'):");
    validInternal.forEach(u => lines.push(`- ${u.trim()}`));
  }

  lines.push("");
  lines.push("Write the complete article now.");

  // Meta generation
  if (params.generateMeta) {
    lines.push("");
    lines.push("IMPORTANT: After the full article, append exactly this meta block:");
    lines.push("<!-- CONTENT_META_START -->");
    lines.push("SEO_TITLE: [50-60 char SEO title, primary keyword in first half of title]");
    lines.push("META_DESC: [145-155 char meta description, includes primary keyword]");
    lines.push("FOCUS_KEYWORD: [the primary keyword exactly as provided]");
    lines.push("<!-- CONTENT_META_END -->");
  }

  return lines.join("\n");
}

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

  const str  = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
  const bool = (v: unknown, fb = true) => (typeof v === "boolean" ? v : fb);
  const sarr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const keyword = str(body.keyword).trim();
  if (!keyword) return new NextResponse("keyword required", { status: 400 });

  const rawStruct = (body.structure ?? {}) as Record<string, unknown>;
  const structure: ArticleStructure = {
    quickAnswer:    bool(rawStruct.quickAnswer),
    keyTakeaways:   bool(rawStruct.keyTakeaways),
    comparisonTable: bool(rawStruct.comparisonTable),
    faq:            bool(rawStruct.faq),
    conclusion:     bool(rawStruct.conclusion),
  };

  const maxTokens  = SIZE_TOKENS[str(body.articleSize, "medium")] ?? 4096;
  // Fetch reference URLs (Connect to Web)
  const referenceUrls = sarr(body.referenceUrls).filter(u => /^https?:\/\//.test(u)).slice(0, 3);
  let referenceContext = "";
  if (referenceUrls.length > 0) {
    const fetched = await Promise.all(referenceUrls.map(async (url) => {
      const text = await fetchUrlText(url);
      return text ? `--- Source: ${url} ---\n${text}` : "";
    }));
    referenceContext = fetched.filter(Boolean).join("\n\n");
  }

  // Internal links
  const internalLinks = sarr(body.internalLinks).filter(u => /^(https?:\/\/|\/[/#])/.test(u.trim())).slice(0, 10);

  // Model selection (default: sonnet)
  const requestedModel = str(body.model, "claude-sonnet-4-6");
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : "claude-sonnet-4-6";

  const userPrompt = buildUserPrompt({
    keyword,
    title:         str(body.title),
    language:      str(body.language, "English"),
    targetCountry: str(body.targetCountry, "Global"),
    articleType:   str(body.articleType, "Pillar Article"),
    articleSize:   str(body.articleSize, "medium"),
    tone:          str(body.tone, "Friendly"),
    pointOfView:   str(body.pointOfView, "none"),
    readability:   str(body.readability, "8th grade"),
    removeAiWords: str(body.removeAiWords, "none"),
    details:       str(body.details),
    nlpKeywords:   str(body.nlpKeywords),
    outline:       str(body.outline),
    externalLinks: sarr(body.externalLinks),
    internalLinks,
    referenceContext,
    structure,
    generateMeta: bool(body.generateMeta, false),
  });

  const client = new Anthropic({ apiKey });
  let anthropicStream: ReturnType<typeof client.messages.stream> | null = null;

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        anthropicStream = client.messages.stream({
          model,
          max_tokens: maxTokens,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        });

        req.signal.addEventListener("abort", () => {
          anthropicStream?.abort();
        });

        for await (const event of anthropicStream) {
          if (req.signal.aborted) break;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        if (!req.signal.aborted) {
          const isAnthropicErr = err instanceof Error && err.message.length > 0;
          const msg = isAnthropicErr ? "Claude API error" : "Unknown error";
          controller.enqueue(encoder.encode(`\n\n<!-- GENERATION_ERROR: ${msg} -->`));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      anthropicStream?.abort();
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
