// C28: the small server-side adapter for Meta Marketing API.
// Access tokens never cross the browser boundary; the route reads META_MARKETING_ACCESS_TOKEN from the
// deployment secret environment. Postiz owns publishing OAuth, but it does not expose ad-account tokens.
import { getMetaGraphApiVersion } from "./meta-webhook";
import { findEnabledMetaAssetForBrand, listMetaAssets } from "./store";

export type MetaAdAccount = {
  id: string;
  name: string;
  account_status: number | null;
  currency: string | null;
  timezone_name: string | null;
};

export type MetaCampaign = {
  id: string;
  name: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
  start_time: string | null;
  stop_time: string | null;
};

export type MetaAdsInsight = {
  spend: string | null;
  impressions: string | null;
  clicks: string | null;
  reach: string | null;
  actions: Array<{ action_type: string; value: string }>;
};

export class MetaAdsError extends Error {
  constructor(readonly status: number, message: string, readonly code = "meta_ads_error") {
    super(message);
    this.name = "MetaAdsError";
  }
}

export class MetaAdsConfigError extends MetaAdsError {
  constructor(message = "Meta 廣告 API 尚未設定") {
    super(503, message, "meta_ads_not_configured");
    this.name = "MetaAdsConfigError";
  }
}

export type MetaAdsEnv = Record<string, string | undefined>;
type MetaAdsConfig = { baseUrl: string; accessToken: string };

function accountPath(accountId: string): string {
  const value = accountId.trim().replace(/^act_/, "");
  if (!/^\d+$/.test(value)) throw new MetaAdsError(400, "廣告帳戶 ID 格式不正確", "invalid_ad_account");
  return `act_${value}`;
}

export function getMetaAdsConfig(env: MetaAdsEnv = process.env): MetaAdsConfig {
  const accessToken = env.META_MARKETING_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new MetaAdsConfigError("Meta 廣告 API 未設定 META_MARKETING_ACCESS_TOKEN");
  let version: string;
  try { version = getMetaGraphApiVersion(env); } catch { throw new MetaAdsConfigError("META_GRAPH_API_VERSION 格式不正確"); }
  return {
    baseUrl: `${env.META_GRAPH_API_BASE_URL?.trim() || "https://graph.facebook.com"}/${version}`,
    accessToken,
  };
}

async function request<T>(method: "GET" | "POST", path: string, params: Record<string, string> = {}, env?: MetaAdsEnv): Promise<T> {
  const cfg = getMetaAdsConfig(env);
  const url = new URL(`${cfg.baseUrl}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${cfg.accessToken}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? new URLSearchParams(params) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({})) as { data?: unknown; error?: { message?: string; code?: number } };
  if (!res.ok || body.error) {
    const message = body.error?.message || `Meta API returned ${res.status}`;
    throw new MetaAdsError(res.status >= 400 && res.status < 500 ? 502 : res.status, `Meta 廣告 API：${message}`, "meta_api_error");
  }
  return body as T;
}

export async function listMetaAdAccounts(brandId: string, env?: MetaAdsEnv): Promise<MetaAdAccount[]> {
  const mapped = await listMetaAssets(brandId, "ad_account");
  const allowed = new Set(mapped.filter((asset) => asset.enabled).map((asset) => accountPath(asset.externalId)));
  const result = await request<{ data?: MetaAdAccount[] }>("GET", "me/adaccounts", {
    fields: "id,name,account_status,currency,timezone_name",
    limit: "100",
  }, env);
  return (result.data ?? []).filter((account) => allowed.has(accountPath(account.id)));
}

export async function listMetaCampaigns(accountId: string, env?: MetaAdsEnv): Promise<MetaCampaign[]> {
  const result = await request<{ data?: MetaCampaign[] }>("GET", `${accountPath(accountId)}/campaigns`, {
    fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time",
    limit: "100",
  }, env);
  return result.data ?? [];
}

export async function getMetaInsights(accountId: string, datePreset: string, env?: MetaAdsEnv): Promise<MetaAdsInsight[]> {
  if (!/^[a-z0-9_]+$/.test(datePreset)) throw new MetaAdsError(400, "date_preset 格式不正確", "invalid_date_preset");
  const result = await request<{ data?: MetaAdsInsight[] }>("GET", `${accountPath(accountId)}/insights`, {
    fields: "spend,impressions,clicks,reach,actions",
    date_preset: datePreset,
    level: "account",
  }, env);
  return result.data ?? [];
}

export async function setMetaCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED", env?: MetaAdsEnv): Promise<void> {
  if (!/^\d+$/.test(campaignId.trim())) throw new MetaAdsError(400, "活動 ID 格式不正確", "invalid_campaign");
  await request("POST", campaignId.trim(), { status }, env);
}

/** The requested account must be an enabled asset owned by this brand before any Meta call. */
export async function assertMetaAdsBrand(brandId: string, accountId: string): Promise<void> {
  const asset = await findEnabledMetaAssetForBrand(brandId, "ad_account", accountId.trim().replace(/^act_/, ""));
  if (!asset) throw new MetaAdsError(403, "此品牌未綁定 Meta 廣告帳戶", "meta_ads_brand_mismatch");
}
