import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_SPECS: Record<string, string> = {
  twitter_single:  "Twitter/X (single tweet): max 280 chars total including hashtags. Punchy, hook-first. 2-3 relevant hashtags at end.",
  twitter_thread:  "Twitter/X Thread: 5-7 tweets. Tweet 1 = hook + main insight. Tweets 2-6 = one key point each (max 250 chars per tweet, numbered '2/7', '3/7' etc). Last tweet = CTA with article link placeholder [LINK]. Format: each tweet on its own line, start with tweet number.",
  linkedin:        "LinkedIn: Professional post 150-300 words. Open with a strong hook (bold first line), share 3 key insights as bullet points, end with a question or CTA. 3-5 relevant hashtags at end.",
  facebook:        "Facebook: Conversational post 80-180 words. Warm, engaging tone. Start with a relatable question or surprising fact. No hashtags needed.",
  whatsapp:        "WhatsApp broadcast message: Short, friendly, personal tone. 50-100 words. No hashtags. Include article link placeholder [LINK] at end. Use simple formatting (no markdown).",
  pinterest:       "Pinterest pin description: 100-200 words. Visual, inspirational tone. Include 5-8 relevant keywords woven in naturally. End with clear CTA ('Save this for later!' or 'Click to read more!'). Include relevant hashtags.",
  email:           "Email newsletter snippet: Subject line + preview text + body (150-250 words). Format as:\nSUBJECT: [subject here]\nPREVIEW: [preview text under 100 chars]\nBODY:\n[newsletter body]\n\nBe personal, conversational, and end with a clear CTA button text in [brackets].",
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

  // Accept both platform keys and twitter_mode
  const rawPlatforms = Array.isArray(body.platforms)
    ? body.platforms.filter((p): p is string => typeof p === "string")
    : [];
  const twitterMode = typeof body.twitterMode === "string" ? body.twitterMode : "single";

  // Normalize platform keys
  const platforms = rawPlatforms
    .map(p => {
      if (p === "twitter") return twitterMode === "thread" ? "twitter_thread" : "twitter_single";
      return p;
    })
    .filter(p => p in PLATFORM_SPECS);

  if (platforms.length === 0) return new NextResponse("no valid platforms", { status: 400 });

  const articleUrl = typeof body.articleUrl === "string" ? body.articleUrl.trim() : "";
  const urlLine = articleUrl ? `\nArticle URL (use as [LINK] where indicated): ${articleUrl}` : "";

  const specs = platforms.map(p => `- ${PLATFORM_SPECS[p]}`).join("\n");

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Create social media posts from this article for these platforms:
${specs}${urlLine}

Article (first 3000 chars):
${article.slice(0, 3000)}

Return ONLY a valid JSON object with platform keys and post content as string values.
Use these exact keys: ${platforms.map(p => `"${p}"`).join(", ")}
Example: {"twitter_single": "...", "linkedin": "...", "email": "..."}`,
    }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const posts = JSON.parse(match?.[0] ?? "{}") as Record<string, unknown>;
    const filtered: Record<string, string> = {};
    for (const p of platforms) {
      if (typeof posts[p] === "string") {
        // Replace [LINK] placeholder with actual URL if available
        filtered[p] = articleUrl
          ? (posts[p] as string).replace(/\[LINK\]/g, articleUrl)
          : (posts[p] as string);
      }
    }
    return NextResponse.json({ ok: true, posts: filtered });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse social posts" }, { status: 500 });
  }
}
