// The social writer's AI on the server: each ask is one Claude Haiku call, logged, its cost added to `spent`. Shared by
// the HTTP rewrite (lib/content/syndicate.ts) and the scheduled topic pipeline (lib/content/topics/make.ts).
import { CLAUDE_FAST_MODEL, claudeParams, loadAnthropic } from "@/lib/ai/gateway";
import type { Grant } from "@/lib/entitlements/can";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { textCallCostUsd } from "@/lib/ai/cost-calculator";

export async function claudeWriter(grant: Grant, apiKey: string, route: string, actorRole: string | null) {
  const Anthropic = await loadAnthropic(grant);
  const client = new Anthropic({ apiKey });
  const spent = { usd: 0, model: "" };
  const ask = async (prompt: string): Promise<string> => {
    const msg = await client.messages.create({
      ...claudeParams(CLAUDE_FAST_MODEL, 2000, "medium", { thinking: "off" }),
      messages: [{ role: "user", content: prompt }],
    });
    void logAiCall({ route, response: msg, actorRole, grant });
    spent.model = msg.model;
    spent.usd += textCallCostUsd({ model: msg.model, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, cacheReadTokens: msg.usage.cache_read_input_tokens, cacheWriteTokens: msg.usage.cache_creation_input_tokens });
    return msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
  };
  return { ask, spent };
}
