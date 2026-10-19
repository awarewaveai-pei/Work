import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { textCallCostUsd, resolveTextRate } from "@/lib/ai/cost-calculator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * When generating copy for a VIDEO post, prepend this addendum per platform.
 * The main PLATFORM_SPECS still provide format/length guidance; this adds video-specific framing.
 */
const VIDEO_PLATFORM_ADDENDUM: Record<string, string> = {
  tiktok:    "This is copy for a SHORT-FORM VERTICAL VIDEO (9:16). Open with a hook word ('Watch:', 'POV:', '⚡'). Caption complements the video — do not describe it. Max 80 words total.",
  instagram: "This is copy for an INSTAGRAM REEL (9:16 vertical video). First line = hook emoji + punchy statement. Let the video tell the story; caption adds emotional pull. Max 125 words.",
  threads:   "This is copy for a THREADS VIDEO post. Conversational, adds context the video doesn't say out loud. Max 100 words.",
  facebook:  "This is copy for a FACEBOOK VIDEO post. Engaging opening question or surprising fact. The video is the main content. Max 100 words.",
  linkedin:  "This is copy for a LINKEDIN VIDEO post. Professional opener ('New video:', 'Just released:'). One key takeaway. 80-150 words.",
  reddit:    "This is copy for a REDDIT VIDEO post. Title = what the video shows (no hype). Body = brief context + why it matters.",
  x:         "This is copy for an X/TWITTER VIDEO post. Max 240 chars. Hook first. Let the video explain.",
  bluesky:   "This is copy for a BLUESKY VIDEO post. Brief, direct, max 200 chars.",
  pinterest: "This is copy for a PINTEREST VIDEO post (4:5). Inspirational tone. Include 3-5 keywords. End with save CTA.",
  youtube:   "This is copy for a YOUTUBE video description. Hook in first 2 lines (shows above fold). Include article link as [LINK]. 150-300 words.",
};

const PLATFORM_SPECS: Record<string, string> = {
  twitter_single:  "Twitter/X (single tweet): max 280 chars total including hashtags. Punchy, hook-first. 2-3 relevant hashtags at end.",
  twitter_thread:  "Twitter/X Thread: 5-7 tweets. Tweet 1 = hook + main insight. Tweets 2-6 = one key point each (max 250 chars per tweet, numbered '2/7', '3/7' etc). Last tweet = CTA with article link placeholder [LINK]. Format: each tweet on its own line, start with tweet number.",
  instagram:       "Instagram caption: 125-150 words visible (first 3 lines are most important — hook immediately). Storytelling style. End with clear CTA. 20-30 hashtags in first comment (list them after a line break, starting with #). Include [LINK] placeholder where appropriate.",
  threads:         "Threads post: Conversational, authentic, community-first. 100-200 words. No hashtag spam (max 3 if any). Warm and direct voice. End with a thought-provoking question to drive replies.",
  linkedin:        "LinkedIn: Professional post 150-300 words. Open with a strong hook (bold first line), share 3 key insights as bullet points, end with a question or CTA. 3-5 relevant hashtags at end.",
  facebook:        "Facebook: Conversational post 80-180 words. Warm, engaging tone. Start with a relatable question or surprising fact. No hashtags needed.",
  whatsapp:        "WhatsApp broadcast message: Short, friendly, personal tone. 50-100 words. No hashtags. Include article link placeholder [LINK] at end. Use simple formatting (no markdown).",
  pinterest:       "Pinterest pin description: 100-200 words. Visual, inspirational tone. Include 5-8 relevant keywords woven in naturally. End with clear CTA ('Save this for later!' or 'Click to read more!'). Include relevant hashtags.",
  reddit:          "Reddit post: Authentic, value-first tone — redditors hate promotional language. Title: curiosity-driven question or surprising insight (max 300 chars). Body: detailed, humble, share personal experience or data. No hashtags. No promotional links unless it genuinely adds value. Format: Title on first line, then 'BODY:' then the post body.",
  tiktok:          "TikTok video caption: Ultra-short, high-energy. Max 100 words. Hook in first sentence ('POV:', 'Tell me why', 'This changed how I...'). 3-5 trending hashtags. End with a challenge or duet prompt if applicable.",
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

  // "text" | "image" | "video" — informs copy tone and length
  const mediaType = typeof body.mediaType === "string" ? body.mediaType : "text";

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

  // For video posts, prepend a platform-specific framing addendum before the format spec.
  // Strip the "twitter_single"/"twitter_thread" prefix back to "twitter" for the addendum lookup.
  const specs = platforms.map(p => {
    const lookupKey = p.replace(/^twitter.*/, "twitter");
    const addendum = mediaType === "video" ? (VIDEO_PLATFORM_ADDENDUM[lookupKey] ?? "") : "";
    return addendum ? `- ${addendum} ${PLATFORM_SPECS[p]}` : `- ${PLATFORM_SPECS[p]}`;
  }).join("\n");

  const mediaLine = mediaType === "video"
    ? "\nIMPORTANT: This content will accompany a VIDEO. Write captions/copy that complement the video — do NOT describe the video or repeat its script."
    : mediaType === "image"
    ? "\nThis content will accompany an IMAGE. Reference the visual without describing it literally."
    : "";

  const Anthropic = await loadAnthropic();
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Create social media posts from this article for these platforms:
${specs}${urlLine}${mediaLine}

Article (first 3000 chars):
${article.slice(0, 3000)}

Return ONLY a valid JSON object with platform keys and post content as string values.
Use these exact keys: ${platforms.map(p => `"${p}"`).join(", ")}
Example: {"twitter_single": "...", "linkedin": "...", "email": "..."}`,
    }],
  });

  void logAiCall({ route: "/api/content/syndicate", response: msg, actorRole: role });
  const { rate: synRate } = resolveTextRate(msg.model);
  const _cost = { usd: textCallCostUsd({ model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, cacheReadTokens: msg.usage.cache_read_input_tokens, cacheWriteTokens: msg.usage.cache_creation_input_tokens }), model: msg.model, vendor: synRate.vendor };

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
    return NextResponse.json({ ok: true, posts: filtered, _cost });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to parse social posts" }, { status: 500 });
  }
}
