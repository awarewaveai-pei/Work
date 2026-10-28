// POST /api/video/social-drafts { organizationId, candidateAssetId, items: [{ accountId, text }] }
//   One social DRAFT per ticked channel, each with the ratio its platform takes (V5.2). The video product's own shell over the
//   social store (video declares social as optional); the rule is lib/content/video/social-drafts.ts.
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { saveVideoSocialDrafts, type DraftItem } from "@/lib/content/video/social-drafts";
import { draftDeps, loadVideoRows } from "@/lib/content/video/social-drafts-deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const rows = await loadVideoRows(db, org, candidate);
    const primary = rows.find((r) => r.id === candidate);
    if (!primary) throw new BadRequest("video not found");
    const result = await saveVideoSocialDrafts(draftDeps(db, org, rows, actorOf(req)), primary.metadata?.title ?? "video", items);
    if (result.ok === false) throw new BadRequest(result.error);
    return { drafts: result.drafts };
  });
}
