import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import type { RankMathCheck } from "@/lib/seo/rankmath-checker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are an SEO optimization assistant. You receive a Markdown article that failed certain RankMath SEO checks. Improve the article to pass those specific checks while preserving the original voice, tone, and structure.

RULES:
- Make only the minimum changes needed to pass the listed failed checks
- Preserve the author's creative choices, personality, and all existing content
- FORBIDDEN vocabulary: cure / treat illness / heal illness / diagnose / guaranteed results / therapy (unless explicitly framed as a distinct service) / therapist (same rule)
- YMYL content: retain any existing disclaimer or crisis hotlines (e.g. 台灣安心專線 1925 / 生命線 1995)
- Never keyword-stuff — every keyword use must feel natural to the reader
- For word-count failures: expand naturally with examples, details, or an FAQ section
- For link failures: add plausible placeholder URLs that the editor can verify/replace
- Output the COMPLETE improved article in Markdown only — no preamble
- If you also improve the SEO title or meta description, append a meta block at the very end:
<!-- CONTENT_META_START -->
SEO_TITLE: [improved title here]
META_DESC: [improved description here]
<!-- CONTENT_META_END -->
- If no title/meta changes are needed, omit the block entirely`;

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

  const str = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
  const markdown       = str(body.markdown).trim();
  const focusKeyword   = str(body.focusKeyword).trim();
  const seoTitle       = str(body.seoTitle).trim();
  const metaDescription = str(body.metaDescription).trim();
  const slug           = str(body.slug).trim();
  const failedChecks   = (Array.isArray(body.failedChecks) ? body.failedChecks : [])
    .filter((c: unknown) => c && typeof (c as RankMathCheck).label === "string" && typeof (c as RankMathCheck).detail === "string") as RankMathCheck[];

  if (!markdown)     return new NextResponse("markdown required", { status: 400 });
  if (!focusKeyword) return new NextResponse("focusKeyword required", { status: 400 });
  if (failedChecks.length === 0) return NextResponse.json({ ok: true, markdown });

  const failedList = failedChecks
    .map(c => `- **${c.label}**: ${c.detail}${c.suggestion ? `\n  建議：${c.suggestion}` : ""}`)
    .join("\n");

  const userPrompt = `Article to improve:
\`\`\`markdown
${markdown}
\`\`\`

Focus keyword: ${focusKeyword}
Current SEO title: ${seoTitle || "(none)"}
Current meta description: ${metaDescription || "(none)"}
Slug: ${slug || "(none)"}

Failed SEO checks to fix:
${failedList}

Please output the COMPLETE improved article. Fix ONLY the listed failed checks — do not change what already passes.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Aggregate all text blocks (Anthropic may return multiple content blocks)
    const text = msg.content.filter(b => b.type === "text").map(b => (b as { type: "text"; text: string }).text).join("");
    if (!text) return new NextResponse("empty response from AI", { status: 502 });

    // Parse optional meta block — use tolerant per-field regexes before stripping
    const blockMatch = text.match(/<!-- CONTENT_META_START -->([\s\S]*?)<!-- CONTENT_META_END -->/);
    const block = blockMatch ? blockMatch[1] : "";
    const titleMatch = block.match(/SEO_TITLE:\s*(.+)/);
    const metaDescMatch = block.match(/META_DESC:\s*(.+)/);
    const fixedSeoTitle        = titleMatch    ? titleMatch[1].trim()    : undefined;
    const fixedMetaDescription = metaDescMatch ? metaDescMatch[1].trim() : undefined;
    // Strip the block only when successfully parsed (or when block was present but fields missing)
    const fixedMarkdown = blockMatch
      ? text.replace(/<!-- CONTENT_META_START -->[\s\S]*?<!-- CONTENT_META_END -->/g, "").trim()
      : text.trim();

    return NextResponse.json({
      ok: true,
      markdown: fixedMarkdown,
      seoTitle: fixedSeoTitle,
      metaDescription: fixedMetaDescription,
    });
  } catch (err) {
    console.error("[seo-fix] Anthropic error:", err);
    return NextResponse.json({ ok: false, error: "AI 修正失敗，請重試" }, { status: 500 });
  }
}
