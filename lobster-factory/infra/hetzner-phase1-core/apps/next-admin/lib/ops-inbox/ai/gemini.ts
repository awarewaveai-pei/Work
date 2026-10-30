import { loadGoogleGenerativeAI } from "@/lib/ai/gateway";
import { GEMINI_LITE_MODEL } from "@/lib/ai/gemini-models";
import { geminiUsageTokens, logAiCall } from "@/lib/ai/log-ai-call";
import { grantFor } from "@/lib/entitlements/grant";
import type { Incident } from "@/lib/ops-inbox/types";

const GEMINI_TIMEOUT_MS = 12_000;

export async function summarizeIncidentWithGemini(incident: Incident, evidenceText?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("missing GEMINI_API_KEY");

  const grant = await grantFor("ops.inbox-ai");
  const GoogleGenerativeAI = await loadGoogleGenerativeAI(grant);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_LITE_MODEL });
  const prompt = [
    evidenceText
      ? "You are an SRE diagnostician. Using the incident AND the collected evidence, respond in Traditional Chinese with exactly three lines:\n根因假說: <most likely cause, cite evidence>\n立即動作: <one concrete first action>\n驗證方式: <how to confirm the fix worked>\nBe direct, no markdown."
      : "You are an SRE assistant. Summarize this incident in Traditional Chinese.\nRespond in 1-2 concise sentences with probable root cause + first action.",
    "",
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

  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`gemini_timeout_${ms}ms`)), ms),
    );
    return Promise.race([promise, timeout]);
  };

  const result = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS);
  void logAiCall({ route: "ops-inbox/classify", model: GEMINI_LITE_MODEL, ...geminiUsageTokens(result.response.usageMetadata),
    grant, tool: "ops-inbox" });
  const text = result.response.text().trim();
  return text || "Gemini 未回傳內容";
}
