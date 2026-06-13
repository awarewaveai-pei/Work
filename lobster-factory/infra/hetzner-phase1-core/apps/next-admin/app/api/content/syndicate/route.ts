import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_SPECS: Record<string, string> = {
  twitter:   "Twitter/X: 1 tweet (max 280 chars total including hashtags). Punchy, hook-first. End with 2-3 relevant hashtags.",
  linkedin:  "LinkedIn: Professional post 150-300 words. Open with a hook, share insight, end with a question or CTA. 3-5 hashtags at end.",
  facebook:  "Facebook: Conversational post 80-180 words. Warm, engaging tone. No hashtags needed.",
};

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new NextResponse("ANTHROPIC_API_KEY not configured", { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new NextResponse("invalid json", { status: 400 }); }

  const article = (typeof body.article === "string" ? body.article : "").trim();
  if (!article) return new NextResponse("article required", { status: 400 });

  const platforms = Array.isArray(body.platforms)
    ? body.platforms.filter((p): p is string => typeof p === "string" && p in PLATFORM_SPECS)
    : [];
  if (platforms.length === 0) return new NextResponse("no valid platforms", { status: 400 });

  const articleUrl = typeof body.articleUrl === "string" ? body.articleUrl.trim() : "";
  const urlLine = articleUrl ? `\nArticle URL to include: ${articleUrl}` : "";

  const specs = platforms.map(p => `- ${PLATFORM_SPECS[p]}`).join("\n");

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    messages: [{
      role: "user",
      content: `Create social media posts from this article for these platforms:
${specs}${urlLine}

Article (first 3000 chars):
${article.slice(0, 3000)}

Return ONLY a valid JSON object with platform names as keys and post content as string values.
Example: {"twitter": "...", "linkedin": "...", "facebook": "..."}`,
    }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const posts = JSON.parse(match?.[0] ?? "{}") as Record<string, unknown>;
    const filtered: Record<string, string> = {};
    for (const p of platforms) {
      if (typeof posts[p] === "string") filtered[p] = posts[p] as string;
    }
    return NextResponse.json({ ok: true, posts: filtered });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse social posts" }, { status: 500 });
  }
}
