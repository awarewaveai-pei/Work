// MainWP Dashboard REST v2 client for the site-flow mainwp step (SITE-FLOW-COMPLETION-PLAN.md §1-3 "MainWP", card SF-I).
//
// Same contract as lobster-factory/packages/workflows/src/integrations/integration-steps.ts addSiteToMainWp (verified
// 2026-09-21 against the installed MainWP 6.0.12 source, WORKLOG 續99/續100): route `sites/add`, body
// {url, name, admin, uniqueid}, Basic auth, a refusal is HTTP 200 {success: 0, error}. next-admin cannot import
// packages/workflows in production (sg-deploy builds apps/next-admin alone), so the two are held together by
// __tests__/integration-steps.test.ts "same contract as the workflows copy".
//
// Traps:
// - Connected = the site row has no sync_errors and is not suspended (MainWP prepare_item_for_response: status is
//   'disconnected' when sync_errors is non-empty, 'suspended' overrides). It is MainWP's last sync, not a live ping.
//   A row that carries neither `status` nor `sync_errors` is "cannot tell", never connected.
// - The list may be cut at one page: a site not in a cut list is "cannot tell", never absent (absent => add => a second
//   copy of the site in MainWP).
// - The consumer secret is in the Authorization header only; no error text here repeats a header or the body.

import { wpSiteKey } from "@/lib/payments/woo";

export interface MainWpConfig {
  dashboardUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

/** MAINWP_* in the next-admin container (SF-I0). Null = not configured. */
export function mainWpConfigFromEnv(env: Record<string, string | undefined> = process.env): MainWpConfig | null {
  const dashboardUrl = env.MAINWP_DASHBOARD_URL?.trim();
  const consumerKey = env.MAINWP_CONSUMER_KEY?.trim();
  const consumerSecret = env.MAINWP_CONSUMER_SECRET?.trim();
  return dashboardUrl && consumerKey && consumerSecret ? { dashboardUrl: dashboardUrl.replace(/\/+$/, ""), consumerKey, consumerSecret } : null;
}

export type MainWpSite = { id: string; url: string; connected: boolean | null; detail: string };
export type MainWpFind = { ok: true; site: MainWpSite | null } | { ok: false; detail: string };
export type MainWpAdd = { ok: true; id: string } | { ok: false; detail: string; foundId?: string };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const PAGE = 100;
const TIMEOUT_MS = 30_000;

const auth = (c: MainWpConfig) => `Basic ${Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64")}`;

async function call(c: MainWpConfig, path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<{ ok: true; status: number; body: unknown } | { ok: false; detail: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${c.dashboardUrl}/wp-json/mainwp/v2/${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: auth(c) },
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => null);
    return { ok: true, status: res.status, body };
  } catch {
    return { ok: false, detail: ctrl.signal.aborted ? "MainWP 沒有在時間內回應" : "連不上 MainWP" };
  } finally {
    clearTimeout(timer);
  }
}

/** One MainWP site row -> connected or not, or null when the row says neither. */
export function connectionOf(row: Json): { connected: boolean | null; detail: string } {
  if (row.suspended === true || row.suspended === 1 || row.suspended === "1" || row.status === "suspended") return { connected: false, detail: "MainWP 已暫停這個站" };
  if (row.status === "connected") return { connected: true, detail: "MainWP 回報連線正常" };
  if (row.status === "disconnected") return { connected: false, detail: "MainWP 回報連線中斷" };
  if (typeof row.sync_errors === "string") {
    return row.sync_errors.trim() ? { connected: false, detail: `MainWP 同步錯誤：${row.sync_errors.trim().slice(0, 200)}` } : { connected: true, detail: "MainWP 沒有同步錯誤" };
  }
  return { connected: null, detail: "MainWP 的回應沒有連線狀態欄位" };
}

/** The MainWP site whose URL is the same install as `siteUrl` (woo.ts wpSiteKey: origin + path). */
export async function findMainWpSite(c: MainWpConfig, siteUrl: string, fetchImpl: typeof fetch = fetch): Promise<MainWpFind> {
  const want = wpSiteKey(siteUrl);
  if (!want) return { ok: false, detail: "網址無法解析" };
  const host = new URL(want).hostname;
  const r = await call(c, `sites?s=${encodeURIComponent(host)}&items_per_page=${PAGE}&per_page=${PAGE}`, { method: "GET" }, fetchImpl);
  if ("detail" in r) return { ok: false, detail: r.detail };
  if (r.status !== 200) return { ok: false, detail: `MainWP 回 HTTP ${r.status}` };
  const body = r.body;
  const rows = Array.isArray(body) ? body : isObj(body) && Array.isArray(body.data) ? body.data : null;
  if (!rows) return { ok: false, detail: "MainWP 的站清單格式不認得" };
  for (const row of rows) {
    if (!isObj(row) || typeof row.url !== "string" || wpSiteKey(row.url) !== want) continue;
    if (row.id === undefined || row.id === null || String(row.id) === "") return { ok: false, detail: "MainWP 有這個站但沒有回站 id" };
    const conn = connectionOf(row);
    return { ok: true, site: { id: String(row.id), url: row.url, ...conn } };
  }
  const total = isObj(body) && typeof body.total === "number" ? body.total : null;
  if (total === null || total > rows.length) return { ok: false, detail: `MainWP 只回了 ${rows.length} 個站（共 ${total ?? "不明"}），無法確定這個站不在` };
  return { ok: true, site: null };
}

/** POST sites/add. A refusal (HTTP 200 success:0) is a failure; found_id is passed back when MainWP names one. */
export async function addMainWpSite(
  c: MainWpConfig,
  site: { url: string; name: string; admin: string; uniqueId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<MainWpAdd> {
  const r = await call(c, "sites/add", { method: "POST", body: JSON.stringify({ url: site.url, name: site.name, admin: site.admin, uniqueid: site.uniqueId }) }, fetchImpl);
  if ("detail" in r) return { ok: false, detail: r.detail };
  if (r.status !== 200) return { ok: false, detail: `MainWP 回 HTTP ${r.status}` };
  const b = isObj(r.body) ? r.body : {};
  const data = isObj(b.data) ? b.data : {};
  if (b.success === 1 && data.id !== undefined && data.id !== null && String(data.id) !== "") return { ok: true, id: String(data.id) };
  const foundId = b.found_id !== undefined && b.found_id !== null && String(b.found_id) !== "" ? String(b.found_id) : undefined;
  return { ok: false, detail: `MainWP 拒絕加站：${String(b.error ?? "沒有說明").slice(0, 300)}`, ...(foundId ? { foundId } : {}) };
}
