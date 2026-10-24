// One social post writer (AUTO_CONTENT_EXECUTION_PLAN.md I2). The article tool (/api/content/syndicate), the social
// composer's AI rewrite (/api/social/rewrite), ScriptForge and the scheduled pipeline all call writeSocialPosts.
// A platform's hard length lives only in BODY_LIMITS (limits.ts, what Postiz enforces); the prompt states it from
// there, and every answer is measured with the same bodyLength before anyone may send it. The style lines below carry
// tone and shape only, never a second length number.
import { BODY_LIMITS, bodyLength } from "./limits";

/** How each writer platform is written; `limit` = its BODY_LIMITS key, `perLine` = the limit applies to each line. */
interface WriterPlatform { style: string; video?: string; limit?: string; perLine?: boolean }

const PLATFORMS = {
  twitter_single: { limit: "x", style: "Twitter/X (single post): punchy, hook first. 2-3 relevant hashtags at the end.",
    video: "Copy for an X video post: hook first, let the video explain." },
  twitter_thread: { limit: "x", perLine: true, style: "Twitter/X thread: 5-7 posts, each on its own line and numbered '2/7', '3/7' etc. Post 1 = hook + main insight; the middle posts = one key point each; the last = CTA with the article link placeholder [LINK]." },
  instagram: { limit: "instagram", style: "Instagram caption: hook in the first 3 lines, storytelling style, clear CTA at the end. Then a line break and 20-30 hashtags starting with #. Include [LINK] where appropriate.",
    video: "Copy for an Instagram Reel (9:16): first line = hook emoji + punchy statement; the video tells the story, the caption adds emotional pull." },
  threads: { limit: "threads", style: "Threads post: conversational, authentic, community-first, warm and direct. At most 3 hashtags. End with a question that invites replies.",
    video: "Copy for a Threads video post: conversational, adds context the video does not say out loud." },
  linkedin: { limit: "linkedin", style: "LinkedIn: professional post, 150-300 words. Strong first line, 3 key insights as bullet points, end with a question or CTA, 3-5 hashtags.",
    video: "Copy for a LinkedIn video post: professional opener ('New video:', 'Just released:'), one key takeaway." },
  facebook: { limit: "facebook", style: "Facebook: conversational post of 80-180 words, warm and engaging, opening with a relatable question or surprising fact. No hashtags.",
    video: "Copy for a Facebook video post: engaging opening question or surprising fact; the video is the main content." },
  whatsapp: { style: "WhatsApp broadcast: short, friendly, personal, 50-100 words. No hashtags, no markdown. Article link placeholder [LINK] at the end." },
  pinterest: { limit: "pinterest", style: "Pinterest pin description: visual, inspirational, 5-8 keywords woven in naturally, clear CTA ('Save this for later!'), a few hashtags.",
    video: "Copy for a Pinterest video pin (4:5): inspirational tone, 3-5 keywords, end with a save CTA." },
  reddit: { limit: "reddit", style: "Reddit post: value-first, humble, no promotional language. Title on the first line (a curiosity-driven question or surprising insight), then 'BODY:' and a detailed body. No hashtags; a link only if it genuinely adds value.",
    video: "Copy for a Reddit video post: the title says what the video shows (no hype); the body gives brief context and why it matters." },
  tiktok: { limit: "tiktok", style: "TikTok caption: ultra-short, high-energy, under 100 words. Hook in the first sentence ('POV:', 'Tell me why'). 3-5 trending hashtags; end with a challenge or duet prompt if it fits.",
    video: "Copy for a short vertical video (9:16): open with a hook word ('Watch:', 'POV:'); complement the video, do not describe it." },
  email: { style: "Email newsletter snippet, 150-250 words, formatted as:\nSUBJECT: [subject]\nPREVIEW: [preview text under 100 chars]\nBODY:\n[body]\nPersonal and conversational; end with CTA button text in [brackets]." },
} satisfies Record<string, WriterPlatform>;

export type WriterKey = keyof typeof PLATFORMS;
export const WRITER_KEYS = Object.keys(PLATFORMS) as WriterKey[];
export const isWriterKey = (k: string): k is WriterKey => k in PLATFORMS;

/** Postiz providerIdentifier -> the writer key that writes for it (X and Bluesky share the single post; Bluesky's 300 > X's 280). */
const FOR_POSTIZ: Record<string, WriterKey> = {
  facebook: "facebook", instagram: "instagram", "instagram-standalone": "instagram", threads: "threads",
  linkedin: "linkedin", "linkedin-page": "linkedin", x: "twitter_single", bluesky: "twitter_single",
  pinterest: "pinterest", tiktok: "tiktok", reddit: "reddit",
};

/** The writer keys to ask for, given the channels' Postiz platforms (unsupported platforms are left out). */
export function writerKeysFor(postizPlatforms: string[]): WriterKey[] {
  return [...new Set(postizPlatforms.map((p) => FOR_POSTIZ[p]).filter((k): k is WriterKey => !!k))];
}

/** Each channel's own text from the writer's answer; a channel with no usable answer (missing, empty, too long) keeps the shared text. */
export function textsForAccounts(result: Pick<WriteResult, "posts" | "tooLong">, accounts: Array<{ id: string; platform: string }>): Record<string, string> {
  const long = new Set(result.tooLong.map((t) => t.key));
  const out: Record<string, string> = {};
  for (const a of accounts) {
    const k = FOR_POSTIZ[a.platform];
    const text = k && !long.has(k) ? result.posts[k]?.trim() : "";
    if (text) out[a.id] = text;
  }
  return out;
}

