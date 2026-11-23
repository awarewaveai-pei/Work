// OpenAI for cold outreach message generation (the shared call: lib/ai/openai-text.ts).
// SECURITY: API key is passed in; NEVER log it.
import { OUTREACH_MAX_TOKENS, OUTREACH_AI_TIMEOUT_MS } from "./generation-schema";
import type { Grant } from "@/lib/entitlements/can";
import { openAiText, openAiUnusable } from "@/lib/ai/openai-text";
import { openAiCompletionBudget, TEXT_FEATURE_DEFAULTS } from "@/lib/ai/text-model-options";

export interface OpenAIResult {
  text: string;
  model: string;
}

/** The host may pin another model with OPENAI_OUTREACH_MODEL; unset = the feature default (text-model-options.ts). */
export const DEFAULT_OPENAI_MODEL =
  process.env.OPENAI_OUTREACH_MODEL?.trim() || TEXT_FEATURE_DEFAULTS.outreach.model;

/** Throws on any failure, an empty answer or one cut off at the limit included: generate.ts then hands the lead to the
 *  next provider rung instead of parsing half an email. */
export async function generateWithOpenAI(
  grant: Grant,
  apiKey: string,
  prompt: string,
  model = DEFAULT_OPENAI_MODEL,
): Promise<OpenAIResult> {
  const r = await openAiText({ grant, apiKey, model, user: prompt, maxTokens: openAiCompletionBudget(OUTREACH_MAX_TOKENS),
    route: "outreach/generate", tool: "outreach", timeoutMs: OUTREACH_AI_TIMEOUT_MS });
  if ("error" in r) throw new Error(`openai ${r.error.replace(/^openai_/, "")}${r.detail ? `: ${r.detail}` : ""}`);
  const unusable = openAiUnusable(r);
  if (unusable) throw new Error(`openai: ${unusable === "openai_length" ? "cut off at the length limit" : "empty response"}`);
  return { text: r.text.trim(), model: r.model };
}
