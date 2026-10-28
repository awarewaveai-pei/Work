// POST /api/video/social-drafts { organizationId, candidateAssetId, items: [{ accountId, text }] }
//   One social DRAFT per ticked channel, each with the ratio its platform takes (V5.2). The video product's own shell over the
//   social store (video declares social as optional); the rule is lib/content/video/social-drafts.ts.
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { assertWithinLimits } from "@/lib/social/posts";
import { addVideo, listAccounts, savePost } from "@/lib/social/store";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ratioOfUrl } from "@/lib/content/video/platform-ratio";
import { saveVideoSocialDrafts, type DraftItem } from "@/lib/content/video/social-drafts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetRow = { id: string; object_url: string | null; checksum_sha256: string | null; metadata: { title?: string } | null };

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    if (!canCreateAiImageJob(resolveOpsRole(req).role)) throw new BadRequest("forbidden");
    const body = await jsonBody(req);
    const org = uuid(body.organizationId, "organizationId");
    const candidate = uuid(body.candidateAssetId, "candidateAssetId");
    await requireBrandRole(req, org, WRITE_ROLES);
    const items: DraftItem[] = (Array.isArray(body.items) ? body.items : []).map((i: Record<string, unknown>) => ({ accountId: uuid(i?.accountId, "accountId"), text: typeof i?.text === "string" ? i.text : "" }));
    const db = getSupabaseWriteClient();
    if (!db) throw new Error("db unavailable");

    // this video's ratio rows: the primary row plus the rows that point back at it
    const { data } = await db.from("media_assets").select("id, object_url, checksum_sha256, metadata")
      .eq("organization_id", org).eq("mime_type", "video/mp4").or(`id.eq.${candidate},metadata->>variantOf.eq.${candidate}`);
    const rows = (data ?? []) as AssetRow[];
    if (!rows.some((r) => r.id === candidate)) throw new BadRequest("video not found");
    const title = rows.find((r) => r.id === candidate)?.metadata?.title ?? "video";
    const actor = actorOf(req);

    const result = await saveVideoSocialDrafts({
      accounts: async () => (await listAccounts(org)).map((a) => ({ id: a.id, platform: a.platform, status: a.status, label: a.label })),
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
    }, title, items);
    if (result.ok === false) throw new BadRequest(result.error);
    return { drafts: result.drafts };
  });
}
