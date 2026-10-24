import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { assertOrgAccess, canAccessOrg, staffOnly } from "@/lib/tenant-guard";

export interface WpSite {
  id: string;
  name: string;
  url: string;
  color: string;
  username: string;
  /**
   * 擁有此站的租戶（migration 0061）。env fallback 的站沒有 DB 列 → null，
   * 對 client 一律 fail-closed（canAccessOrg(null) = false），對 staff 透明。
   */
  organizationId: string | null;
}

// Returns the correct Authorization header value for WP REST API calls.
// DB sites (username set): Application Password → Basic base64(username:password).
// Env/legacy sites (no username): JWT → Bearer token.
export function wpAuthHeader(username: string, token: string): string {
  if (username) {
    return `Basic ${Buffer.from(`${username}:${token.replace(/\s+/g, "")}`).toString("base64")}`;
  }
  return `Bearer ${token}`;
}

const COLORS = ["#5855d0", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

function getWpSitesFromEnv(): { sites: WpSite[]; tokens: Record<string, string>; usernames: Record<string, string> } {
  const sites: WpSite[] = [];
  const tokens: Record<string, string> = {};
  const usernames: Record<string, string> = {};

  for (let i = 1; i <= 10; i++) {
    const url   = process.env[`WP_SITE_${i}_URL`]?.trim();
    const token = process.env[`WP_SITE_${i}_TOKEN`]?.trim();
    if (!url || !token) continue;
    const id       = String(i);
    const name     = process.env[`WP_SITE_${i}_NAME`]?.trim() ?? `網站 ${i}`;
    const color    = process.env[`WP_SITE_${i}_COLOR`]?.trim() ?? COLORS[(i - 1) % COLORS.length];
    const username = process.env[`WP_SITE_${i}_USERNAME`]?.trim() ?? "";
    sites.push({ id, name, url: url.replace(/\/$/, ""), color, username, organizationId: null });
    tokens[id]    = token;
    usernames[id] = username;
  }

  if (sites.length === 0) {
    const url   = process.env.WP_API_URL?.trim();
    const token = process.env.WORDPRESS_JWT_TOKEN?.trim();
    if (url && token) {
      sites.push({ id: "1", name: "WordPress 網站", url: url.replace(/\/$/, ""), color: "#5855d0", username: "", organizationId: null });
      tokens["1"]    = token;
      usernames["1"] = "";
    }
  }

  return { sites, tokens, usernames };
}

// DB-first with env-var fallback. Token/username never exposed in returned `sites` array.
export async function getWpSites(): Promise<{ sites: WpSite[]; tokens: Record<string, string>; usernames: Record<string, string> }> {
  try {
    const supabase = getSupabaseWriteClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("wp_sites")
        .select("id, name, url, token, color, username, organization_id")
        .eq("active", true)
        .order("created_at");

      if (error) console.warn("[wp-sites] Supabase error, falling back to env:", error.message);
      if (!error && data && data.length > 0) {
        const rows = data as Array<{ id: string; name: string; url: string; token: string; color: string; username: string; organization_id: string | null }>;
        const sites    = rows.map(r => ({ id: r.id, name: r.name, url: r.url.replace(/\/$/, ""), color: r.color, username: r.username ?? "", organizationId: r.organization_id ?? null }));
        const tokens   = Object.fromEntries(rows.map(r => [r.id, r.token]));
        const usernames = Object.fromEntries(rows.map(r => [r.id, r.username ?? ""]));
        return { sites, tokens, usernames };
      }
    }
  } catch { /* fall through */ }

  return getWpSitesFromEnv();
}

/** resolveWpSite 的結果：站本身 + 已組好的 Authorization header（token 不外流給呼叫端）。 */
export interface ResolvedWpSite {
  site: WpSite;
  token: string;
  username: string;
  authHeader: string;
}

