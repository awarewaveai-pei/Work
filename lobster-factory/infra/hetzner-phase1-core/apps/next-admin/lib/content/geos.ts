// The regions trending supports: the one list. Google News feeds are keyed off it (trending-sources.ts GEO_RSS), the
// operator's source rows may only name these (app/api/content/sources/route.ts), and the shared trends cache refuses any
// other geo (lib/content/topics/trends.ts). No imports: routes that must not reach the AI gateway can read it.
export const TRENDING_GEOS = ["TW", "HK", "SG", "US", "GB", "JP", "AU"] as const;
export type TrendingGeo = (typeof TRENDING_GEOS)[number];
export const isTrendingGeo = (g: string): g is TrendingGeo => (TRENDING_GEOS as readonly string[]).includes(g);
