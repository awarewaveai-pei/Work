// Shared by layout.tsx (server, first page) and ClientPanelNav.tsx (browser, search results): a plain module, because
// a server component cannot call a function exported from a "use client" file.
export const NAV_FIRST = 50;
/** Most rows GET /api/ops/clients?q= returns. */
export const NAV_SEARCH_LIMIT = 20;

const ORG_COLORS = [
  "#f87171", "#60a5fa", "#4ade80", "#a78bfa", "#fbbf24",
  "#fb923c", "#34d399", "#818cf8", "#f472b6", "#2dd4bf",
];

/** metadata.color, else a palette color from the slug: the same client gets the same dot in the list and in search. */
export function orgColor(slug: string, color: unknown): string {
  if (typeof color === "string" && color) return color;
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ORG_COLORS[h % ORG_COLORS.length];
}
