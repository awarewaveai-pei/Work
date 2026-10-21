// C28: Meta ad-account, campaign and insight reads; campaign status writes are owner/editor only.
import { ANY_ROLE, WRITE_ROLES, requireBrandRole } from "@/lib/social/authz";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { assertMetaAdsBrand, configuredMetaAdAccount, getMetaInsights, listMetaAdAccounts, listMetaCampaigns, setMetaCampaignStatus } from "@/lib/social/meta-ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    assertMetaAdsBrand(brand);
    const view = q.get("view") ?? "accounts";
    if (view === "accounts") return { accounts: await listMetaAdAccounts() };
    const account = q.get("account") || configuredMetaAdAccount();
    if (!account) throw new BadRequest("尚未指定 Meta 廣告帳戶");
    if (view === "campaigns") return { account, campaigns: await listMetaCampaigns(account) };
    if (view === "insights") return { account, insights: await getMetaInsights(account, q.get("datePreset") ?? "last_30d") };
    throw new BadRequest("view must be accounts, campaigns or insights");
  });
}

export async function PATCH(req: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    assertMetaAdsBrand(brand);
    if (typeof body.campaignId !== "string" || !/^\d+$/.test(body.campaignId)) throw new BadRequest("campaignId must be numeric");
    if (body.status !== "ACTIVE" && body.status !== "PAUSED") throw new BadRequest("status must be ACTIVE or PAUSED");
    await setMetaCampaignStatus(body.campaignId, body.status);
    return { campaignId: body.campaignId, status: body.status };
  });
}
