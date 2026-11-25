// The full bake-off pages shown on the 實測紀錄 tab. Files: content/model-bakeoff/<slug>/index.html, written by
// scripts/sync-model-bakeoff-pages.mjs (repo root) from agency-os/reports/model-bakeoff/. The route serves only these slugs.
export const BAKEOFF_SLUGS = ["article", "copy", "image"] as const;
export type BakeoffSlug = (typeof BAKEOFF_SLUGS)[number];

export const isBakeoffSlug = (s: string): s is BakeoffSlug => (BAKEOFF_SLUGS as readonly string[]).includes(s);
export const bakeoffHref = (slug: BakeoffSlug) => `/tools/ai-models/bakeoff/${slug}`;
