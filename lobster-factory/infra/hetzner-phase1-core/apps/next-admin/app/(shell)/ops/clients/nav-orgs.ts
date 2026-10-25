// Shared by the server pages that render a first page of clients, GET /api/ops/org-search, and the browser pickers
// that search the rest (ClientPanelNav.tsx, OrgPicker.tsx): a plain module, because a server component cannot call a
// function exported from a "use client" file.
/** Most rows a client list loads up front (the nav, the pickers, GET /api/ops/org-search and /api/ops/clients). */
export const NAV_FIRST = 50;
/** Most rows GET /api/ops/org-search?q= returns. */
export const NAV_SEARCH_LIMIT = 20;

/** One client as every picker shows it; brandColors = the valid hex colours of metadata.client_config.brandColors. */
export interface PickOrg {
  id: string;
  slug: string;
  name: string;
  color: string;
  brandColors: string[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** An organizations row selected as id, slug, name, color:metadata->>color[, brandColors:metadata->client_config->brandColors]. */
export function toPickOrg(row: {
  id: string;
  slug: string;
  name?: string | null;
  color?: unknown;
  brandColors?: unknown;   // jsonb: { primary?, secondary?, accent? } when set
}): PickOrg {
  const bc = row.brandColors && typeof row.brandColors === "object" ? (row.brandColors as Record<string, unknown>) : null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name || row.slug,
    color: orgColor(row.slug, row.color),
    brandColors: [bc?.primary, bc?.secondary, bc?.accent].filter((x): x is string => typeof x === "string" && HEX.test(x)),
  };
}

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
