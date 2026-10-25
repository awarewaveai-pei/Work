import { BrandAccessError, WRITE_ROLES, actorOf, requireBrandRole, requireStaffForNewChannel } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { claimIntegration, listUnclaimedIntegrations } from "@/lib/social/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    requireStaffForNewChannel(req);
    if (req.headers.get("x-ops-user-kind") !== "staff") throw new BrandAccessError("forbidden: staff identity required");
    return { integrations: await listUnclaimedIntegrations() };
  });
}

export async function POST(req: Request): Promise<Response> {
  return handle(async () => {
    requireStaffForNewChannel(req);
    if (req.headers.get("x-ops-user-kind") !== "staff") throw new BrandAccessError("forbidden: staff identity required");
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    if (typeof body.integration_id !== "string" || body.integration_id.length < 1 || body.integration_id.length > 100) {
      throw new BadRequest("integration_id must be a Postiz channel id");
    }
    const integrationId = body.integration_id;
    await requireBrandRole(req, brand, WRITE_ROLES);
    return { accountId: await claimIntegration(brand, integrationId, actorOf(req)) };
  });
}