/**
 * **唯一允許「用呼叫端給的 siteId 取站」的入口。**
 *
 * 為什麼要有這個 seam（2026-08-26）：在此之前有 7 條 route 各自寫同一段
 *     const site = (siteId && sites.find(s => s.id === siteId)) || sites[0];
 * 而 getWpSites() 零 org 過濾、回傳每一個 active 站與它的 Application Password。其中兩條會
 * **寫入**（video/embed-to-wp 改寫文章內容、content/wp-post 發文），所以任何過了角色閘的
 * 呼叫者都能對**任一客戶的 WordPress** 發文或改文。修法不是在 7 個地方各補一次
 * assertOrgAccess —— 那等於把同一條規則抄七遍，遲早分叉。收斂成一個函式，改一次全部生效。
 *
 * `siteId` 省略時**保留** 「取第一個」的既有行為，但範圍縮成「呼叫者有權存取的第一個」。
 * 不直接砍掉這個後備：前端確實有不帶 siteId 的呼叫（ContentStudio.tsx:1087、:1260 等
 * `selectedSiteId ? ... : ""`），砍掉會讓「還沒選站」的畫面直接壞掉。
 *
 * @returns null = 找不到該站（呼叫端回 404）
 * @throws OrgAccessError = 找得到但不屬於呼叫者（呼叫端回 403）。兩者刻意分開：
 *   404 與 403 對 staff 是不同的事實，混成一種會讓除錯時分不出「打錯 id」與「沒權限」。
 */
export async function resolveWpSite(
  req: Request | { headers: Headers },
  siteId: string | null | undefined,
): Promise<ResolvedWpSite | null> {
  const { sites, tokens, usernames } = await getWpSites();
  const wanted = (siteId ?? "").trim();

  let site: WpSite | undefined;
  if (wanted) {
    site = sites.find((s) => s.id === wanted);
    if (!site) return null;
    assertOrgAccess(req, site.organizationId); // 明確指定 → 不符即 403
  } else {
    // 未指定 → 呼叫者有權存取的第一個（staff 等同舊的 sites[0]）
    site = sites.find((s) => canAccessOrg(req, s.organizationId));
    if (!site) return null;
  }

  const token = tokens[site.id] ?? "";
  const username = usernames[site.id] ?? "";
  return { site, token, username, authHeader: token ? wpAuthHeader(username, token) : "" };
}

/** 呼叫者有權存取的站清單（多站畫面用，例如內容日曆）。staff 取得全部。 */
export async function listAccessibleWpSites(
  req: Request | { headers: Headers },
): Promise<{ sites: WpSite[]; tokens: Record<string, string>; usernames: Record<string, string> }> {
  const { sites, tokens, usernames } = await getWpSites();
  const allowed = sites.filter((s) => canAccessOrg(req, s.organizationId));
  return {
    sites: allowed,
    tokens: Object.fromEntries(allowed.map((s) => [s.id, tokens[s.id] ?? ""])),
    usernames: Object.fromEntries(allowed.map((s) => [s.id, usernames[s.id] ?? ""])),
  };
}

/**
 * The by-id site routes (PATCH / DELETE / test under app/api/content/sites/[id]) act on one row, active or not:
 * the site manager edits and re-enables stopped sites, so resolveWpSite (active only) is not the seam for them.
 * null = the caller may act on the row; otherwise the response to return: 404 no such row, 403 not the caller's
 * (the same split as resolveWpSite). A DB error throws.
 */
export async function siteRowGate(req: Request | { headers: Headers }, siteId: string): Promise<Response | null> {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new Error("wp_sites:no_supabase_client");
  const { data, error } = await sb.from("wp_sites").select("organization_id").eq("id", siteId).maybeSingle();
  if (error) throw new Error(`wp_sites:owner:${error.message}`);
  if (!data) return Response.json({ ok: false, error: "site not found" }, { status: 404 });
  return canAccessOrg(req, (data as { organization_id: string | null }).organization_id)
    ? null
    : Response.json({ ok: false, error: "forbidden: org mismatch" }, { status: 403 });
}

/**
 * Who may put a URL into wp_sites (POST /api/content/sites, a PATCH that changes url): staff only, a customer gets the
 * 403. Every stored URL is fetched with the site's credentials by code that neither pins the address nor scopes by
 * organization -- publish, the connection test, the R2 reference scan over all sites (r2-delete-guard.ts), the bridge
 * host map (lib/payments/woo.ts bridgeSiteOrg) -- and lower(url) is unique across organizations (0039). Customer
 * self-service sites need all of those closed first (TASKS.md). null = the caller may write this URL.
 */
export function siteUrlWriteGate(req: Request | { headers: Headers }, url: string): Response | null {
  const denied = staffOnly(req);
  if (denied) return denied;
  return /^https?:\/\//i.test(url) ? null : Response.json({ ok: false, error: "url 必須以 http:// 或 https:// 開頭" }, { status: 400 });
}
