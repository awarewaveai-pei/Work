/**
 * Replicate image/text-to-video models: the one list. lib/tarot/video-motion-gen.ts calls them; video-workbench
 * (apps/video-workbench/backend/replicate-video.cjs) loads this file with Node type stripping, so it imports
 * nothing and uses only erasable TypeScript. Prices: cost-model.ts VIDEO_MOTION_RATES (keys checked by type).
 *
 * Input schemas read from GET /v1/models/<slug> (2026-09-12, rechecked 2026-11-05):
 *   - Runway Gen-4 Turbo: image required, field "image"; 5/10 s
 *   - Google Veo 3.1 / 3.1 Fast: image optional, field "image"; 4/6/8 s; resolution defaults to 1080p (price is
 *     per output second by audio variant only, not resolution); generate_audio off (narration is made separately)
 *   - Luma Ray 3.2: first frame "start_image" (only with 5 s; aspect_ratio then follows the image); priced per video
 *     by resolution x duration, rate pinned for 720p 5 s
 */

export type VideoMotionModel =
  | "runway-gen4-turbo"
  | "veo-3-1-fast"
  | "veo-3-1"
  | "luma-ray-3-2";

export interface MotionInputOptions {
  imageUrl?: string;
  prompt: string;
  aspectRatio: "16:9" | "9:16";
  durationSec: number;
  /** Omitted = the model's own default (NA's video pipeline relies on that). */
  resolution?: "720p";
}

export interface MotionConfig {
  slug: string;
  defaultDurationSec: number;
  /** Durations this app offers (a subset of the schema: only the ones priced in VIDEO_MOTION_RATES). */
  durations: readonly number[];
  ratios: readonly ("16:9" | "9:16")[];
  requiresImage: boolean;
  buildInput: (opts: MotionInputOptions) => Record<string, unknown>;
}

export const MOTION_MODELS: Record<VideoMotionModel, MotionConfig> = {
  "runway-gen4-turbo": {
    slug: "runwayml/gen4-turbo",
    defaultDurationSec: 5,
    durations: [5, 10],
    ratios: ["16:9", "9:16"],
    requiresImage: true,
    buildInput: ({ imageUrl, prompt, aspectRatio, durationSec }) => ({
      image: imageUrl, prompt, aspect_ratio: aspectRatio, duration: durationSec,
    }),
  },
  "veo-3-1-fast": {
    slug: "google/veo-3.1-fast",
    defaultDurationSec: 8,
    durations: [4, 6, 8],
    ratios: ["16:9", "9:16"],
    requiresImage: false,
    buildInput: ({ imageUrl, prompt, aspectRatio, durationSec, resolution }) => ({
      ...(imageUrl ? { image: imageUrl } : {}), prompt, aspect_ratio: aspectRatio, duration: durationSec, generate_audio: false,
      ...(resolution ? { resolution } : {}),
    }),
  },
  "veo-3-1": {
    slug: "google/veo-3.1",
    defaultDurationSec: 8,
    durations: [4, 6, 8],
    ratios: ["16:9", "9:16"],
    requiresImage: false,
    buildInput: ({ imageUrl, prompt, aspectRatio, durationSec, resolution }) => ({
      ...(imageUrl ? { image: imageUrl } : {}), prompt, aspect_ratio: aspectRatio, duration: durationSec, generate_audio: false,
      ...(resolution ? { resolution } : {}),
    }),
  },
  "luma-ray-3-2": {
    slug: "luma/ray-3.2",
    defaultDurationSec: 5,
    durations: [5],
    ratios: ["16:9", "9:16"],
    requiresImage: false,
    buildInput: ({ imageUrl, prompt, aspectRatio, durationSec }) => ({
      ...(imageUrl ? { start_image: imageUrl } : {}), prompt, aspect_ratio: aspectRatio, duration: durationSec, resolution: "720p",
    }),
  },
};

export function isVideoMotionModel(v: unknown): v is VideoMotionModel {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(MOTION_MODELS, v);
}
