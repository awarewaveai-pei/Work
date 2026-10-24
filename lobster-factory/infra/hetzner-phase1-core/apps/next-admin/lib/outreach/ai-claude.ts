// Claude API client for cold outreach message generation.
// SECURITY: API key is passed in; NEVER log it.
import { CLAUDE_FAST_MODEL, claudeParams, providerUrl } from "@/lib/ai/gateway";
import type { Grant } from "@/lib/entitlements/can";
import { billedOrgId, logAiCall } from "@/lib/ai/log-ai-call";

export interface ClaudeResult {
  text: string;
  model: string;
}

export const DEFAULT_CLAUDE_MODEL =
  process.env.CLAUDE_OUTREACH_MODEL?.trim() || CLAUDE_FAST_MODEL;

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
      ...claudeParams(model, 1024, "medium", { thinking: "off" }),
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
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  void logAiCall({ route: "outreach/generate", response: { model: j.model ?? model, usage: j.usage }, organizationId: billedOrgId(grant), tool: "outreach" });
  const text = (j.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("claude: empty response");
  return { text, model: j.model ?? model };
}
