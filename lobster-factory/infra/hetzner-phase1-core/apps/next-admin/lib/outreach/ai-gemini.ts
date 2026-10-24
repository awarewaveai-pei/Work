// Gemini REST client (free-tier compatible) — the ai_generation step of the Free-Plan Router.
// SECURITY: the API key goes in the query string per Google's API; NEVER log the url or the key.
// Errors surface the HTTP status + response body (which does not contain the key).
import { providerUrl } from "@/lib/ai/gateway";
import type { Grant } from "@/lib/entitlements/can";
import { billedOrgId, geminiUsageTokens, logAiCall, type GeminiUsageLike } from "@/lib/ai/log-ai-call";

export interface GeminiResult {
  text: string;
  model: string;
}

// Default model is resilient to deprecation: gemini-2.0-flash was retired by some projects, which
// silently broke generation. gemini-flash-latest auto-tracks the current flash GA model; override
// per-deploy with GEMINI_MODEL if a pinned version is ever needed.
export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

export async function generateWithGemini(
  grant: Grant,
  apiKey: string,
  prompt: string,
  model = DEFAULT_GEMINI_MODEL,
): Promise<GeminiResult> {
  const url = providerUrl(grant, "gemini", `/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // gemini-2.5/flash-latest are thinking models — reasoning consumes maxOutputTokens and truncates
      // the actual answer. Disable thinking (cold-email copy needs none) + give the output room.
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`gemini ${resp.status}: ${detail.slice(0, 200)}`);
  }
  const j: unknown = await resp.json();
  void logAiCall({ route: "outreach/generate", model, ...geminiUsageTokens((j as { usageMetadata?: GeminiUsageLike }).usageMetadata),
    organizationId: billedOrgId(grant), tool: "outreach" });
  const parts = (j as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts;
  const text = (parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("gemini: empty response");
  return { text, model };
}
