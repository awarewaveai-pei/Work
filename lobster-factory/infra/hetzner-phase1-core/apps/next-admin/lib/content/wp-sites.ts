import { getSupabaseWriteClient } from "@/lib/supabase-server";

export interface WpSite {
  id: string;
  name: string;
  url: string;
  color: string;
  username: string;
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
    sites.push({ id, name, url: url.replace(/\/$/, ""), color, username });
    tokens[id]    = token;
    usernames[id] = username;
  }

  if (sites.length === 0) {
    const url   = process.env.WP_API_URL?.trim();
    const token = process.env.WORDPRESS_JWT_TOKEN?.trim();
    if (url && token) {
      sites.push({ id: "1", name: "WordPress 網站", url: url.replace(/\/$/, ""), color: "#5855d0", username: "" });
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
        .select("id, name, url, token, color, username")
        .eq("active", true)
        .order("created_at");

      if (error) console.warn("[wp-sites] Supabase error, falling back to env:", error.message);
      if (!error && data && data.length > 0) {
        const rows = data as Array<{ id: string; name: string; url: string; token: string; color: string; username: string }>;
        const sites    = rows.map(r => ({ id: r.id, name: r.name, url: r.url.replace(/\/$/, ""), color: r.color, username: r.username ?? "" }));
        const tokens   = Object.fromEntries(rows.map(r => [r.id, r.token]));
        const usernames = Object.fromEntries(rows.map(r => [r.id, r.username ?? ""]));
        return { sites, tokens, usernames };
      }
    }
  } catch { /* fall through */ }

  return getWpSitesFromEnv();
}
