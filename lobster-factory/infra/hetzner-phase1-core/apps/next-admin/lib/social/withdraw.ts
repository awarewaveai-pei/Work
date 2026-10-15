// A person changes a post that is already in Postiz (state queued; SOCIAL_MANAGER_PLAN.md C5 "改時間：queued 的先
// deletePost 再重建"). Postiz has no "move" (ADR 016 §2), so: look whether a channel already went out, delete the
// channel posts still waiting in Postiz, then release the post in one transaction (migration 0100
// social_release_post); the sender recreates it at the new time. Deleting in Postiz also stops its publish workflow.
// Delete first, release second: the other order would leave a Postiz post that goes out at the old time.
import { deletePost, listPosts } from "@/lib/content/postiz";
import { releasePost, SocialStoreError, type PostRow } from "./store";
import type { Transition } from "./state";

/** Around its send time Postiz may be publishing it right now; a delete could race the publish and send it twice.
 *  Only a post with a channel waiting in Postiz is held; one the sender never reached (a blocking system mode) or
 *  long past its time is not (review 2026-10-15: a past-due queued post could otherwise never be withdrawn). */
export const WITHDRAW_LEAD_MS = 2 * 60_000;
export const WITHDRAW_SETTLE_MS = 10 * 60_000;

export async function withdrawQueued(brandId: string, post: PostRow, next: Transition, actor: string, action: string,
  detail: Record<string, unknown>, now: Date = new Date()): Promise<{ id: string; version: number }> {
  const inPostiz = post.targets.filter((t) => (t.state === "queued" || t.state === "error") && t.postiz_post_id);
  const at = post.scheduled_at ? Date.parse(post.scheduled_at) : NaN;
  if (inPostiz.some((t) => t.state === "queued") && at - WITHDRAW_LEAD_MS <= now.getTime() && now.getTime() <= at + WITHDRAW_SETTLE_MS) {
    throw new SocialStoreError(409, "this post is going out right now; wait a few minutes for its result, then change it");
  }
  if (inPostiz.some((t) => t.state === "queued")) {
    const from = new Date(Date.parse(post.scheduled_at ?? now.toISOString()) - 24 * 3600_000);
    const seen = new Map((await listPosts({ start: from, end: new Date(now.getTime() + 24 * 3600_000) })).map((p) => [p.id, p]));
    if (inPostiz.some((t) => t.state === "queued" && seen.get(t.postiz_post_id as string)?.state === "PUBLISHED")) {
      throw new SocialStoreError(409, "a channel of this post already published; it shows within 5 minutes, then reload");
    }
  }
  const deleted: string[] = [];
  for (const t of inPostiz) {
    await deletePost(t.postiz_post_id as string);
    deleted.push(t.postiz_post_id as string);
  }
  return releasePost(brandId, post.id, post.version, deleted, next, actor, action, detail);
}
