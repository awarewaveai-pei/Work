/**
 * Asset tool-group classification — SSOT shared by:
 *   - My Designs gallery tab segregation (DesignsGallery.tsx)
 *   - the /api/tools/designs list filter (?group=design|mockup)
 *   - the publish wizard's split design / 商品照 pickers (PublishWizard.tsx)
 *
 * Extracted from DesignsGallery.tsx (commit b553d5d4 first added the 設計圖/Mockup tab split
 * there). Keeping ONE definition means "what My Designs calls a Mockup" and "what the publish
 * picker calls a Mockup" can never drift apart.
 *
 * The raw classifier is `metadata.source`, written by /api/tools/designs on save:
 *   "mockup"                                    → product mockup 商品照
 *   "pod-studio"                                → studio design art
 *   "tarot" | "tarot-preview" | "tarot-compare" → tarot card art
 *   "canvas" | anything else                    → passed through verbatim
 */

/** Collapse a raw `metadata.source` into a coarse tool group (tarot / studio / mockup / …). */
export function assetToolGroup(source: string | null | undefined): string {
  if (!source) return "unknown";
  if (source === "tarot" || source === "tarot-preview" || source === "tarot-compare") return "tarot";
  if (source === "pod-studio") return "studio";
  if (source === "mockup") return "mockup";
  return source;
}

/** True when the asset is a product mockup (商品照); false for design art / tarot / studio / unknown. */
export function isMockupSource(source: string | null | undefined): boolean {
  return assetToolGroup(source) === "mockup";
}
