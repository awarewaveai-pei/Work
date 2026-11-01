export type StudioModel =
  | "flux-schnell"
  | "flux-dev"
  | "flux-kontext-dev"
  | "flux-kontext-pro"
  | "openai-low"
  | "openai-medium"
  | "openai-high"
  | "openai-25-edit"
  | "ideogram-v2a-turbo"
  | "ideogram-v3-balanced"
  | "ideogram-v4-turbo"
  | "ideogram-v4-quality"
  | "ideogram-character"
  | "nano-banana-2"
  | "nano-banana-pro"
  | "imagen-4"
  | "flux-2-max";

export type AspectRatio = "2:3" | "3:2" | "4:5" | "1:1" | "9:16" | "4:3" | "3:4" | "16:9";

export const VALID_ASPECT_RATIOS: readonly AspectRatio[] = ["2:3", "3:2", "4:5", "1:1", "9:16", "4:3", "3:4", "16:9"];

export function isAspectRatio(v: unknown): v is AspectRatio {
  return typeof v === "string" && (VALID_ASPECT_RATIOS as readonly string[]).includes(v);
}

const ASPECT_VALUES: readonly [AspectRatio, number][] = [
  ["2:3", 2 / 3], ["3:4", 3 / 4], ["4:5", 4 / 5], ["1:1", 1], ["9:16", 9 / 16], ["3:2", 3 / 2], ["4:3", 4 / 3], ["16:9", 16 / 9],
];

/** The supported ratio closest to an image's own, so an edit of it keeps its framing. */
export function nearestAspectRatio(width: number, height: number): AspectRatio {
  const r = width / height;
  return ASPECT_VALUES.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}

export interface StudioModelOption {
  value: StudioModel;
  label: string;
  group: string;
  costNt: number;
  maxRefs: number;
}

export const STUDIO_MODEL_OPTIONS: readonly StudioModelOption[] = [
  { value: "flux-schnell", label: "FLUX schnell", group: "BFL", costNt: 0.1, maxRefs: 0 },
  { value: "flux-dev", label: "FLUX dev", group: "BFL", costNt: 1, maxRefs: 1 },
  { value: "flux-kontext-dev", label: "FLUX Kontext Dev", group: "BFL", costNt: 1.5, maxRefs: 1 },
  { value: "flux-kontext-pro", label: "FLUX Kontext Pro", group: "BFL", costNt: 3.5, maxRefs: 1 },
  { value: "flux-2-max", label: "FLUX 2 Max", group: "BFL", costNt: 2.3, maxRefs: 0 },
  { value: "ideogram-v2a-turbo", label: "Ideogram v2a Turbo", group: "Ideogram", costNt: 1, maxRefs: 0 },
  { value: "ideogram-v3-balanced", label: "Ideogram v3 Balanced", group: "Ideogram", costNt: 2, maxRefs: 0 },
  { value: "ideogram-v4-turbo", label: "Ideogram v4 Turbo", group: "Ideogram", costNt: 1, maxRefs: 0 },
  { value: "ideogram-v4-quality", label: "Ideogram v4 Quality", group: "Ideogram", costNt: 3, maxRefs: 0 },
  { value: "ideogram-character", label: "Ideogram Character", group: "Ideogram", costNt: 5, maxRefs: 1 },
  { value: "nano-banana-2", label: "Nano Banana 2", group: "Google+", costNt: 2.2, maxRefs: 14 },
  { value: "nano-banana-pro", label: "Nano Banana Pro", group: "Google+", costNt: 4.4, maxRefs: 8 },
  { value: "imagen-4", label: "Imagen 4", group: "Google+", costNt: 1.3, maxRefs: 0 },
  { value: "openai-low", label: "GPT-Image-1 低", group: "OpenAI", costNt: 0.5, maxRefs: 5 },
  { value: "openai-medium", label: "GPT-Image-1 中", group: "OpenAI", costNt: 1.3, maxRefs: 5 },
  { value: "openai-high", label: "GPT-Image-1 高", group: "OpenAI", costNt: 5, maxRefs: 5 },
  // Measured 2026-11-01 on OpenAI /v1/images/edits (high, 1024x1536, 2 refs): 196 text + 2492 image in, 1372 out = US$0.062 ≈ NT$2.
  { value: "openai-25-edit", label: "GPT-Image-2.5 修圖", group: "OpenAI", costNt: 2, maxRefs: 5 },
];

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
// gpt-image-1 routes to /images/edits — all three genuinely place the product.
export const PRODUCT_COMPOSITE_MODELS: readonly StudioModel[] = [
  "nano-banana-2",
  "nano-banana-pro",
  "flux-kontext-dev",
  "flux-kontext-pro",
  "openai-low",
  "openai-medium",
  "openai-high",
  "openai-25-edit",
];

export function modelCompositesProduct(model: StudioModel): boolean {
  return PRODUCT_COMPOSITE_MODELS.includes(model);
}
