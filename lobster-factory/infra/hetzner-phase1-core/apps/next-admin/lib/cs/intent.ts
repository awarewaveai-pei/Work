// cs-engine intent classification — cheap haiku call, structured JSON, Gemini failover via
// generateText. Falls back to 'other' (low confidence ⇒ handoff) on any failure or unknown key.

import { CS_MODELS, CS_TIMEOUTS } from "@/lib/cs/config";
import { generateText, parseJsonObject } from "@/lib/cs/llm";
import { grantFor } from "@/lib/entitlements/grant";
import type { Intent, IntentClassification } from "@/lib/cs/types";

export async function classifyIntent(opts: {
  organizationId: string;
  message: string;
  intents: Intent[];
}): Promise<IntentClassification> {
  const { organizationId, message, intents } = opts;
  if (!intents.length) return { intentKey: "general", confidence: 0.5 };

  const list = intents.map((i) => `- ${i.key}: ${i.label}`).join("\n");
  const system = "你是一個客服意圖分類器。判斷顧客訊息最符合哪一個意圖。只輸出 JSON，不要解釋。";
  const user = [
    "可選意圖：",
    list,
    "- other: 以上皆非",
    "",
    `顧客訊息：「${message}」`,
    "",
    '回傳這個 JSON 結構：{"intentKey":"<上面的 key 或 other>","confidence":<0 到 1 的數字>}',
  ].join("\n");

  try {
    const { text } = await generateText({
      system,
      user,
      model: CS_MODELS.classify,
      maxTokens: 120,
      route: "/cs/classify",
      organizationId,
      grant: await grantFor("cs.intent", { orgId: organizationId }),
      timeoutMs: CS_TIMEOUTS.classifyMs,
    });
    const parsed = parseJsonObject<{ intentKey?: string; confidence?: number }>(text);
    if (!parsed?.intentKey) return { intentKey: "other", confidence: 0.3 };
    const key = intents.some((i) => i.key === parsed.intentKey) ? parsed.intentKey : "other";
    const confidence =
      typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    return { intentKey: key, confidence };
  } catch {
    return { intentKey: "other", confidence: 0 };
  }
}
