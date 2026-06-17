import { resolveStylePrompt } from "../../app/tools/tarot/cards";
import {
  isAspectRatio,
  isStudioModel,
  STUDIO_MODEL_OPTIONS,
  type AspectRatio,
  type StudioModel,
} from "./model-options";

export type StyleDesignMode = "text" | "image";

export interface StyleAnchor {
  model: StudioModel;
  modelLabel: string;
  modelGroup: string;
  mode: StyleDesignMode;
  styleRaw: string;
  stylePrompt: string;
  subject: string;
  refs: string[];
  seed: number | null;
  maxRefs: number;
  aspectRatio?: AspectRatio;
  target: string;
  providerOptions: Record<string, unknown>;
}

export type StyleDesignWorkbenchResult =
  | { ok: true; styleAnchor: StyleAnchor }
  | { ok: false; status: number; error: string };

export interface StyleDesignWorkbenchInput {
  model?: unknown;
  mode?: unknown;
  style?: unknown;
  styleResolved?: unknown;
  subject?: unknown;
  referenceImages?: unknown;
  refs?: unknown;
  seed?: unknown;
  aspectRatio?: unknown;
  target?: unknown;
  providerOptions?: unknown;
}

const DEFAULT_MODEL: StudioModel = "flux-schnell";
const DEFAULT_STYLE = "ornate colored-pencil fantasy illustration, warm antique palette";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function plainRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return { ...(v as Record<string, unknown>) };
}

function normalizeSeed(seed: unknown): { ok: true; seed: number | null } | { ok: false; error: string } {
  if (seed == null || seed === "") return { ok: true, seed: null };
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0) {
    return { ok: false, error: "seed must be a non-negative integer" };
  }
  return { ok: true, seed };
}

function normalizeRefs(input: StyleDesignWorkbenchInput): { ok: true; refs: string[] } | { ok: false; error: string } {
  const raw = input.referenceImages ?? input.refs;
  if (raw == null) return { ok: true, refs: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "referenceImages must be an array" };
  const refs: string[] = [];
  for (const ref of raw) {
    if (typeof ref !== "string" || !ref.trim()) return { ok: false, error: "referenceImages must contain strings" };
    refs.push(ref.trim());
  }
  return { ok: true, refs };
}

export function buildStyleAnchor(input: StyleDesignWorkbenchInput): StyleDesignWorkbenchResult {
  const model = isStudioModel(input.model) ? input.model : DEFAULT_MODEL;
  const modelOption = STUDIO_MODEL_OPTIONS.find((m) => m.value === model) ?? STUDIO_MODEL_OPTIONS[0];

  const refsResult = normalizeRefs(input);
  if ("error" in refsResult) return { ok: false, status: 400, error: refsResult.error };
  const refs = refsResult.refs;

  const mode: StyleDesignMode = input.mode === "image" || refs.length > 0 ? "image" : "text";
  if (mode === "image" && modelOption.maxRefs <= 0) {
    return { ok: false, status: 400, error: "selected model does not support reference images" };
  }
  if (refs.length > modelOption.maxRefs) {
    return { ok: false, status: 400, error: `selected model supports at most ${modelOption.maxRefs} reference images` };
  }

  const seedResult = normalizeSeed(input.seed);
  if ("error" in seedResult) return { ok: false, status: 400, error: seedResult.error };

  if (input.aspectRatio != null && !isAspectRatio(input.aspectRatio)) {
    return { ok: false, status: 400, error: "invalid aspectRatio" };
  }

  const styleRaw = str(input.style);
  const overridePrompt = str(input.styleResolved);
  const stylePrompt = overridePrompt || resolveStylePrompt(styleRaw) || DEFAULT_STYLE;

  return {
    ok: true,
    styleAnchor: {
      model,
      modelLabel: modelOption.label,
      modelGroup: modelOption.group,
      mode,
      styleRaw,
      stylePrompt,
      subject: str(input.subject),
      refs,
      seed: seedResult.seed,
      maxRefs: modelOption.maxRefs,
      aspectRatio: isAspectRatio(input.aspectRatio) ? input.aspectRatio : undefined,
      target: str(input.target) || "generic",
      providerOptions: plainRecord(input.providerOptions),
    },
  };
}
