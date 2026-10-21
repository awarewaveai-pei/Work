// C28: Meta ad-account, campaign and insight reads; campaign status writes are owner/editor only.
import { ANY_ROLE, WRITE_ROLES, actorOf, requireBrandRole } from "@/lib/social/authz";
import { withFeature } from "@/lib/entitlements/grant";
import { BadRequest, handle, jsonBody, uuid } from "@/lib/social/http";
import { recordMetaAdsStatusChange } from "@/lib/social/store";
import { assertMetaAdsBrand, getMetaInsights, listMetaAdAccounts, listMetaCampaigns, MetaAdsError, setMetaCampaignStatus } from "@/lib/social/meta-ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function get(req: Request): Promise<Response> {
  return handle(async () => {
    const q = new URL(req.url).searchParams;
    const brand = uuid(q.get("brand"), "brand");
    await requireBrandRole(req, brand, ANY_ROLE);
    const view = q.get("view") ?? "accounts";
    if (view === "accounts") return { accounts: await listMetaAdAccounts(brand) };
    const account = q.get("account");
    if (!account) throw new BadRequest("尚未指定 Meta 廣告帳戶");
    await assertMetaAdsBrand(brand, account);
    if (view === "campaigns") return { account, campaigns: await listMetaCampaigns(account) };
    if (view === "insights") return { account, insights: await getMetaInsights(account, q.get("datePreset") ?? "last_30d") };
    throw new BadRequest("view must be accounts, campaigns or insights");
  });
}

async function patch(req: Request): Promise<Response> {
  return handle(async () => {
    if (process.env.META_ADS_WRITE_ENABLED?.trim().toLowerCase() !== "true") throw new MetaAdsError(403, "Meta 廣告寫入功能目前關閉", "meta_ads_write_disabled");
    const body = await jsonBody(req);
    const brand = uuid(body.brand, "brand");
    await requireBrandRole(req, brand, WRITE_ROLES);
    if (typeof body.account !== "string" || !body.account.trim()) throw new BadRequest("account is required");
    await assertMetaAdsBrand(brand, body.account);
    if (typeof body.campaignId !== "string" || !/^\d+$/.test(body.campaignId)) throw new BadRequest("campaignId must be numeric");
    if (body.status !== "ACTIVE" && body.status !== "PAUSED") throw new BadRequest("status must be ACTIVE or PAUSED");
    await setMetaCampaignStatus(body.account, body.campaignId, body.status);
    await recordMetaAdsStatusChange(brand, actorOf(req), { account: body.account, campaign_id: body.campaignId, status: body.status });
    return { campaignId: body.campaignId, status: body.status };
  });
}

export const GET = withFeature("social.ads", get);
export const PATCH = withFeature("social.ads", patch);
