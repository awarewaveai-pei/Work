export const AI_TEXT_MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6（品質平衡）", group: "Claude" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5（快速省 token）", group: "Claude" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8（高階推理）", group: "Claude" },
  { value: "claude-fable-5", label: "Claude Fable 5（長任務代理）", group: "Claude" },
  { value: "gpt-5.5", label: "GPT-5.5（OpenAI 旗艦）", group: "OpenAI" },
  { value: "gpt-5.4", label: "GPT-5.4（OpenAI 高品質）", group: "OpenAI" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini（OpenAI 平衡）", group: "OpenAI" },
  { value: "gpt-5.4-nano", label: "GPT-5.4 nano（OpenAI 最便宜）", group: "OpenAI" },
  { value: "gpt-4o", label: "GPT-4o（OpenAI 通用）", group: "OpenAI" },
] as const;

export type AiTextModel = (typeof AI_TEXT_MODELS)[number]["value"];
export type AiTextModelGroup = (typeof AI_TEXT_MODELS)[number]["group"];

export const DEFAULT_AI_TEXT_MODEL: AiTextModel = "claude-sonnet-4-6";
export const AI_TEXT_MODEL_GROUPS: AiTextModelGroup[] = Array.from(new Set(AI_TEXT_MODELS.map((m) => m.group)));
export const OPENAI_TEXT_MODELS: AiTextModel[] = AI_TEXT_MODELS
  .filter((m) => m.group === "OpenAI")
  .map((m) => m.value);
export const ALLOWED_TEXT_MODELS: AiTextModel[] = AI_TEXT_MODELS.map((m) => m.value);

export function isAiTextModel(v: unknown): v is AiTextModel {
  return typeof v === "string" && ALLOWED_TEXT_MODELS.includes(v as AiTextModel);
}

export function normalizeAiTextModel(v: unknown): AiTextModel {
  return isAiTextModel(v) ? v : DEFAULT_AI_TEXT_MODEL;
}

export function isOpenAiTextModel(model: AiTextModel): boolean {
  return OPENAI_TEXT_MODELS.includes(model);
}

export function textModelOption(model: AiTextModel): (typeof AI_TEXT_MODELS)[number] {
  return AI_TEXT_MODELS.find((m) => m.value === model) ?? AI_TEXT_MODELS[0];
}
