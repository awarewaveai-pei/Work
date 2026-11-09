/**
 * Typed door to public/editor-shared/image-models.js — the ONE catalog of image models and editing tools with their prices
 * (same pattern as outpaint-presets.ts). Nothing is re-implemented here; this file adds the id unions and the Studio-specific
 * rules (which models composite a product, which print onto a photo). drift guard: lib/studio/__tests__/editor-ai-panels.test.ts
 */
import * as shared from "../../public/editor-shared/image-models.js";

export type StudioModel =
  | "flux-schnell"
  | "flux-dev"
  | "flux-kontext-dev"
  | "flux-kontext-pro"
  | "openai-low"
  | "openai-medium"
  | "openai-high"
  | "openai-25-edit"
  | "openai-26-edit"
  | "flux-2-klein-4b"
  | "flux-kontext-fast"
  | "ideogram-v2a-turbo"
  | "ideogram-v3-balanced"
  | "ideogram-v4-turbo"
  | "ideogram-v4-quality"
  | "ideogram-character"
  | "nano-banana-2"
  | "nano-banana-pro"
  | "imagen-4"
  | "flux-2-max";

/** Mask / canvas tools of the genfill and inpaint routes (image-models.js EDIT_TOOLS). */
export type EditTool = "flux-fill-pro" | "ideogram-4-5-edit" | "ideogram-4-5-edit-low" | "bria-eraser" | "bria-expand";

export type ModelUse = "generate" | "edit" | "fill" | "remove" | "outpaint";

export type AspectRatio = "2:3" | "3:2" | "4:5" | "1:1" | "9:16" | "4:3" | "3:4" | "16:9";

export const VALID_ASPECT_RATIOS = shared.ASPECT_RATIOS as readonly AspectRatio[];

export function isAspectRatio(v: unknown): v is AspectRatio {
  return typeof v === "string" && (VALID_ASPECT_RATIOS as readonly string[]).includes(v);
}

/** The supported ratio closest to an image's own, so an edit of it keeps its framing. */
export const nearestAspectRatio = shared.nearestAspectRatio as (width: number, height: number) => AspectRatio;

export const TWD_RATE: number = shared.TWD_RATE;
/** Price in NT$ to one decimal. */
export const nt = shared.nt as (usd: number) => number;

export interface ImageModelRow<V extends string = StudioModel | EditTool> {
  value: V;
  label: string;
  vendor: string;
  usd: number;
  /** The one 繁中 line under the price on every model button (image-models.js `note`). */
  note: string;
  uses: readonly ModelUse[];
  /** What an EMPTY description does on this 填色 / 去除 button (image-models.js `blank`). Absent = unmeasured = treat as "no". */
  blank?: "ok" | "no";
}
export interface StudioModelOption extends ImageModelRow<StudioModel> {
  group: string;
  maxRefs: number;
  /** NT$ per image, shown on every model button (nt(usd)). */
  costNt: number;
}

export const STUDIO_MODEL_OPTIONS: readonly StudioModelOption[] = (shared.IMAGE_MODELS as readonly Omit<StudioModelOption, "costNt">[])
  .map((m) => ({ ...m, costNt: nt(m.usd) }));

export const EDIT_TOOLS = shared.EDIT_TOOLS as readonly ImageModelRow<EditTool>[];

/** Catalog rows (models and tools) that offer `use`, with NT$ price. */
/** Does an empty description do anything on this row? One implementation, in the browser catalog. */
export const takesBlankPrompt = shared.takesBlankPrompt as (m: Pick<ImageModelRow, "blank">) => boolean;

export function modelsFor(use: ModelUse): readonly (ImageModelRow & { costNt: number })[] {
  return (shared.modelsFor(use) as readonly ImageModelRow[]).map((m) => ({ ...m, costNt: nt(m.usd) }));
}

/** Models that can print a design onto a photo: the call carries TWO reference images (the photo, then the design),
 *  so a model that takes 0 or 1 cannot see both. GPT-Image-2.5 first: it bent the print with the folds best (2026-11-01). */
export const PHOTO_PRINT_MODELS: readonly StudioModelOption[] = [
  ...STUDIO_MODEL_OPTIONS.filter((m) => m.value === "openai-25-edit"),
  ...STUDIO_MODEL_OPTIONS.filter((m) => m.value !== "openai-25-edit" && m.maxRefs >= 2),
];

export function isStudioModel(v: unknown): v is StudioModel {
  return typeof v === "string" && STUDIO_MODEL_OPTIONS.some((m) => m.value === v);
}

export function modelSupportsRefs(model: StudioModel): boolean {
  return (STUDIO_MODEL_OPTIONS.find((m) => m.value === model)?.maxRefs ?? 0) > 0;
}

// Models that can composite a provided product PHOTO into a newly generated scene as a discrete
// object (real placement on a surface, matched perspective + contact shadow) — NOT mere style/img2img
// conditioning. Deliberately stricter than modelSupportsRefs():
//   • flux-dev  — uses the ref as img2img (input.image + prompt_strength 0.82, see lib/tarot/image-gen.ts),
//                 which re-paints away from the photo; it does NOT place the product as an object → excluded.
//   • ideogram-character — character_reference_image is for face/character consistency, not products → excluded.
// nano-banana-* use image_input (multi-image compose), flux-kontext use input_image (in-context incorporation),
// gpt-image-2.x routes to /images/edits — all three genuinely place the product.
export const PRODUCT_COMPOSITE_MODELS: readonly StudioModel[] = [
  "nano-banana-2",
  "nano-banana-pro",
  "flux-kontext-dev",
  "flux-kontext-pro",
  "openai-low",
  "openai-medium",
  "openai-high",
  "openai-25-edit",
  "openai-26-edit",
  // flux-2-klein-4b / flux-kontext-fast are deliberately NOT here: added 2026-11-09 for 「整張改順」 only and never
  // measured at placing a product photo into a scene; maxRefs 1 keeps them out of PHOTO_PRINT_MODELS too.
];

export function modelCompositesProduct(model: StudioModel): boolean {
  return PRODUCT_COMPOSITE_MODELS.includes(model);
}
