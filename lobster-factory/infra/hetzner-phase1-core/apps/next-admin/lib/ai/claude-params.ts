/**
 * Pure per-model request settings, shared with the model-picker UI. Provider loading lives in gateway.ts.
 * The one place that knows which models always
 * think, which take `effort`, and which take the safety-classifier fallback opt-in.
 *
 * Traps:
 * - claude-opus-5-5 (and the other 5-generation models) always think; thinking counts toward max_tokens,
 *   so a limit sized for the answer alone truncates it. `claudeParams` adds headroom for those models.
 * - Their responses start with a `thinking` block: read text with `claudeText`, never `content[0]`.
 * - `betas` / `fallbacks` exist only on `client.beta.messages.*`; spread `claudeParams` there.
 * - Haiku 4.5 rejects `output_config.effort` with a 400. Haiku 5.5 accepts it, but thinks by default
 *   (adaptive, effort medium): pass `{ thinking: "off" }` for short structured tasks. `{ type: "disabled" }`
 *   is a 400 on the always-think models, so it is only emitted for Haiku 5.x.
 * - Haiku 5.5 also 400s on `budget_tokens`, non-default temperature/top_p/top_k, and an assistant prefill;
 *   `claudeParams` emits none of them, and call sites spread it, so they must not add them either.
 */

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export const CLAUDE_DEFAULT_MODEL = "claude-opus-5-5";
/** Cheap short structured tasks (titles, keywords, JSON extraction, classification). */
export const CLAUDE_FAST_MODEL = "claude-haiku-5-5";

/** Added to the answer budget on models that always think (thinking counts toward max_tokens). */
export const THINKING_HEADROOM_TOKENS = 8000;

const ALWAYS_THINKS = /^claude-(opus-5|sonnet-5|fable-5|mythos-5)/;
const NO_EFFORT = /^claude-haiku-4/;
/** Thinking is on by default but may be turned off (accepted at effort high or below). */
const THINKING_CAN_BE_OFF = /^claude-haiku-5/;
/** A classifier decline is re-run by the API on the model it picks; the response `model` names who answered. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * model + max_tokens (with thinking headroom) + effort (+ `thinking: disabled` when asked and the model allows it).
 * Valid on `client.messages.*` and `client.beta.messages.*`.
 */
export function claudeParams(
  model: string,
  answerTokens: number,
  effort: ClaudeEffort = "medium",
  opts: { thinking?: "off" } = {},
) {
  return {
    model,
    max_tokens: ALWAYS_THINKS.test(model) ? answerTokens + THINKING_HEADROOM_TOKENS : answerTokens,
    ...(NO_EFFORT.test(model) ? {} : { output_config: { effort } }),
    ...(opts.thinking === "off" && THINKING_CAN_BE_OFF.test(model) ? { thinking: { type: "disabled" as const } } : {}),
  };
}

/** The classifier-fallback opt-in; spread it only into `client.beta.messages.*` calls. */
export function claudeFallback(model: string) {
  return FALLBACK_MODELS.has(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {};
}

type ContentBlockLike = { type: string; text?: string };

/** The answer text: every text block joined (thinking blocks are skipped). */
export function claudeText(msg: { content: ContentBlockLike[] }): string {
  return msg.content.map((b) => (b.type === "text" && typeof b.text === "string" ? b.text : "")).join("");
}

/** Why a finished response is not a whole answer, or null when it is. */
export function claudeIncomplete(msg: { stop_reason?: string | null }): string | null {
  if (msg.stop_reason === "refusal") return "model_refused";
  if (msg.stop_reason === "max_tokens") return "output_truncated";
  return null;
}
