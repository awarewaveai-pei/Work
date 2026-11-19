// N6 risk fix: the privacy each reviewed topic's YouTube draft will really go out with, read on the server from the draft
// (social_post_targets.format) so the content pages ask only the content API (product doors: content never calls
// /api/social). The site's current youtubePrivacy is not it: the format was written when the draft was made (N5a).
import { getPost } from "@/lib/social/store";
import { draftPrivacy, pendingYoutubePostId, type DraftPrivacy } from "./lanes";
import type { Topic } from "./store";

/** topic id -> its YouTube draft's privacy, for reviewed topics with a YouTube draft still to send; a draft that cannot
 *  be read is null (the page then says 無法確認, never guesses). */
export async function youtubeDraftPrivacies(organizationId: string, topics: Topic[]): Promise<Record<string, DraftPrivacy>> {
  const out: Record<string, DraftPrivacy> = {};
  await Promise.all(topics.filter((t) => t.status === "reviewed").map(async (t) => {
    const id = pendingYoutubePostId(t);
    if (!id) return;
    out[t.id] = await getPost(organizationId, id).then((p) => draftPrivacy(p.targets), (e) => {
      console.warn(`[content/topics] ${t.id} YouTube draft ${id} not read: ${e instanceof Error ? e.message : e}`);
      return null;
    });
  }));
  return out;
}
