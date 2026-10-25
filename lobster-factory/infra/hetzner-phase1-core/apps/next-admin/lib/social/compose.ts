// What one target sends to Postiz (SOCIAL_MANAGER_PLAN.md C5; comments C21): the text, the link (with UTM), the media,
// the comments, and the provider settings Postiz v2.25.1 validates. Pure: the dispatcher (dispatch.ts) and the C6 preview
// read the same function, so what is previewed is what is sent.
// Postiz content is HTML (sanitizePostContent keeps p/br/a/...; each provider turns it back into text): plain text is
// escaped and every line becomes a <p>, or a "<" in a post would be eaten and line breaks lost.
import { youtubeParts } from "./limits";

/** A comment posted under the post by the same account (0105 social_post_comments, in position order). */
export interface ComposeComment {
  body: string;
  /** minutes Postiz waits before this comment, counted from the one above it (the post for the first): Postiz's
   *  orchestrator sleeps 60000 * delay before each value after the first (post.workflow.v1.1.2.ts:449, v2.25.1) */
  delayMinutes: number;
  media: { postizMediaId: string | null; postizPath: string | null } | null;
}

export interface ComposeInput {
  body: string;
  customBody: string | null;
  comments: ComposeComment[];
  linkUrl: string | null;
  linkUtm: boolean;
  platform: string;
  format: string;
  media: Array<{ postizMediaId: string | null; postizPath: string | null; altText: string | null }>;
}

export interface Composed {
  values: Array<{ content: string; image: Array<{ id: string; path: string; alt?: string }>; delay?: number }>;
  settings: Record<string, unknown> & { __type: string };
  /** The text as the platform shows it (the adopt check in dispatch.ts compares Postiz's copy against it). */
  text: string;
}

export class ComposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposeError";
  }
}

/** Settings each provider's DTO requires (postiz-app v2.25.1 dtos/posts/providers-settings, read 2026-10-15).
 *  A platform not here needs fields this editor does not collect yet (Pinterest board, Reddit subreddit, TikTok
 *  privacy): sending it would only come back as a Postiz 400. YouTube's title comes from the text (compose()). */
const SETTINGS: Record<string, (format: string) => Record<string, unknown>> = {
  bluesky: () => ({}),
  threads: () => ({}),
  mastodon: () => ({}),
  telegram: () => ({}),
  linkedin: () => ({}),
  "linkedin-page": () => ({}),
  x: () => ({ who_can_reply_post: "everyone" }),
  // a Reel is a post with one video: Postiz has no reel post_type, the provider makes a video post a Reel
  // (instagram.provider.ts media_type=REELS; facebook.provider.ts /reel/)
  instagram: (f) => ({ post_type: f === "story" ? "story" : "post" }),
  "instagram-standalone": (f) => ({ post_type: f === "story" ? "story" : "post" }),
  facebook: (f) => (f === "story" ? { post_type: "story" } : {}),
  // youtube.settings.dto.ts (v2.25.1): title 2-100 and type public|private|unlisted are required; compose() adds the title
  youtube: () => ({ type: "public" }),
};


export const isVideo = (path: string | null) => !!path && /\.mp4(?:$|\?)/i.test(path);

/** Platforms whose provider comment() posts the comment's image (v2.25.1: facebook attachment_url, threads / bluesky / x
 *  media); instagram and linkedin post the comment's text only, so there an image-only comment cannot go out at all. */
export const COMMENT_MEDIA_PLATFORMS: readonly string[] = ["facebook", "threads", "bluesky", "x"];
export const commentTakesMedia = (platform: string) => COMMENT_MEDIA_PLATFORMS.includes(platform);

export const SENDABLE_PLATFORMS: readonly string[] = Object.keys(SETTINGS);

export function withUtm(url: string, platform: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ComposeError(`the link "${url.slice(0, 80)}" is not a full web address`);   // review 2026-10-15 R5: never an unexpected throw
  }
  if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", platform);
  if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "social");
  return u.toString();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function toPostizHtml(text: string): string {
  return text.split(/\r?\n/).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

/** The text a channel shows: its own or the shared text, with the link (and UTM) where the sender puts it. The limit
 *  check on save (posts.ts) counts this same text, so what passes there is what is sent. */
export function composeText(input: Pick<ComposeInput, "body" | "customBody" | "linkUrl" | "linkUtm" | "platform">): string {
  let text = input.customBody ?? input.body;
  if (input.linkUrl) {
    const link = input.linkUtm ? withUtm(input.linkUrl, input.platform) : input.linkUrl;
    if (!text.includes(input.linkUrl)) text = text.trim() ? `${text}\n\n${link}` : link;
    else if (link !== input.linkUrl) text = text.split(input.linkUrl).join(link);
  }
  return text;
}

export function compose(input: ComposeInput): Composed {
  const settingsOf = SETTINGS[input.platform];
  if (!settingsOf) throw new ComposeError(`${input.platform} needs settings this editor does not collect yet; send it from Postiz`);
  const text = composeText(input);
  const image = input.media.map((m, i) => {
    if (!m.postizMediaId || !m.postizPath) throw new ComposeError(`media item ${i + 1} is not in Postiz storage yet`);
    return { id: m.postizMediaId, path: m.postizPath, ...(m.altText?.trim() ? { alt: m.altText.trim() } : {}) };
  });
  if (!text.trim() && image.length === 0) throw new ComposeError("nothing to send: no text and no media");
  if (input.format === "reel" && !(image.length === 1 && isVideo(image[0].path))) throw new ComposeError("a Reel needs exactly one video");
  if (input.platform === "youtube") {   // one video, a title, a description; YouTube posts carry no follow-up comments here
    if (!(image.length === 1 && isVideo(image[0].path))) throw new ComposeError("a YouTube post needs exactly one video");
    const { title, description, problem } = youtubeParts(text);
    if (problem) throw new ComposeError(problem);
    return { values: [{ content: toPostizHtml(description), image }], settings: { __type: "youtube", ...settingsOf(input.format), title }, text };
  }
  const values: Composed["values"] = [{ content: toPostizHtml(text), image }];
  // a story shows no comments (the preview says the same)
  if (input.format !== "story") input.comments.forEach((c, i) => {
    if (!c.body.trim() && !c.media) return;
    const media = c.media && commentTakesMedia(input.platform) ? c.media : null;
    if (!c.body.trim() && !media) throw new ComposeError(`comment ${i + 1} is an image only, and ${input.platform} comments carry no image`);
    if (media && (!media.postizMediaId || !media.postizPath)) throw new ComposeError(`comment ${i + 1}'s image is not in Postiz storage yet`);
    values.push({
      content: toPostizHtml(c.body),
      image: media ? [{ id: media.postizMediaId as string, path: media.postizPath as string }] : [],
      ...(c.delayMinutes > 0 ? { delay: c.delayMinutes } : {}),
    });
  });
  return { values, settings: { __type: input.platform, ...settingsOf(input.format) }, text };
}
