// Gemini REST client (free-tier compatible) — the ai_generation step of the Free-Plan Router.
// SECURITY: the API key goes in the query string per Google's API; NEVER log the url or the key.
// Errors surface the HTTP status + response body (which does not contain the key).
import { providerUrl } from "@/lib/ai/gateway";
import { OUTREACH_MAX_TOKENS, OUTREACH_AI_TIMEOUT_MS } from "./generation-schema";
import type { Grant } from "@/lib/entitlements/can";
import { geminiUsageTokens, logAiCall, type GeminiUsageLike } from "@/lib/ai/log-ai-call";
import { GEMINI_LITE_MODEL } from "@/lib/ai/gemini-models";

export interface GeminiResult {
  text: string;
  model: string;
}

// Default model is resilient to deprecation: gemini-2.0-flash was retired by some projects, which
// silently broke generation. gemini-flash-latest auto-tracks the current flash GA model; override
// per-deploy with GEMINI_MODEL if a pinned version is ever needed.
/** The model of outreach's JSON steps: research extraction, the fact check, reply classification. The platform's free
 *  Gemini key (operator 2026-11-05: the OpenAI account ran out of credits; a paid key is not wanted). */
export const OUTREACH_JSON_MODEL = GEMINI_LITE_MODEL;

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

/** Google answers 503 "model overloaded" / 429 for one model while others serve (2026-11-03: flash-latest 503 for over
 *  an hour, the lite model fine): those two go once to GEMINI_LITE_MODEL. A timeout does not (it would double the wait
 *  inside the pipeline tick); the tick retries the lead. */
const OVERLOADED = new Set([429, 503]);

export async function generateWithGemini(
  grant: Grant,
  apiKey: string,
  prompt: string,
  model = DEFAULT_GEMINI_MODEL,
): Promise<GeminiResult> {
  try {
    return await callGemini(grant, apiKey, prompt, model);
  } catch (e) {
    if (!(e instanceof GeminiHttpError) || !OVERLOADED.has(e.status) || model === GEMINI_LITE_MODEL) throw e;
    return callGemini(grant, apiKey, prompt, GEMINI_LITE_MODEL);
  }
}

class GeminiHttpError extends Error {
  constructor(readonly status: number, detail: string) { super(`gemini ${status}: ${detail.slice(0, 200)}`); }
}

async function callGemini(grant: Grant, apiKey: string, prompt: string, model: string): Promise<GeminiResult> {
  const url = providerUrl(grant, "gemini", `/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`);
  const resp = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(OUTREACH_AI_TIMEOUT_MS),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      // gemini-2.5/flash-latest are thinking models — reasoning consumes maxOutputTokens and truncates
      // the actual answer. Disable thinking (cold-email copy needs none) + give the output room. The lite model
      // refuses thinkingBudget 0 with 400 INVALID_ARGUMENT (live 2026-11-03), so it gets no thinkingConfig.
      generationConfig: { temperature: 0.7, maxOutputTokens: OUTREACH_MAX_TOKENS,
        ...(model === GEMINI_LITE_MODEL ? {} : { thinkingConfig: { thinkingBudget: 0 } }) },
    }),
  });
  if (!resp.ok) {
    throw new GeminiHttpError(resp.status, await resp.text().catch(() => ""));
  }
  const j: unknown = await resp.json();
  void logAiCall({ route: "outreach/generate", model, ...geminiUsageTokens((j as { usageMetadata?: GeminiUsageLike }).usageMetadata),
    grant, tool: "outreach" });
  const parts = (j as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts;
  const text = (parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("gemini: empty response");
  return { text, model };
}
