// The human gate's send-back. Separate from make.ts on purpose: it removes drafts and makes nothing, so the topic route
// that calls it reaches no paid feature (lib/portal/__tests__/registry-code.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { orgIdentity } from "@/lib/tenant-guard";
import { readWpPost, trashWpPost } from "@/lib/content/publish/wp-post-core";
import { getPost, SocialStoreError } from "@/lib/social/store";
import { applyAction } from "@/lib/social/actions";
import { claimTopic, move, TopicMoveRefused, type Topic } from "./store";
import type { TopicArtifacts } from "./make";

/** The human gate sends a reviewed topic back: its WordPress draft and social draft go to their trash (both restorable),
 *  and the topic returns to approved with nothing made, so the next run makes it again. Claimed first, so a concurrent
 *  publish cannot use drafts that are being removed. Only drafts are removed: an article a person published or scheduled
 *  in WordPress refuses the send-back; a social post a person moved on is left. Anything unreadable stops it (the drafts
 *  must not lose their topic). null = changed elsewhere. */
export async function redoTopic(sb: SupabaseClient, t: Topic, actor: string): Promise<Topic | null> {
  if (t.status !== "reviewed") throw new TopicMoveRefused(`only a reviewed topic is sent back (it is ${t.status})`);
  const claimed = await claimTopic(sb, t);
  if (!claimed) return null;
  const a = t.artifacts as TopicArtifacts;
  if (a.article?.wp_post_id && t.site_id) {
    const who = orgIdentity(t.organization_id);
    const now = await readWpPost(who, t.site_id, a.article.wp_post_id);
    const missing = !now.ok && (now as Extract<typeof now, { ok: false }>).code === "rest_post_invalid_id";   // strict:false
    if (!now.ok && !missing) throw new Error(`讀不到 WordPress 文章：${(now as Extract<typeof now, { ok: false }>).error}`);
    const status = now.ok ? now.post.status : "gone";
    if (status === "draft" || status === "pending") {
      const r = await trashWpPost(who, t.site_id, a.article.wp_post_id);
      if (!r.ok) throw new Error(`WordPress 草稿無法移到垃圾桶：${(r as Extract<typeof r, { ok: false }>).error}`);
    } else if (status !== "trash" && status !== "gone") {
      throw new TopicMoveRefused(`WordPress 文章已經是 ${status}（有人處理過），不能退回重做`);
    }
  }
  if (a.social?.post_id) {
    const post = await getPost(t.organization_id, a.social.post_id)
      .catch((e) => { if (e instanceof SocialStoreError && e.status === 404) return null; throw e; });
    // a person already scheduled or sent it: theirs, left as it is
    if (post?.state === "draft") await applyAction(t.organization_id, post, "delete", "editor", {}, actor, { source: "content_pipeline", topic_id: t.id });
  }
  return move(sb, claimed, "approved", { artifacts: {}, review: null, last_error: null });
}
