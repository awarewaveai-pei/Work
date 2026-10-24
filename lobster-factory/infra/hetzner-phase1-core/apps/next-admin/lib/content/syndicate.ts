import type { Grant } from "@/lib/entitlements/can";
import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { resolveTextRate } from "@/lib/ai/cost-calculator";
import { claudeWriter } from "@/lib/social/write-posts-claude";
import { isWriterKey, writeSocialPosts, WriterParseError, type WriterKey } from "@/lib/social/write-posts";
import { siteVoiceFor } from "./brand-voice-store";

/**
 * The article -> per-platform rewrite over HTTP. Content serves it as content.syndicate, social as social.rewrite (its
 * own door). The writing itself is lib/social/write-posts.ts (shared with ScriptForge and the scheduled pipeline);
 * this shell does the role check, brand voice lookup, the AI client, logging and cost.
 */
export const syndicateHandler = (route: string) => (req: Request, grant: Grant) => handlePost(req, grant, route);

async function handlePost(req: Request, grant: Grant, route: string): Promise<Response> {
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

  // Writer keys, plus the article tool's older "twitter" + twitterMode pair.
  const twitterMode = typeof body.twitterMode === "string" ? body.twitterMode : "single";
  const keys = (Array.isArray(body.platforms) ? body.platforms : [])
    .filter((p): p is string => typeof p === "string")
    .map((p) => (p === "twitter" ? (twitterMode === "thread" ? "twitter_thread" : "twitter_single") : p))
    .filter(isWriterKey) as WriterKey[];
  if (keys.length === 0) return new NextResponse("no valid platforms", { status: 400 });

  // siteId = the article's site; its stored brand voice (wp_sites.content_defaults) shapes every post.
  let voice: string | null;
  try { voice = await siteVoiceFor(req, typeof body.siteId === "string" ? body.siteId.trim() : ""); }
  catch (e) { console.error("[syndicate] brand voice lookup failed:", e); return new NextResponse("brand voice lookup failed", { status: 500 }); }
  if (voice === null) return new NextResponse("site not found", { status: 404 });

  const { ask, spent } = await claudeWriter(grant, apiKey, route, role);

  try {
    const articleUrl = typeof body.articleUrl === "string" ? body.articleUrl.trim() : "";
    const { posts, tooLong, missing } = await writeSocialPosts({ article, keys, mediaType, articleUrl, voice }, ask);
    return NextResponse.json({ ok: true, posts, tooLong, missing, _cost: { usd: spent.usd, model: spent.model, vendor: resolveTextRate(spent.model).rate.vendor } });
  } catch (e) {
    if (e instanceof WriterParseError) return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    throw e;
  }
}
