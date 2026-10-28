import { CLAUDE_DEFAULT_MODEL } from "./claude-params";
import { TEXT_RATES } from "./cost-model";

// Ordered cheap → expensive within each group (price = lib/ai/cost-model.ts TEXT_RATES).
// Only status "active" ids (lib/ai/__tests__/model-registry.test.ts); a retired pick is remapped below.
// Labels carry no parenthetical descriptor — pricing is shown separately in the picker UI.
export const AI_TEXT_MODELS = [
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5", group: "Claude" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5", group: "Claude" },
  { value: "claude-fable-5-1", label: "Claude Fable 5.1", group: "Claude" },
  { value: "gpt-5.4-nano", label: "GPT-5.4 nano", group: "OpenAI" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini", group: "OpenAI" },
  { value: "gpt-5.4", label: "GPT-5.4", group: "OpenAI" },
  { value: "gpt-5.5", label: "GPT-5.5", group: "OpenAI" },
] as const;

export type AiTextModel = (typeof AI_TEXT_MODELS)[number]["value"];
export type AiTextModelGroup = (typeof AI_TEXT_MODELS)[number]["group"];

export const DEFAULT_AI_TEXT_MODEL: AiTextModel = CLAUDE_DEFAULT_MODEL;
export const AI_TEXT_MODEL_GROUPS: AiTextModelGroup[] = Array.from(new Set(AI_TEXT_MODELS.map((m) => m.group)));
export const OPENAI_TEXT_MODELS: AiTextModel[] = AI_TEXT_MODELS
  .filter((m) => m.group === "OpenAI")
  .map((m) => m.value);
export const ALLOWED_TEXT_MODELS: AiTextModel[] = AI_TEXT_MODELS.map((m) => m.value);

export function isAiTextModel(v: unknown): v is AiTextModel {
  return typeof v === "string" && ALLOWED_TEXT_MODELS.includes(v as AiTextModel);
}

/**
 * A picked/saved model id -> the id to run: menu ids as-is; an id the registry marks legacy/retired (old tab,
 * stored request body) -> its registry `fallback`; anything else -> undefined (caller picks its own default).
 */
export function resolveSavedAiTextModel(v: unknown): AiTextModel | undefined {
  if (isAiTextModel(v)) return v;
  if (typeof v !== "string" || !Object.hasOwn(TEXT_RATES, v) || TEXT_RATES[v].status === "active") return undefined;
  const successor = TEXT_RATES[v].fallback;
  return isAiTextModel(successor) ? successor : undefined;
}

export function normalizeAiTextModel(v: unknown): AiTextModel {
  return resolveSavedAiTextModel(v) ?? DEFAULT_AI_TEXT_MODEL;
}

export function isOpenAiTextModel(model: AiTextModel): boolean {
  return OPENAI_TEXT_MODELS.includes(model);
}

export function textModelOption(model: AiTextModel): (typeof AI_TEXT_MODELS)[number] {
  return AI_TEXT_MODELS.find((m) => m.value === model) ?? AI_TEXT_MODELS[0];
}
