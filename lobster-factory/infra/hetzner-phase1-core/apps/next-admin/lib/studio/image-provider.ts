/**
 * Studio ImageProvider — product-neutral facade over the shared generation engine.
 *
 * The engine (model registry, per-model buildInput combo-packs, Replicate/OpenAI
 * transports) lives in ../tarot/image-gen.ts because Tarot Studio shipped it first.
 * Studio consumes it through this seam so the engine can move to a neutral home
 * later without touching any Studio caller. Do NOT re-implement engine logic here.
 */
import {
  generateTarotImage,
  isTarotModel,
  isAspectRatio,
  VALID_ASPECT_RATIOS,
  TAROT_MODELS,
  type TarotModel,
  type TarotGenParams,
  type TarotGenResult,
  type AspectRatio,
} from "../tarot/image-gen";

export type StudioModel = TarotModel;
export type StudioGenParams = TarotGenParams;
export type StudioGenResult = TarotGenResult;
export type { AspectRatio };

export const isStudioModel = isTarotModel;
export { isAspectRatio, VALID_ASPECT_RATIOS };

/** Generate one image. Same engine as Tarot Studio — model registry included. */
export function generateImage(params: StudioGenParams): Promise<StudioGenResult> {
  return generateTarotImage(params);
}

/** True when the model accepts at least one reference image. */
export function modelSupportsRefs(model: StudioModel): boolean {
  return TAROT_MODELS[model].supportsImg2img;
}

/**
 * UI metadata for the model picker. Canonical list for Studio surfaces going
 * forward (TarotStudio keeps a deliberate local copy — see its MODEL_OPTIONS note).
 * costNt = rough NT$ per image; maxRefs = reference images the model consumes.
 */
export interface StudioModelOption {
  value: StudioModel;
  label: string;
  group: string;
  costNt: number;
  maxRefs: number;
}

export const STUDIO_MODEL_OPTIONS: StudioModelOption[] = [
  { value: "flux-schnell", label: "FLUX schnell", group: "BFL", costNt: 0.1, maxRefs: 0 },
  { value: "flux-dev", label: "FLUX dev", group: "BFL", costNt: 1, maxRefs: 1 },
  { value: "flux-2-max", label: "FLUX 2 Max", group: "BFL", costNt: 2.3, maxRefs: 0 },
  { value: "ideogram-v2a-turbo", label: "Ideogram v2a Turbo", group: "Ideogram", costNt: 1, maxRefs: 0 },
  { value: "ideogram-v3-balanced", label: "Ideogram v3 Balanced", group: "Ideogram", costNt: 2, maxRefs: 0 },
  { value: "ideogram-v4-turbo", label: "Ideogram v4 Turbo", group: "Ideogram", costNt: 1, maxRefs: 0 },
  { value: "ideogram-v4-quality", label: "Ideogram v4 Quality", group: "Ideogram", costNt: 3, maxRefs: 0 },
  { value: "ideogram-character", label: "Ideogram Character", group: "Ideogram", costNt: 5, maxRefs: 1 },
  { value: "seedream-4.5", label: "Seedream 4.5", group: "Google+", costNt: 1.3, maxRefs: 0 },
  { value: "nano-banana-2", label: "Nano Banana 2", group: "Google+", costNt: 2.2, maxRefs: 14 },
  { value: "nano-banana-pro", label: "Nano Banana Pro", group: "Google+", costNt: 4.4, maxRefs: 8 },
  { value: "imagen-4", label: "Imagen 4", group: "Google+", costNt: 1.3, maxRefs: 0 },
  { value: "openai-low", label: "GPT-Image-1 低", group: "OpenAI", costNt: 0.5, maxRefs: 5 },
  { value: "openai-medium", label: "GPT-Image-1 中", group: "OpenAI", costNt: 1.3, maxRefs: 5 },
  { value: "openai-high", label: "GPT-Image-1 高", group: "OpenAI", costNt: 5, maxRefs: 5 },
];
