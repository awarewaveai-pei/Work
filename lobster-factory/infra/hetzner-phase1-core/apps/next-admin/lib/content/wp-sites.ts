export interface WpSite {
  id: string;
  name: string;
  url: string;
  color: string;
}

const COLORS = ["#5855d0", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export function getWpSites(): { sites: WpSite[]; tokens: Record<string, string> } {
  const sites: WpSite[] = [];
  const tokens: Record<string, string> = {};

  for (let i = 1; i <= 10; i++) {
    const url   = process.env[`WP_SITE_${i}_URL`]?.trim();
    const token = process.env[`WP_SITE_${i}_TOKEN`]?.trim();
    if (!url || !token) continue;
    const id    = String(i);
    const name  = process.env[`WP_SITE_${i}_NAME`]?.trim() ?? `網站 ${i}`;
    const color = process.env[`WP_SITE_${i}_COLOR`]?.trim() ?? COLORS[(i - 1) % COLORS.length];
    sites.push({ id, name, url: url.replace(/\/$/, ""), color });
    tokens[id] = token;
  }

  if (sites.length === 0) {
    const url   = process.env.WP_API_URL?.trim();
    const token = process.env.WORDPRESS_JWT_TOKEN?.trim();
    if (url && token) {
      sites.push({ id: "1", name: "WordPress 網站", url: url.replace(/\/$/, ""), color: "#5855d0" });
      tokens["1"] = token;
    }
  }

  return { sites, tokens };
}
