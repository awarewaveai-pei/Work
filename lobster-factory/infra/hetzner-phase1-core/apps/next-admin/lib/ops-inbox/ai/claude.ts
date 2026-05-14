import Anthropic from "@anthropic-ai/sdk";
import type { Incident } from "@/lib/ops-inbox/types";

const CLAUDE_TIMEOUT_MS = 12_000;

export async function summarizeIncidentWithClaude(incident: Incident): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("missing ANTHROPIC_API_KEY");

  const client = new Anthropic({ apiKey });

  const userMessage = [
    `Source: ${incident.source}`,
    `Severity: ${incident.severity}`,
    `Service: ${incident.service ?? "(host-level)"}`,
    `Environment: ${incident.environment}`,
    `Title: ${incident.title}`,
    incident.message ? `Message: ${incident.message}` : "",
    `Occurrences: ${incident.occurrence_count}`,
    `Raw: ${JSON.stringify(incident.raw).slice(0, 4000)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system:
          "You are an SRE assistant. Summarize the incident in Traditional Chinese in 1-2 concise sentences: probable root cause + first remediation action. Be direct, no markdown.",
        messages: [{ role: "user", content: userMessage }],
      },
      { signal: controller.signal },
    );

    const block = response.content[0];
    if (block.type !== "text") throw new Error("unexpected response type");
    return block.text.trim() || "Claude 未回傳內容";
  } finally {
    clearTimeout(timer);
  }
}
