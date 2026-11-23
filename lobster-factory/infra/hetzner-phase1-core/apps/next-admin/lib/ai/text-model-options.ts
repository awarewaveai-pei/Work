import type { ReactNode } from "react";
import { CLAUDE_DEFAULT_MODEL, CLAUDE_FAST_MODEL } from "./claude-params";
import { TEXT_RATES } from "./cost-model";

// Ordered cheap → expensive within each group (price = lib/ai/cost-model.ts TEXT_RATES).
// Only status "active" ids (lib/ai/__tests__/model-registry.test.ts); a retired pick is remapped below.
// Labels carry no parenthetical descriptor — pricing is shown separately in the picker UI.
export const AI_TEXT_MODELS = [
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5", group: "Claude" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", group: "Claude" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5", group: "Claude" },
  { value: "claude-fable-5-1", label: "Claude Fable 5.1", group: "Claude" },
  { value: "gpt-6-luna", label: "GPT-6 luna", group: "OpenAI" },
  { value: "gpt-5.4-nano", label: "GPT-5.4 nano", group: "OpenAI" },
  { value: "gpt-5.4-mini", label: "GPT-5.4 mini", group: "OpenAI" },
  { value: "gpt-6.1-terra", label: "GPT-6.1 terra", group: "OpenAI" },
  { value: "gpt-6.2-sol", label: "GPT-6.2 sol", group: "OpenAI" },
  { value: "gpt-5.4", label: "GPT-5.4", group: "OpenAI" },
  { value: "gpt-5.5", label: "GPT-5.5", group: "OpenAI" },
  { value: "gpt-6.2-astra", label: "GPT-6.2 astra", group: "OpenAI" },
] as const;

export type AiTextModel = (typeof AI_TEXT_MODELS)[number]["value"];
export type AiTextModelGroup = (typeof AI_TEXT_MODELS)[number]["group"];

export const DEFAULT_AI_TEXT_MODEL: AiTextModel = CLAUDE_DEFAULT_MODEL;

/** Each text feature's default, declared once: `model` when the caller picked none, `claude` = the model it ran before (an
 *  install with no OpenAI key, and the retry when an OpenAI answer comes back empty or cut off). Sources: articles
 *  agency-os/reports/model-bakeoff/2026-11-article/ (K15); the other four 2026-11-copy/ (K16, operator 2026-11-23). */
export const TEXT_FEATURE_DEFAULTS = {
  article: { model: "gpt-6.2-sol", claude: DEFAULT_AI_TEXT_MODEL },
  videoScript: { model: "gpt-6.2-sol", claude: CLAUDE_DEFAULT_MODEL },
  socialRewrite: { model: "gpt-6.2-sol", claude: CLAUDE_FAST_MODEL },
  humanize: { model: "gpt-6.2-sol", claude: CLAUDE_DEFAULT_MODEL },
  outreach: { model: "gpt-6.2-sol", claude: CLAUDE_FAST_MODEL },
} as const satisfies Record<string, { model: AiTextModel; claude: AiTextModel }>;
export type TextFeature = keyof typeof TEXT_FEATURE_DEFAULTS;
export const DEFAULT_ARTICLE_TEXT_MODEL: AiTextModel = TEXT_FEATURE_DEFAULTS.article.model;

/** The model a feature runs on: a picked/saved model as-is (a retired id -> its successor); none (or a dead id) -> the
 *  feature default; that default is an OpenAI model and there is no OpenAI key (buyout install) -> the feature's Claude model. */
export function resolveFeatureTextModel(feature: TextFeature, picked: unknown, hasOpenAiKey: boolean): AiTextModel {
  const d = TEXT_FEATURE_DEFAULTS[feature];
  return resolveSavedAiTextModel(picked) ?? (hasOpenAiKey || !isOpenAiTextModel(d.model) ? d.model : d.claude);
}
export function resolveArticleTextModel(picked: unknown, hasOpenAiKey: boolean): AiTextModel {
  return resolveFeatureTextModel("article", picked, hasOpenAiKey);
}

/** An OpenAI reasoning model spends its thinking inside max_completion_tokens (product copy at 1,200: all 1,200 went to
 *  reasoning, empty answer, 2026-11-copy/product-copy-retest.json). A feature's own output limit + this = its OpenAI budget. */
export const OPENAI_REASONING_HEADROOM_TOKENS = 4096;
export function openAiCompletionBudget(outputTokens: number): number {
  return outputTokens + OPENAI_REASONING_HEADROOM_TOKENS;
}
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

