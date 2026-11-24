// Auto publish in steps (N5a, NEXT-PHASE-PLAN-20261119 §8): YouTube first; the article only once YouTube gave back its
// public link; the other social posts only once the article is live. A topic sits in 'publishing' between them and
// each firing (tick.ts) moves it as far as it can. Every step is written to artifacts.publish BEFORE its outside write
// and again after it, and every outside write also checks the outside state (a scheduled post is not scheduled again,
// WordPress "publish" on a live post changes nothing), so a restart between the write and its record does not send
// anything twice. YouTube not live YOUTUBE_LIVE_TIMEOUT_MS after it was sent = the topic fails with the article and
// the other posts still drafts. A topic made before the split (one social draft, no youtube_post_id) has no YouTube
// step: article, then its social draft, as before. A step started by another run less than STEP_LEASE_MS ago is left to it.
// K23: Facebook's and Instagram's own drafts (social.link_in_comment) go out after the other channels', each with the
// article's link in its first comment (make.ts sendSocial); a topic made before K23 has none and goes out as before.
import { MakeError } from "./tick";
import type { LinkInCommentChannel } from "@/lib/social/link-in-comment";
import type { Topic } from "./store";

export interface PublishStep {
  post_id?: string;
  /** recorded before the outside write */
  started_at: string;
  /** recorded after it */
  sent_at?: string;
  state?: string;
  /** YouTube's public link (social_post_targets.release_url) / the live article's link */
  url?: string;
  /** YouTube: the wait for its link counts from here (sent_at, or the start of this publish run on a retry) */
  since?: string;
  /** what the step went out without (shown on the topic as a yellow line; not an error, the publish went on) */
  note?: string;
}
/** requestedBy / requestedAt: the person who pressed 發布 (N6) for this run into 'publishing' -- the only way a topic of
 *  a site set to human review goes out (make.ts publishDrafts reads it; tick.ts publishNow clears it on an auto entry). */
/** link_in_comment: one step per Facebook / Instagram draft (K23), by its post id. */
export interface PublishLog { youtube?: PublishStep; article?: PublishStep; social?: PublishStep; link_in_comment?: Record<string, PublishStep>; requestedBy?: string; requestedAt?: string }

export const YOUTUBE_LIVE_TIMEOUT_MS = 60 * 60_000;
/** A step recorded as started (started_at, no sent_at) less than this ago is another run's, still at its outside write:
 *  this run waits instead of doing it too. Older = that run died; this run does it (the outside write checks the state). */
export const STEP_LEASE_MS = 10 * 60_000;
export const YOUTUBE_TIMEOUT_TEXT = "YouTube 一小時沒上線，文章與其他貼文都還是草稿";

/** One look at the topic's YouTube post: every YouTube target has its release_url = live; any target failed = error. */
export type YoutubeLook = { state: "waiting" } | { state: "live"; url: string } | { state: "error"; error: string };

export interface PublishPorts {
  now(): Date;
  /** Schedules (or submits for review) a social draft; a post a person already moved is left as it is. linkInComment
   *  (K23): the link goes in the draft's first comment under this channel's wording, with the article's title. */
  sendPost(postId: string, link: string | undefined, now: Date, linkInComment?: { channel: LinkInCommentChannel; title: string | undefined }): Promise<{ state: string; scheduled_at: string | null; at: string }>;
  lookYoutube(postId: string): Promise<YoutubeLook>;
  /** WordPress draft -> publish; throws when WordPress refused. youtubeUrl = YouTube's link (N5b): the article's
   *  embedded video file becomes that link first, while the article is still a draft. */
  publishArticle(wpPostId: number, youtubeUrl?: string): Promise<{ status: string; link: string; title?: string; note?: string }>;
}

type Sent = { state: string; scheduled_at: string | null; at: string };
/** K23: a Facebook or Instagram draft of its own (make.ts makeSocial); media_id = the video attached to it (attachTopicVideo). */
export interface LinkInCommentPost { post_id: string; channel: LinkInCommentChannel; media_id?: string; sent?: Sent }

/** The artifacts publish-steps reads and writes (make.ts TopicArtifacts holds the same fields). */
interface Arts {
  article?: { wp_post_id: number | null; published?: { status: string; link: string; at: string; title?: string } } & Record<string, unknown>;
  social?: { post_id: string | null; youtube_post_id?: string | null; sent?: Sent; link_in_comment?: LinkInCommentPost[] } & Record<string, unknown>;
  publish?: PublishLog;
  [k: string]: unknown;
}

