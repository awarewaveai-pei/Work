/**
 * B26 part 2: the social drafts of a project are built once (brief_json.autoDrafts). When the video is rendered again
 * afterwards (shots swapped, run resumed), the drafts must carry the NEW cut. Per draft post we record which cut it was built
 * with (checksum); a later advance compares that with the project's current cut of the post's ratio (ratio-rows.ts) and
 * swaps the post's media in place (store.savePost with the post's version: same post, same text, no orphan draft).
 *  - only the post's own video media is replaced (the one recorded at creation, `mediaId`); media a person added stays.
 *    A post whose video media is no longer there (a person removed it) is left as it is;
 *  - a post that already went out (published / queued, or a target of it did) is NOT touched (the database refuses a
 *    content change there too); it is remembered as `kept` for that cut and named in the operator notice;
 *  - a post the person deleted is left deleted;
 *  - old records ({at,count} without posts / checksum) are unknown: never refreshed.
 * Re-entrant: a post is done once its checksum (or kept) equals the current cut; the record is saved after every post.
 */
export interface DraftPost { postId: string; ratio: string; /** the post's video media (the library item the draft was built with) */ mediaId?: string; /** the cut the post was built with; absent = unknown */ checksum?: string; /** the cut a sent post was NOT updated to */ kept?: string; /** a swap in progress: the media and cut it puts on the post */ next?: { mediaId: string; checksum: string } }
export interface DraftRecord { at: string; count: number; posts?: DraftPost[] }
export interface CurrentCut { ratio: string; checksum: string }
export interface PostMedia { media_id: string; position: number; alt_text: string | null }
export interface RefreshPost { id: string; version: number; state: string; targetStates: string[]; media: PostMedia[] }
export interface RefreshDeps {
  /** The approved current cut of this ratio, with the url (and chosen cover) the draft needs; null = none now. */
  cut(ratio: string): Promise<{ checksum: string; videoUrl: string; coverUrl: string | null } | null>;
  post(postId: string): Promise<RefreshPost | null>;
  addVideo(videoUrl: string, fileName: string, coverUrl: string | null, deadline: number): Promise<{ id: string }>;
  /** Saves the post with exactly this media set (store.savePost replaces the set) and the new video url as its source. */
  swap(post: RefreshPost, media: PostMedia[], videoUrl: string): Promise<void>;
  /** Persists the record (after every post, so a firing that dies half way is simply run again). */
  save(posts: DraftPost[]): Promise<void>;
}

const SENT = ["published", "queued"];
const sent = (p: RefreshPost) => SENT.includes(p.state) || p.targetStates.some((s) => SENT.includes(s));

/** Posts whose recorded cut differs from the current cut of their ratio (and that were not already settled for it). */
export function postsToRefresh(posts: readonly DraftPost[] | undefined, cuts: readonly CurrentCut[]): DraftPost[] {
  return (posts ?? []).filter((p) => {
    const cur = cuts.find((c) => c.ratio === p.ratio);
    return !!p.checksum && !!cur && p.checksum !== cur.checksum && p.kept !== cur.checksum;
  });
}

export async function refreshDrafts(deps: RefreshDeps, posts: readonly DraftPost[], cuts: readonly CurrentCut[], now: () => number = Date.now): Promise<{ posts: DraftPost[]; swapped: number; kept: number }> {
  const out = posts.map((p) => ({ ...p }));
  const media = new Map<string, string>();   // ratio:checksum -> media id of the new cut, uploaded once per firing
  let swapped = 0, kept = 0;
  for (const p of out) {
    if (!postsToRefresh([p], cuts).length) continue;
    const cut = await deps.cut(p.ratio);
    if (!cut) throw new Error(`社群草稿要換的 ${p.ratio} 比例還沒有核准發布的新影片`);
    const post = await deps.post(p.postId);
    // A swap that went through but whose record was not saved (`next` = the media + cut it was going to): settle it from the post.
    if (p.next && post?.media.some((m) => m.media_id === p.next!.mediaId)) {
      p.mediaId = p.next.mediaId; p.checksum = p.next.checksum; delete p.next;
      await deps.save(out);
      if (p.checksum === cut.checksum) continue;
    }
    if (!post || post.state === "deleted") p.checksum = cut.checksum;   // gone or deleted by a person: nothing to update
    else if (sent(post)) { p.kept = cut.checksum; kept++; }
    else if (!p.mediaId || !post.media.some((m) => m.media_id === p.mediaId)) p.checksum = cut.checksum;   // its video was removed by a person
    else {
      const key = p.ratio + ":" + cut.checksum;
      if (!media.has(key)) media.set(key, p.next?.checksum === cut.checksum ? p.next.mediaId : (await deps.addVideo(cut.videoUrl, `${p.ratio}.mp4`, cut.coverUrl, now() + 240_000)).id);
      const mediaId = media.get(key)!;
      p.next = { mediaId, checksum: cut.checksum };
      await deps.save(out);   // before the swap: a record that fails to save afterwards can be settled from `next`
      await deps.swap(post, post.media.map((m) => (m.media_id === p.mediaId ? { ...m, media_id: mediaId } : m)), cut.videoUrl);
      p.checksum = cut.checksum; p.mediaId = mediaId; delete p.next; delete p.kept; swapped++;
    }
    await deps.save(out);
  }
  return { posts: out, swapped, kept };
}

/** The sent posts the operator must hear about (they still show an older cut): one line for the notice, "" = none. */
export function keptNote(record: unknown): string {
  const n = ((record as DraftRecord | undefined)?.posts ?? []).filter((p) => p.kept).length;
  return n ? `已發布的 ${n} 則貼文用的是舊版影片` : "";
}
