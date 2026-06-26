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
 *   "tarot" | "tarot-preview" | "tarot-compare" | "tarot-art" → tarot card art
 *     ("tarot" = framed print card; "tarot-art" = frameless raw artwork)
 *   "canvas" | anything else                    → passed through verbatim
 */

/** Raw `metadata.source` values that mean "product mockup 商品照" — BOTH mockup save-paths:
 *  MockupStudio saves "mockup" (MockupStudio.tsx:540,556); the Studio workbench's Printful mockups
 *  save "printful-mockup" (StudioWorkbench.tsx:448). SSOT consumed by assetToolGroup AND the
 *  /api/tools/designs ?group= DB filter — add a new mockup save-source here and the publish picker,
 *  My Designs Mockup tab, and the API filter all follow in lockstep (no drift). */
export const MOCKUP_SOURCES = ["mockup", "printful-mockup"] as const;

/** Collapse a raw `metadata.source` into a coarse tool group (tarot / studio / mockup / …). */
export function assetToolGroup(source: string | null | undefined): string {
  if (!source) return "unknown";
  if (source === "tarot" || source === "tarot-preview" || source === "tarot-compare" || source === "tarot-art") return "tarot";
  if (source === "pod-studio") return "studio";
  if ((MOCKUP_SOURCES as readonly string[]).includes(source)) return "mockup";
  return source;
}