/**
 * Moves one 'publishing' topic as far as it can. done=false: waiting for YouTube's link (the next firing looks again).
 * `save(artifacts)` claims the row with what was recorded (false = another firing took it). `fresh` = this run moved
 * the topic into 'publishing' just now (from reviewed / scheduled, or a retry): a YouTube post sent by an earlier run
 * and still without its link gets a new hour from now instead of failing at once.
 * Throws a MakeError carrying what was recorded.
 */
export async function publishSteps(t: Pick<Topic, "formats" | "artifacts">, ports: PublishPorts,
  save: (artifacts: Record<string, unknown>) => Promise<boolean>, fresh: boolean): Promise<{ artifacts: Record<string, unknown>; done: boolean }> {
  const a: Arts = { ...(t.artifacts as Arts) };
  const log: PublishLog = { ...(a.publish ?? {}) };
  a.publish = log;
  const step = async () => { if (!(await save(a))) throw new Error("另一次排程接手了這個題目"); };
  const now = ports.now();
  const at = now.toISOString();
  const held = (s: PublishStep | undefined) => !!s && !s.sent_at && now.getTime() - Date.parse(s.started_at) < STEP_LEASE_MS;
  const wait = { artifacts: a as Record<string, unknown>, done: false };
  try {
    const ytId = a.social?.youtube_post_id;
    if (ytId) {
      if (!log.youtube?.sent_at) {
        if (held(log.youtube)) return wait;
        log.youtube = { post_id: ytId, started_at: at };
        await step();
        const sent = await ports.sendPost(ytId, undefined, now);
        log.youtube = { ...log.youtube, sent_at: sent.at, state: sent.state, since: sent.at };
        await step();
      } else if (fresh && !log.youtube.url) {
        log.youtube = { ...log.youtube, since: at };
        await step();
      }
      if (!log.youtube.url) {
        const look = await ports.lookYoutube(ytId);
        if (look.state === "error") throw new Error(`YouTube 發布失敗（${look.error}），文章與其他貼文都還是草稿`);
        if (look.state === "waiting") {
          const since = Date.parse(log.youtube.since ?? log.youtube.sent_at!);
          if (now.getTime() - since >= YOUTUBE_LIVE_TIMEOUT_MS) {
            throw new Error(log.youtube.state === "review" ? `${YOUTUBE_TIMEOUT_TEXT}（YouTube 貼文在等社群審核）` : YOUTUBE_TIMEOUT_TEXT);
          }
          return { artifacts: a, done: false };
        }
        log.youtube = { ...log.youtube, url: look.url };
        await step();
      }
    }

    const article = a.article;
    if (t.formats.includes("article") && !article?.published) {
      if (!article?.wp_post_id) throw new Error("沒有 WordPress 草稿編號，無法發布");
      if (held(log.article)) return wait;
      log.article = { started_at: at };
      await step();
      const r = await ports.publishArticle(article.wp_post_id, log.youtube?.url);
      a.article = { ...article, published: { status: r.status, link: r.link, at, ...(r.title ? { title: r.title } : {}) } };
      log.article = { ...log.article, sent_at: at, state: r.status, url: r.link, ...(r.note ? { note: r.note } : {}) };
      await step();
    }

    const s = a.social;
    if (s?.post_id && !s.sent) {
      if (held(log.social)) return wait;
      log.social = { post_id: s.post_id, started_at: at };
      await step();
      const sent = await ports.sendPost(s.post_id, a.article?.published?.link, now);
      a.social = { ...s, sent };
      log.social = { ...log.social, sent_at: sent.at, state: sent.state };
      await step();
    }

    for (const [i, p] of (a.social?.link_in_comment ?? []).entries()) {
      if (p.sent) continue;
      const steps = { ...(log.link_in_comment ?? {}) };
      if (held(steps[p.post_id])) return wait;
      log.link_in_comment = steps;
      steps[p.post_id] = { post_id: p.post_id, started_at: at };
      await step();
      const sent = await ports.sendPost(p.post_id, a.article?.published?.link, now, { channel: p.channel, title: a.article?.published?.title });
      const posts = [...a.social!.link_in_comment!];
      posts[i] = { ...p, sent };
      a.social = { ...a.social!, link_in_comment: posts };
      steps[p.post_id] = { ...steps[p.post_id], sent_at: sent.at, state: sent.state };
      await step();
    }
  } catch (e) {
    throw new MakeError(e instanceof Error ? e.message : String(e), a as Record<string, unknown>);
  }
  return { artifacts: a as Record<string, unknown>, done: true };
}
