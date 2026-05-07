// Shared Anthropic SDK wrapper for review handlers.
// Uses prompt caching to keep system prompt warm across invocations.
// Model defaults to claude-sonnet-4-6 (cost-effective for summarisation).

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const SYSTEM_PROMPT = `You are an operations summary writer for the Lobster Factory / Agency OS platform.
You receive a JSON payload of recent runs, incidents, and errors. Produce:
1. A 2-3 sentence executive summary (high-signal, no filler).
2. A "What changed" bullet list (max 5 bullets, factual).
3. A "Recommended next action" line (concrete, ≤ 1 sentence).

Constraints:
- Output Markdown for Telegram (no headings beyond bold).
- Never invent data not present in the payload.
- If payload is empty, say so plainly.
- Output Traditional Chinese (繁體中文) for body text; keep technical identifiers (commands, status enums) in original English.`;

export interface AnthropicSummaryInput {
  title: string;
  payload: Record<string, unknown>;
}

export async function generateSummary(input: AnthropicSummaryInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return `_AI summary unavailable: ANTHROPIC_API_KEY not configured. Raw counts:_\n\`\`\`json\n${JSON.stringify(input.payload, null, 2).slice(0, 1500)}\n\`\`\``;
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `${input.title}\n\nData:\n${JSON.stringify(input.payload, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return "_AI summary returned empty response._";
  }
  return textBlock.text;
}