// ---- 訂閱通道 (PLAN 2026-11-22 §3). Subscription models are NOT API models: they live only here, never in AI_TEXT_MODELS /
// TEXT_RATES, so API-only paths (isAiTextModel, normalizeAiTextModel, price lookup, model probes) can never see a sub-* id.
export const SUB_TEXT_MODELS = {
  "sub-codex-luna": { label: "Codex 訂閱 GPT-6 luna", tool: "codex", cliModel: "gpt-6-luna" },
  "sub-codex-terra": { label: "Codex 訂閱 GPT-6.1 terra", tool: "codex", cliModel: "gpt-6.1-terra" },
  "sub-codex-sol": { label: "Codex 訂閱 GPT-6.2 sol", tool: "codex", cliModel: "gpt-6.2-sol" },
  "sub-codex-astra": { label: "Codex 訂閱 GPT-6.2 astra", tool: "codex", cliModel: "gpt-6.2-astra" },
  "sub-claude-haiku": { label: "Claude 訂閱 Haiku", tool: "claude", cliModel: "haiku" },
  "sub-claude-sonnet": { label: "Claude 訂閱 Sonnet", tool: "claude", cliModel: "sonnet" },
  "sub-claude-opus": { label: "Claude 訂閱 Opus", tool: "claude", cliModel: "opus" },
} as const satisfies Record<string, { label: string; tool: "codex" | "claude"; cliModel: string | null }>;
export type SubTextModel = keyof typeof SUB_TEXT_MODELS;
/** The model each subscription segment runs when the caller picked none (or a model of the other tool). */
export const DEFAULT_SUB_CODEX_MODEL = "sub-codex-sol" satisfies SubTextModel;
export const DEFAULT_SUB_CLAUDE_MODEL = "sub-claude-opus" satisfies SubTextModel;
/** The one id the codex segment used before the model picker (rows logged up to 2026-11-23). Never run or saved any more;
 *  only ledger reads still count it (codex-usage.ts). */
export const LEGACY_SUB_CODEX_ID = "sub-codex";
const subIdsOf = (tool: "codex" | "claude"): SubTextModel[] => (Object.keys(SUB_TEXT_MODELS) as SubTextModel[]).filter((m) => SUB_TEXT_MODELS[m].tool === tool);
/** Every id a tool's ledger rows can carry: its catalogue ids (+ the legacy codex id). */
export const SUB_CODEX_MODEL_IDS: SubTextModel[] = subIdsOf("codex");
export const SUB_CLAUDE_MODEL_IDS: SubTextModel[] = subIdsOf("claude");
export const SUB_CODEX_LEDGER_IDS: string[] = [...SUB_CODEX_MODEL_IDS, LEGACY_SUB_CODEX_ID];
export type SubTextSpec = { label: string; tool: "codex" | "claude"; cliModel: string | null };
/** A model a call may run on: an API model or a subscription model. */
export type ChannelModel = AiTextModel | SubTextModel;
export const SUB_TEXT_COST_LABEL = "NT$0（訂閱額度）";

export function isSubTextModel(v: unknown): v is SubTextModel {
  return typeof v === "string" && Object.hasOwn(SUB_TEXT_MODELS, v);
}
export function subTextSpec(model: unknown): SubTextSpec | undefined {
  return isSubTextModel(model) ? SUB_TEXT_MODELS[model] : undefined;
}

/** Channel chain, tried in order; a failed segment hands over to the next. The last segment is always an API model. */
export const TEXT_CHAINS = ["claude+codex+api", "claude+api", "codex+api", "api"] as const;
export type TextChain = (typeof TEXT_CHAINS)[number];
/** A page's chain buttons, handed in by a staff page only: a product door's page closure may not reach the subscription
 *  APIs (lib/portal/__tests__/registry-code.test.ts). Absent = no buttons, the page sends API only. */
export type ChainChoice = { chain: TextChain; claudeModel: string; codexModel: string };
export type ChainControl = (value: ChainChoice, onChange: (next: ChainChoice) => void, disabled?: boolean) => ReactNode;
export const DEFAULT_TEXT_CHAIN: TextChain = "api";

export function isTextChain(v: unknown): v is TextChain {
  return typeof v === "string" && (TEXT_CHAINS as readonly string[]).includes(v);
}

/** chain -> ordered model ids to try. claude segment = `claudeModel` (a claude sub id), codex segment = `codexModel` (a codex
 *  sub id); a missing or other-tool id -> that tool's default. api = apiModel (a sub id there -> the default API model). */
export function resolveTextChain(a: { chain: TextChain; apiModel?: unknown; claudeModel?: unknown; codexModel?: unknown }): ChannelModel[] {
  const pick = (v: unknown, tool: "codex" | "claude", dflt: SubTextModel): SubTextModel => (isSubTextModel(v) && SUB_TEXT_MODELS[v].tool === tool ? v : dflt);
  const out: ChannelModel[] = [];
  if (a.chain.startsWith("claude")) out.push(pick(a.claudeModel, "claude", DEFAULT_SUB_CLAUDE_MODEL));
  if (a.chain.includes("codex")) out.push(pick(a.codexModel, "codex", DEFAULT_SUB_CODEX_MODEL));
  out.push(normalizeAiTextModel(a.apiModel));
  return out;
}
