import { CLAUDE_FAST_MODEL, claudeParams, loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
import type { Incident } from "@/lib/ops-inbox/types";

const CLAUDE_TIMEOUT_MS = 12_000;

export async function summarizeIncidentWithClaude(incident: Incident, evidenceText?: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("missing ANTHROPIC_API_KEY");

  const Anthropic = await loadAnthropic(await grantFor("ops.inbox-ai"));
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
    evidenceText ? `\n=== 系統自動蒐證 ===\n${evidenceText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        ...claudeParams(CLAUDE_FAST_MODEL, evidenceText ? 400 : 200, "medium", { thinking: "off" }),
        system: evidenceText
          ? "You are an SRE diagnostician. Using the incident AND the collected evidence (correlated alerts, fingerprint history, recent deploys, past repairs, live host state), respond in Traditional Chinese with exactly three lines:\n根因假說: <most likely cause, cite evidence>\n立即動作: <one concrete first action>\n驗證方式: <how to confirm the fix worked>\nBe direct, no markdown."
          : "You are an SRE assistant. Summarize the incident in Traditional Chinese in 1-2 concise sentences: probable root cause + first remediation action. Be direct, no markdown.",
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
