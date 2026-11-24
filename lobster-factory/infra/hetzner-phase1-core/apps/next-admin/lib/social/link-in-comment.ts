// K23: the auto pipeline's Facebook and Instagram posts carry no web address in their text; the article's link goes in
// the post's first comment instead (operator 2026-11-24, wording verbatim). Comments belong to the whole post
// (social_post_comments), so each of the two channels is its own draft (make.ts makeSocial). Pure: make.ts sendSocial
// writes what this returns onto the draft, so the editor and the preview show it and a person can change it.
import { scriptOfLanguage } from "./post-language";
import { withUtm } from "./compose";

export type LinkInCommentChannel = "facebook" | "instagram";

/** The channel whose posts take the link in a comment, or null (every other platform keeps link_url). */
export function linkInCommentChannel(platform: string): LinkInCommentChannel | null {
  if (platform === "facebook") return "facebook";
  return platform === "instagram" || platform === "instagram-standalone" ? "instagram" : null;
}

interface Texts { igLines(title: string): string; fbEnding: string; fbComment(title: string, url: string): string }

/** By the site's language (brand-voice siteLanguage): any Chinese = the operator's exact text; every other = English. */
const TEXTS: Record<"zh" | "en", Texts> = {
  zh: {
    igLines: (title) => `完整文章｜〈${title}〉\n點擊「個人檔案連結」，搜尋文章標題`,
    fbEnding: "完整文章內容請看「留言區」",
    fbComment: (title, url) => `完整文章｜〈${title}〉\n${url}`,
  },
  en: {
    igLines: (title) => `Full article | "${title}"\nTap the link in our profile and search for the article title`,
    fbEnding: "The full article is in the comments",
    fbComment: (title, url) => `Full article | "${title}"\n${url}`,
  },
};

/** The text's ending and the first comment for one channel. Instagram's comment repeats its ending (no address on
 *  Instagram at all); Facebook's comment carries the link, with UTM when the post has it on (compose.ts withUtm). */
export function linkInCommentTexts(channel: LinkInCommentChannel, language: string, title: string, link: string, utm: boolean): { ending: string; comment: string } {
  const x = TEXTS[scriptOfLanguage(language) === "zh" ? "zh" : "en"];
  if (channel === "instagram") return { ending: x.igLines(title), comment: x.igLines(title) };
  return { ending: x.fbEnding, comment: x.fbComment(title, utm ? withUtm(link, "facebook") : link) };
}

interface DraftLike {
  body: string;
  targets: ReadonlyArray<{ account_id: string; custom_body: string | null; format: string }>;
  comments: ReadonlyArray<{ position: number; body: string; delay_minutes: number; media_id: string | null }>;
}
type Comment = { body: string; delay_minutes: 0 | 1 | 5 | 60; media_id: string | null };

// The ending goes above the text's last lines when those are only hashtags (operator 2026-11-24: under a row of tags a
// reader misses it); a tag inside a sentence is not such a line, so that text gets the ending at its end.
const TAG_LINE = /^(?:\s*#[\p{L}\p{M}\p{N}_]+)+\s*$/u;
export function withEnding(text: string, ending: string): string {
  if (text.includes(ending)) return text;
  if (!text.trim()) return ending;
  const lines = text.trimEnd().split("\n");
  let i = lines.length;
  while (i > 0 && (TAG_LINE.test(lines[i - 1]) || !lines[i - 1].trim())) i--;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i === lines.length) return `${lines.join("\n")}\n\n${ending}`;
  const tags = lines.slice(i).join("\n"), head = lines.slice(0, i).join("\n").trimEnd();
  return head ? `${head}\n\n${ending}\n\n${tags}` : `${ending}\n\n${tags}`;
}

/**
 * The draft with the ending under its text and the comment first. What is there already is not added again (a rerun
 * after a crash between the write and its record). A story target shows no comments (compose.ts), so it gets no ending:
 * it keeps its text as its own. null = nothing to change. targets / comments null = unchanged.
 */
export function withLinkInComment(post: DraftLike, ending: string, comment: string): { body: string; targets: Array<{ account_id: string; custom_body: string | null; format: string }> | null; comments: Comment[] | null } | null {
  const body = withEnding(post.body, ending);
  let targetsChanged = false;
  const targets = post.targets.map((x) => {
    const own = x.format === "story" ? x.custom_body ?? post.body : x.custom_body === null ? null : withEnding(x.custom_body, ending);
    if (own !== x.custom_body) targetsChanged = true;
    return { account_id: x.account_id, custom_body: own, format: x.format };
  });
  const current = [...post.comments].sort((a, b) => a.position - b.position);
  const comments: Comment[] | null = current.some((c) => c.body === comment) ? null
    : [{ body: comment, delay_minutes: 0, media_id: null },
      ...current.map((c) => ({ body: c.body, delay_minutes: c.delay_minutes as Comment["delay_minutes"], media_id: c.media_id }))];
  if (body === post.body && !targetsChanged && !comments) return null;
  return { body, targets: targetsChanged ? targets : null, comments };
}
