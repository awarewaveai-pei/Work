// GET /api/video/social-channels?organizationId= -- the brand's connected social channels for the release panel's checkboxes (V5.2).
//   The video door serves /api/video only, so the panel asks here instead of /api/social (video declares social as optional).
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { WRITE_ROLES, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, uuid } from "@/lib/social/http";
import { listAccounts } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    if (!canCreateAiImageJob(resolveOpsRole(req).role)) throw new BadRequest("forbidden");
    const org = uuid(new URL(req.url).searchParams.get("organizationId"), "organizationId");
    await requireBrandRole(req, org, WRITE_ROLES);
    return { accounts: (await listAccounts(org)).filter((a) => a.status === "connected").map((a) => ({ id: a.id, platform: a.platform, label: a.label, status: a.status })) };
  });
}
