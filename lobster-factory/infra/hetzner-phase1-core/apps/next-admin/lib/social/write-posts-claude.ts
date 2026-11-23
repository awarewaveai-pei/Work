// The social writer's AI on the server: each ask is one call, logged, its cost added to `spent`. Shared by the HTTP rewrite
// (lib/content/syndicate.ts) and the scheduled topic pipeline (lib/content/topics/make.ts). The model is the socialRewrite
// default (text-model-options.ts TEXT_FEATURE_DEFAULTS); an OpenAI answer that is empty or cut off is asked again of the
// feature's Claude model, never returned. (File name kept from when this was Claude only.)
import { claudeParams, loadAnthropic } from "@/lib/ai/gateway";
import type { Grant } from "@/lib/entitlements/can";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { textCallCostUsd } from "@/lib/ai/cost-calculator";
import { openAiText, openAiUnusable } from "@/lib/ai/openai-text";
import { isOpenAiTextModel, openAiCompletionBudget, resolveFeatureTextModel, TEXT_FEATURE_DEFAULTS } from "@/lib/ai/text-model-options";

const MAX_TOKENS = 2000;

/** jobId: the uuid every call's ai_call_logs row carries (a topic's id, so its spend adds up; null = none). */
export async function claudeWriter(grant: Grant, apiKey: string, route: string, actorRole: string | null, jobId: string | null = null) {
  const model = resolveFeatureTextModel("socialRewrite", undefined, !!process.env.OPENAI_API_KEY);
  const claudeModel = TEXT_FEATURE_DEFAULTS.socialRewrite.claude;
  const spent = { usd: 0, model: "" };
  let client: InstanceType<Awaited<ReturnType<typeof loadAnthropic>>> | null = null;
  const askClaude = async (prompt: string): Promise<string> => {
    client ??= new (await loadAnthropic(grant))({ apiKey });
    const msg = await client.messages.create({
      ...claudeParams(claudeModel, MAX_TOKENS, "medium", { thinking: "off" }),
      messages: [{ role: "user", content: prompt }],
    });
    void logAiCall({ route, response: msg, actorRole, grant, jobId });
    spent.model = msg.model;
    spent.usd += textCallCostUsd({ model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, cacheReadTokens: msg.usage.cache_read_input_tokens, cacheWriteTokens: msg.usage.cache_creation_input_tokens });
    return msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
  };
  const ask = async (prompt: string): Promise<string> => {
    if (!isOpenAiTextModel(model)) return askClaude(prompt);
    const r = await openAiText({ grant, model, user: prompt, maxTokens: openAiCompletionBudget(MAX_TOKENS), route, actorRole, jobId });
    if (r.ok) {
      spent.usd += r.costUsd;
      spent.model = r.model;
      if (!openAiUnusable(r)) return r.text.trim();
    }
    // An OpenAI error, or an empty / cut-off answer (its row is logged with metadata.unusable): the Claude model answers.
    return askClaude(prompt);
  };
  return { ask, spent };
}
