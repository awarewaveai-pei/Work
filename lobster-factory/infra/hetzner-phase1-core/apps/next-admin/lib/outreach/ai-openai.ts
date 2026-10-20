// OpenAI API client for cold outreach message generation.
// SECURITY: API key is passed in; NEVER log it.
import { providerUrl } from "@/lib/ai/gateway";
import type { Grant } from "@/lib/entitlements/can";

export interface OpenAIResult {
  text: string;
  model: string;
}

export const DEFAULT_OPENAI_MODEL =
  process.env.OPENAI_OUTREACH_MODEL?.trim() || "gpt-4o-mini";

export async function generateWithOpenAI(
  grant: Grant,
  apiKey: string,
  prompt: string,
  model = DEFAULT_OPENAI_MODEL,
): Promise<OpenAIResult> {
  const resp = await fetch(providerUrl(grant, "openai", "/v1/chat/completions"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`openai ${resp.status}: ${detail.slice(0, 200)}`);
  }
  const j = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const text = j.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("openai: empty response");
  return { text, model: j.model ?? model };
}
