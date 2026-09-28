/**
 * Per-model request settings for every Anthropic call — the one place that knows which models always
 * think, which take `effort`, and which take the safety-classifier fallback opt-in.
 *
 * Traps:
 * - claude-opus-5-5 (and the other 5-generation models) always think; thinking counts toward max_tokens,
 *   so a limit sized for the answer alone truncates it. `claudeParams` adds headroom for those models.
 * - Their responses start with a `thinking` block: read text with `claudeText`, never `content[0]`.
 * - `betas` / `fallbacks` exist only on `client.beta.messages.*`; spread `claudeParams` there.
 * - Haiku 4.5 rejects `output_config.effort` with a 400.
 */

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export const CLAUDE_DEFAULT_MODEL = "claude-opus-5-5";

/** Added to the answer budget on models that always think (thinking counts toward max_tokens). */
export const THINKING_HEADROOM_TOKENS = 8000;

const ALWAYS_THINKS = /^claude-(opus-5|sonnet-5|fable-5|mythos-5)/;
const NO_EFFORT = /^claude-haiku-/;
/** A classifier decline is re-run by the API on the model it picks; the response `model` names who answered. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** model + max_tokens (with thinking headroom) + effort. Valid on `client.messages.*` and `client.beta.messages.*`. */
export function claudeParams(model: string, answerTokens: number, effort: ClaudeEffort = "medium") {
  return {
    model,
    max_tokens: ALWAYS_THINKS.test(model) ? answerTokens + THINKING_HEADROOM_TOKENS : answerTokens,
    ...(NO_EFFORT.test(model) ? {} : { output_config: { effort } }),
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
