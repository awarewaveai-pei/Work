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
  type TarotGenParams,
  type TarotGenResult,
} from "../tarot/image-gen";
import type { Grant } from "@/lib/entitlements/can";
export {
  isAspectRatio,
  isStudioModel,
  modelSupportsRefs,
  STUDIO_MODEL_OPTIONS,
  VALID_ASPECT_RATIOS,
} from "./model-options";
export type { AspectRatio, StudioModel, StudioModelOption } from "./model-options";

export type StudioGenParams = TarotGenParams;
export type StudioGenResult = TarotGenResult;

/** Generate one image. Same engine as Tarot Studio — model registry included. */
export function generateImage(params: StudioGenParams, grant: Grant): Promise<StudioGenResult> {
  return generateTarotImage(params, grant);
}
