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
 *   TAROT_SOURCES ("tarot" | "tarot-preview" | "tarot-preview-edit" | "tarot-compare" | "tarot-art") → tarot card art
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
  if ((TAROT_SOURCES as readonly string[]).includes(source)) return "tarot";
  if (source === "pod-studio") return "studio";
  if ((MOCKUP_SOURCES as readonly string[]).includes(source)) return "mockup";
  return source;
}

/** Raw `metadata.source` values that mean tarot card art (assetToolGroup "tarot", product "tarot-card"). */
// Every tarot save-source (TarotStudio saveToGallery / postDesign). The gallery, its counts and assetToolGroup all
// read this list: "tarot-preview-edit" was missing from three hand-written copies, so it counted under 全部 only.
export const TAROT_SOURCES = ["tarot", "tarot-preview", "tarot-preview-edit", "tarot-compare", "tarot-art"] as const;

/** My Designs model chips. Keys = `metadata.model_name`; the /api/tools/designs counts use the same keys. */
export const GALLERY_MODEL_LABELS: Record<string, string> = {
  "flux-schnell": "FLUX schnell",
  "flux-dev": "FLUX dev",
  "flux-2-max": "FLUX 2 Max",
  "ideogram-v2a-turbo": "Ideogram v2a Turbo",
  "ideogram-v3-balanced": "Ideogram v3 Balanced",
  "ideogram-v4-turbo": "Ideogram v4 Turbo",
  "ideogram-v4-quality": "Ideogram v4 Quality",
  "ideogram-character": "Ideogram Character",
  "seedream-4.5": "Seedream 4.5",
  "nano-banana-2": "Nano Banana 2",
  "nano-banana-pro": "Nano Banana Pro",
  "imagen-4": "Imagen 4",
  "openai-low": "GPT-Image-1 低",
  "openai-medium": "GPT-Image-1 中",
  "openai-high": "GPT-Image-1 高",
};

/** My Designs product chips. Key rule (client assetProduct + server filter in lib/studio/designs-list.ts):
 *  TAROT_SOURCES → "tarot-card"; source "pod-studio" → metadata.product_type; source "mockup" → "mockup-composite". */
export const GALLERY_PRODUCT_LABELS: Record<string, string> = {
  "tarot-card": "塔羅牌",
  tshirt: "T-shirt",
  hoodie: "Hoodie",
  mug: "Mug",
  poster: "Poster",
  sticker: "Sticker",
  "mockup-composite": "商品合成",
};
