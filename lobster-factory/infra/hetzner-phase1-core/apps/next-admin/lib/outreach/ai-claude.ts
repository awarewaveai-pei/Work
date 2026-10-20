// Claude API client for cold outreach message generation.
// SECURITY: API key is passed in; NEVER log it.
import { providerUrl } from "@/lib/ai/gateway";
import type { Grant } from "@/lib/entitlements/can";

export interface ClaudeResult {
  text: string;
  model: string;
}

export const DEFAULT_CLAUDE_MODEL =
  process.env.CLAUDE_OUTREACH_MODEL?.trim() || "claude-haiku-4-5-20251001";

export async function generateWithClaude(
  grant: Grant,
  apiKey: string,
  prompt: string,
  model = DEFAULT_CLAUDE_MODEL,
): Promise<ClaudeResult> {
  const resp = await fetch(providerUrl(grant, "anthropic", "/v1/messages"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`claude ${resp.status}: ${detail.slice(0, 200)}`);
  }
  const j = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>;
    model?: string;
  };
  const text = (j.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("claude: empty response");
  return { text, model: j.model ?? model };
}
