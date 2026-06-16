export type StudioModel =
  | "flux-schnell"
  | "flux-dev"
  | "flux-kontext-dev"
  | "flux-kontext-pro"
  | "openai-low"
  | "openai-medium"
  | "openai-high"
  | "ideogram-v2a-turbo"
  | "ideogram-v3-balanced"
  | "ideogram-v4-turbo"
  | "ideogram-v4-quality"
  | "ideogram-character"
  | "seedream-4.5"
  | "nano-banana-2"
  | "nano-banana-pro"
  | "imagen-4"
  | "flux-2-max";

export type AspectRatio = "2:3" | "3:2" | "4:5" | "1:1" | "9:16" | "4:3" | "3:4" | "16:9";

export const VALID_ASPECT_RATIOS: readonly AspectRatio[] = ["2:3", "3:2", "4:5", "1:1", "9:16", "4:3", "3:4", "16:9"];

export function isAspectRatio(v: unknown): v is AspectRatio {
  return typeof v === "string" && (VALID_ASPECT_RATIOS as readonly string[]).includes(v);
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
  { value: "seedream-4.5", label: "Seedream 4.5", group: "Google+", costNt: 1.3, maxRefs: 0 },
  { value: "nano-banana-2", label: "Nano Banana 2", group: "Google+", costNt: 2.2, maxRefs: 14 },
  { value: "nano-banana-pro", label: "Nano Banana Pro", group: "Google+", costNt: 4.4, maxRefs: 8 },
  { value: "imagen-4", label: "Imagen 4", group: "Google+", costNt: 1.3, maxRefs: 0 },
  { value: "openai-low", label: "GPT-Image-1 低", group: "OpenAI", costNt: 0.5, maxRefs: 5 },
  { value: "openai-medium", label: "GPT-Image-1 中", group: "OpenAI", costNt: 1.3, maxRefs: 5 },
  { value: "openai-high", label: "GPT-Image-1 高", group: "OpenAI", costNt: 5, maxRefs: 5 },
];

export function isStudioModel(v: unknown): v is StudioModel {
  return typeof v === "string" && STUDIO_MODEL_OPTIONS.some((m) => m.value === v);
}

export function modelSupportsRefs(model: StudioModel): boolean {
  return (STUDIO_MODEL_OPTIONS.find((m) => m.value === model)?.maxRefs ?? 0) > 0;
}
