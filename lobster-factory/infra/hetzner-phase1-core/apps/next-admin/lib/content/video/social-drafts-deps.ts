/** The real dependencies of saveVideoSocialDrafts (social-drafts.ts): the social store plus this video's ratio rows and Releases.
 *  Shared by POST /api/video/social-drafts and the project auto-advance job. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertWithinLimits } from "@/lib/social/posts";
import { addVideo, listAccounts, savePost } from "@/lib/social/store";
import { ratioOfUrl } from "./platform-ratio";
import type { DraftDeps } from "./social-drafts";

export type VideoRow = { id: string; object_url: string | null; checksum_sha256: string | null; metadata: { title?: string; script?: string } | null };

/** This video's ratio rows: the primary row plus the rows that point back at it. */
export async function loadVideoRows(db: SupabaseClient, org: string, candidate: string): Promise<VideoRow[]> {
  const { data } = await db.from("media_assets").select("id, object_url, checksum_sha256, metadata")
    .eq("organization_id", org).eq("mime_type", "video/mp4").or(`id.eq.${candidate},metadata->>variantOf.eq.${candidate}`);
  return (data ?? []) as VideoRow[];
}

export function draftDeps(db: SupabaseClient, org: string, rows: VideoRow[], actor: string): DraftDeps {
  return {
    accounts: async () => (await listAccounts(org, { hydrateProfile: false })).map((a) => ({ id: a.id, platform: a.platform, status: a.status, label: a.label })),
    releases: async () => {
      const { data: rel } = await db.from("media_releases").select("id, candidate_asset_id, candidate_checksum")
        .eq("organization_id", org).eq("status", "release_approved").in("candidate_asset_id", rows.map((r) => r.id)).order("created_at", { ascending: false });
      const out: Array<{ releaseId: string; ratio: string; videoUrl: string }> = [];
      for (const r of (rel ?? []) as Array<{ id: string; candidate_asset_id: string; candidate_checksum: string }>) {
        const row = rows.find((x) => x.id === r.candidate_asset_id);
        const ratio = ratioOfUrl(row?.object_url);
        // a Release pins its bytes: one for an older file (after a caption reburn) is not this video any more
        if (row?.object_url && ratio && row.checksum_sha256 === r.candidate_checksum && !out.some((o) => o.ratio === ratio)) out.push({ releaseId: r.id, ratio, videoUrl: row.object_url });
      }
      return out;
    },
    assertWithinLimits: (text, accountId) => assertWithinLimits(org, text, [{ account_id: accountId }]),
    addVideo: (url, fileName) => addVideo(org, url, fileName, actor),
    savePost: async (fields, accountId, mediaId) => {
      const saved = await savePost(org, null, null, fields, [{ account_id: accountId }], [{ media_id: mediaId }], actor);
      return { id: saved.id };
    },
  };
}
