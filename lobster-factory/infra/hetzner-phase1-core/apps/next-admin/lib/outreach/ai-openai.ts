// OpenAI for cold outreach message generation (the shared call: lib/ai/openai-text.ts).
// SECURITY: API key is passed in; NEVER log it.
import { OUTREACH_MAX_TOKENS, OUTREACH_AI_TIMEOUT_MS } from "./generation-schema";
import type { Grant } from "@/lib/entitlements/can";
import { askOpenAiText, type OpenAiMissReason } from "@/lib/ai/openai-text";
import { openAiCompletionBudget, TEXT_FEATURE_DEFAULTS } from "@/lib/ai/text-model-options";

export interface OpenAIResult {
  text: string;
  model: string;
}

/** The host may pin another model with OPENAI_OUTREACH_MODEL; unset = the feature default (text-model-options.ts). */
export const DEFAULT_OPENAI_MODEL =
  process.env.OPENAI_OUTREACH_MODEL?.trim() || TEXT_FEATURE_DEFAULTS.outreach.model;

/** Throws on any miss (askOpenAiText: an error, or an answer not ended by "stop" with text): generate.ts then hands the
 *  lead to the next provider rung instead of parsing half an email. */
export async function generateWithOpenAI(
  grant: Grant,
  apiKey: string,
  prompt: string,
  model = DEFAULT_OPENAI_MODEL,
): Promise<OpenAIResult> {
  const r = await askOpenAiText({ grant, apiKey, model, user: prompt, maxTokens: openAiCompletionBudget(OUTREACH_MAX_TOKENS),
    route: "outreach/generate", tool: "outreach", timeoutMs: OUTREACH_AI_TIMEOUT_MS });
  if (r.ok !== true) {
    const miss = r as { reason: OpenAiMissReason; detail?: string };
    throw new Error(`openai: ${miss.reason === "openai_length" ? "cut off at the length limit" : miss.reason}${miss.detail ? ` (${miss.detail.slice(0, 160)})` : ""}`);
  }
  return { text: r.text, model: r.model };
}
