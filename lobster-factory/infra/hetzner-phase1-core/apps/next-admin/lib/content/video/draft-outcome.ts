import type { SupabaseClient } from "@supabase/supabase-js";
import { loadVideoRows } from "./ratio-rows";

export type ArticleState = "draft" | "published" | "scheduled";
/** WordPress status -> what a person is told: only publish is live, future is scheduled, everything else is a draft. */
export const articleState = (wpStatus: string): ArticleState => (wpStatus === "publish" ? "published" : wpStatus === "future" ? "scheduled" : "draft");

/** U6.4: read actual drafts, never infer completion from an approved Release alone.
 *  N14: each article carries `state`, the article as it is now. Order: `readStatus` (the live WordPress status of the
 *  post, null = unreadable), then the status the receipt recorded when it embedded (response_json.postStatus), then the
 *  receipt: a "drafted" receipt is a draft; a "published" receipt older than postStatus was written for drafts too, so
 *  an unreadable one is said as a draft rather than as live. */
export async function readDraftOutcome(db: SupabaseClient, org: string, candidate: string, readStatus?: (editUrl: string, postId: number) => Promise<string | null>) {
  const primary = await db.from("media_assets").select("id, object_url, checksum_sha256").eq("organization_id", org).eq("id", candidate).maybeSingle();
  if (primary.error) throw Error(primary.error.message);
  if (!primary.data) return null;
  // the video's ratio rows (the same rule as the release page: lib/content/video/ratio-rows.ts); a cut that was replaced by a newer one of its ratio is no longer this video's
  const ratioRows = await loadVideoRows(db, org, candidate);
  const rows = ratioRows.length ? ratioRows : [primary.data], urls = rows.map((r) => r.object_url).filter(Boolean);
  const posts = urls.length ? await db.from("social_posts").select("id, state").eq("organization_id", org).in("source_url", urls) : { data: [], error: null };
  if (posts.error) throw Error(posts.error.message);
  const releases = await db.from("media_releases").select("id, candidate_asset_id, candidate_checksum").eq("organization_id", org).eq("status", "release_approved").in("candidate_asset_id", rows.map((r) => r.id));
  if (releases.error) throw Error(releases.error.message);
  const ids = (releases.data || []).filter((r) => rows.some((a) => a.id === r.candidate_asset_id && a.checksum_sha256 === r.candidate_checksum)).map((r) => r.id);
  const receipts = ids.length ? await db.from("media_delivery_attempts").select("id, external_id, status, response_json").eq("organization_id", org).eq("destination", "wordpress").in("release_id", ids) : { data: [], error: null };
  if (receipts.error) throw Error(receipts.error.message);
  const articles = await Promise.all((receipts.data || []).filter((r) => ["drafted", "scheduled", "published"].includes(r.status)).map(async (r, n) => {
    const editUrl = typeof r.response_json?.editUrl === "string" && /^https:\/\//.test(r.response_json.editUrl) ? r.response_json.editUrl : null,
      postId = Number(r.external_id),
      // WordPress is asked for the first 10 only; the rest are told from the receipt
      live = readStatus && editUrl && n < 10 ? await readStatus(editUrl, postId).catch(() => null) : null,
      recorded = typeof r.response_json?.postStatus === "string" ? r.response_json.postStatus : null,
      state: ArticleState = live ? articleState(live) : recorded ? articleState(recorded) : "draft";
    return { title: String(r.response_json?.postTitle || "文章 #" + r.external_id), ...(r.response_json?.postTitle ? {} : { untitled: true as const }), editUrl, state };
  }));
  return { drafts: (posts.data || []).filter((p) => p.state !== "deleted").map((p) => ({ id: String(p.id) })), articles };
}