function limitPhrase(p: WriterPlatform): string {
  if (!p.limit) return "";
  const n = BODY_LIMITS[p.limit];
  if (p.limit === "threads") return ` Hard limit: ${n} bytes in UTF-8 (about ${Math.floor(n / 3)} Chinese characters).`;
  return p.perLine ? ` Hard limit: ${n} characters per post.` : ` Hard limit: ${n} characters including hashtags and links.`;
}

/** Measured length of a post against its platform's hard limit (per line for a thread); null = within limit or no limit. */
export function overLength(key: WriterKey, text: string): { length: number; limit: number } | null {
  const p: WriterPlatform = PLATFORMS[key];
  if (!p.limit) return null;
  const limit = BODY_LIMITS[p.limit];
  const parts = p.perLine ? text.split("\n").map((l) => l.trim()).filter(Boolean) : [text];
  const length = Math.max(0, ...parts.map((s) => bodyLength(p.limit!, s)));
  return length > limit ? { length, limit } : null;
}

export interface WriteInput {
  article: string;
  keys: WriterKey[];
  mediaType?: "text" | "image" | "video" | string;
  articleUrl?: string;
  /** Rendered brand voice (lib/content/brand-voice.ts renderSiteVoice); "" = none. */
  voice?: string;
}

export interface WriteResult {
  posts: Partial<Record<WriterKey, string>>;
  /** Still over the hard limit after one shorter rewrite: shown to a person, never sent. */
  tooLong: Array<{ key: WriterKey; length: number; limit: number }>;
  /** Asked for but not answered (missing, empty or not text) even after the retry: the caller says so. */
  missing: WriterKey[];
}

export class WriterParseError extends Error {}

/** AI calls one write may make: the first answer plus one shorter rewrite. Price displays use it for the upper bound. */
export const MAX_WRITER_CALLS = 2;

export function buildPrompt(input: WriteInput, keys: WriterKey[], shorten: WriteResult["tooLong"] = []): string {
  const video = input.mediaType === "video";
  const specs = keys.map((k) => {
    const p: WriterPlatform = PLATFORMS[k];
    return `- ${k}: ${video && p.video ? `${p.video} ` : ""}${p.style}${limitPhrase(p)}`;
  }).join("\n");
  const urlLine = input.articleUrl
    ? `\nArticle URL (use as [LINK] where indicated): ${input.articleUrl}`
    : "\nThere is no article link: do not write [LINK] or any placeholder for one.";
  const mediaLine = video
    ? "\nIMPORTANT: This content will accompany a VIDEO. Write captions/copy that complement the video — do NOT describe the video or repeat its script."
    : input.mediaType === "image" ? "\nThis content will accompany an IMAGE. Reference the visual without describing it literally." : "";
  const voiceBlock = input.voice ? `\nBrand voice (follow it in every post; never use a forbidden claim):\n${input.voice}\n` : "";
  const shortenBlock = shorten.length
    ? `\nYour previous versions were too long: ${shorten.map((t) => `${t.key} ${t.length}/${t.limit}`).join(", ")}. Write each one clearly shorter than its hard limit.\n`
    : "";
  return `Create social media posts from this article for these platforms:
${specs}${urlLine}${mediaLine}
${voiceBlock}${shortenBlock}
Article (first 3000 chars):
${input.article.slice(0, 3000)}

Return ONLY a valid JSON object with platform keys and post content as string values.
Use these exact keys: ${keys.map((k) => `"${k}"`).join(", ")}`;
}

function parsePosts(text: string, keys: WriterKey[], articleUrl?: string): Partial<Record<WriterKey, string>> {
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "") as Record<string, unknown>; }   // no object at all = unreadable, not "no posts"
  catch { throw new WriterParseError("Failed to parse social posts"); }
  const out: Partial<Record<WriterKey, string>> = {};
  for (const k of keys) {
    const v = raw[k];
    if (typeof v !== "string" || !v.trim()) continue;
    // no URL: a placeholder the model wrote anyway is removed, never published
    out[k] = articleUrl ? v.replace(/\[LINK\]/g, articleUrl) : v.replace(/[ \t]*\[LINK\]/g, "").trim();
  }
  return out;
}

/**
 * Writes every requested platform in one AI call; posts over their hard limit get one shorter rewrite, and what is
 * still too long comes back in tooLong. `ask` makes one AI call and returns its text (the caller owns the client,
 * the grant, logging and cost).
 */
export async function writeSocialPosts(input: WriteInput, ask: (prompt: string) => Promise<string>): Promise<WriteResult> {
  const keys = [...new Set(input.keys)];
  const posts = parsePosts(await ask(buildPrompt(input, keys)), keys, input.articleUrl);
  const measure = (ks: WriterKey[]) => ks.flatMap((k) => {
    const o = posts[k] === undefined ? null : overLength(k, posts[k]!);
    return o ? [{ key: k, ...o }] : [];
  });
  const unanswered = () => keys.filter((k) => posts[k] === undefined);
  let tooLong = measure(keys);
  if (tooLong.length || unanswered().length) {
    const retryKeys = [...tooLong.map((t) => t.key), ...unanswered()];
    try {
      Object.assign(posts, parsePosts(await ask(buildPrompt(input, retryKeys, tooLong)), retryKeys, input.articleUrl));
      tooLong = measure(keys);
    } catch (e) {
      if (!(e instanceof WriterParseError)) throw e;   // an unreadable retry keeps the first answer
    }
  }
  return { posts, tooLong, missing: unanswered() };
}
