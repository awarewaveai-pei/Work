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

  const keyword = (typeof body.keyword === "string" ? body.keyword : "").trim();
  if (!keyword) return new NextResponse("keyword required", { status: 400 });

  const language = typeof body.language === "string" ? body.language : "English";
  const articleType = typeof body.articleType === "string" ? body.articleType : "Pillar Article";

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `Generate 5 compelling SEO-optimized article titles for the keyword: "${keyword}"
Language: ${language}
Article type: ${articleType}

Requirements:
- Each title should be 50-70 characters
- Include the main keyword naturally
- Be specific and benefit-driven
- Avoid clickbait

Return ONLY a valid JSON array of 5 title strings, nothing else.
Example: ["Title One Here", "Title Two Here", "Title Three Here", "Title Four Here", "Title Five Here"]`,
    }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    const match = text.match(/\[[\s\S]*\]/);
    const titles = JSON.parse(match?.[0] ?? "[]") as unknown[];
    const valid = titles.filter((t): t is string => typeof t === "string").slice(0, 5);
    return NextResponse.json({ ok: true, titles: valid });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse title suggestions" }, { status: 500 });
  }
}
