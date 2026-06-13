import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const keyword     = (typeof body.keyword     === "string" ? body.keyword     : "").trim();
  const language    = (typeof body.language    === "string" ? body.language    : "English");
  const articleType = (typeof body.articleType === "string" ? body.articleType : "Pillar Article");

  if (!keyword) return new NextResponse("keyword required", { status: 400 });

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    messages: [{
      role: "user",
      content: `Generate 20 NLP/LSI (Latent Semantic Indexing) keywords for an SEO article about: "${keyword}"
Language: ${language}
Article type: ${articleType}

Requirements:
- Include long-tail variations, related terms, and semantic synonyms
- Mix single-word and multi-word phrases
- Relevant to the topic (not generic filler)
- Avoid repeating the main keyword itself

Return ONLY a valid JSON array of 20 keyword strings, no explanations.
Example: ["keyword one", "phrase two", "term three"]`,
    }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const kws   = JSON.parse(match?.[0] ?? "[]") as unknown[];
    const valid = kws.filter((k): k is string => typeof k === "string").slice(0, 20);
    return NextResponse.json({ ok: true, keywords: valid });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse keywords" }, { status: 500 });
  }
}
