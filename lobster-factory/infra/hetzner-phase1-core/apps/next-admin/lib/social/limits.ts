// Post body limits per Postiz providerIdentifier, from each provider's maxLength() in postiz-app v2.25.1
// (libraries/nestjs-libraries/src/integrations/social/*.provider.ts, read 2026-10-15; X = the non-premium 280).
// Postiz would refuse a longer post only at send time; saving refuses it (C4: 400) so the editor shows it first.
// A platform not listed has no limit here. Counted as people see characters (graphemes); Threads counts UTF-8 bytes.

/** C23 list grid: weekday x time slots a list may hold (one per hour per weekday); the server check and the grid's
 *  add-row button both read it, so the grid cannot build what the save refuses. */
export const MAX_LIST_SLOTS = 7 * 24;

export const BODY_LIMITS: Record<string, number> = {
  x: 280,
  bluesky: 300,
  threads: 500,
  pinterest: 500,
  tiktok: 2000,
  instagram: 2200,
  "instagram-standalone": 2200,
  linkedin: 3000,
  "linkedin-page": 3000,
  youtube: 5000,
  reddit: 10000,
  facebook: 63206,
};

/** YouTube's video title: the first line of a YouTube post (youtube.settings.dto.ts 2-100, counted as code points). */
export const YOUTUBE_TITLE_MAX = 100;
export const YOUTUBE_TITLE_MIN = 2;

/** A YouTube post's text as YouTube takes it: the first non-empty line is the video title, the rest the description.
 *  Data API: the title is 1-100 characters (Postiz asks 2), the description at most 5000 bytes (BODY_LIMITS, counted
 *  in bytes by bodyLength), neither may contain < or >. The one rule save (posts.ts), the editor and send (compose.ts) read. */
export function youtubeParts(text: string): { title: string; description: string; problem: string | null } {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => l.trim());
  const title = i >= 0 ? lines[i].trim() : "";
  const description = i >= 0 ? lines.slice(i + 1).join("\n").trim() : "";
  const n = [...title].length;
  const problem = n < YOUTUBE_TITLE_MIN || n > YOUTUBE_TITLE_MAX
    ? `YouTube 的第一行是影片標題，要 ${YOUTUBE_TITLE_MIN}–${YOUTUBE_TITLE_MAX} 個字（現在 ${n} 個）`
    : /[<>]/.test(text) ? "YouTube 的標題和說明不能有 < 或 > 符號" : null;
  return { title, description, problem };
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function bodyLength(platform: string, body: string): number {
  // TextEncoder: the editor counts in the browser too. YouTube's description limit is in bytes (Data API videos.snippet).
  if (platform === "threads" || platform === "youtube") return new TextEncoder().encode(body).length;
  let n = 0;
  for (const _ of segmenter.segment(body)) n++;
  return n;
}

export interface LimitProblem {
  accountId: string;
  platform: string;
  length: number;
  limit: number;
}

/** Each target's text (its own or the post's) against its platform's limit. */
export function overLimit(body: string, targets: Array<{ accountId: string; platform: string; customBody?: string | null }>): LimitProblem[] {
  return targets.flatMap((t) => {
    const limit = BODY_LIMITS[t.platform];
    if (!limit) return [];
    const length = bodyLength(t.platform, t.customBody ?? body);
    return length > limit ? [{ accountId: t.accountId, platform: t.platform, length, limit }] : [];
  });
}

export interface CommentProblem extends LimitProblem {
  /** 1-based, as the editor numbers the comments */
  comment: number;
}

/** Each comment against each target's platform limit: Postiz checks every value of a post -- the post and each comment
 *  -- against the provider's one maxLength (posts.service.ts validation, v2.25.1), so a comment has the post's limit. */
export function commentsOverLimit(comments: string[], targets: Array<{ accountId: string; platform: string }>): CommentProblem[] {
  return comments.flatMap((body, i) => targets.flatMap((t) => {
    const limit = BODY_LIMITS[t.platform];
    if (!limit) return [];
    const length = bodyLength(t.platform, body);
    return length > limit ? [{ accountId: t.accountId, platform: t.platform, length, limit, comment: i + 1 }] : [];
  }));
}
