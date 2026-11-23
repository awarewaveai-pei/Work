// The one non-streaming OpenAI Chat Completions call (system + user -> text), logged to ai_call_logs. cheap-json, outreach,
// video script, social rewrite and humanize all go through it. SECURITY: the key is passed in or read from env; never log it.
import { providerUrl } from "./gateway";
import type { Grant } from "@/lib/entitlements/can";
import { logAiCall, openaiUsageTokens, type OpenAiUsageLike } from "./log-ai-call";
import { textCallCostUsd } from "./cost-calculator";
import { textModelOption, type AiTextModel } from "./text-model-options";

export interface OpenAiTextArgs {
  grant: Grant;
  /** Default = the platform's OPENAI_API_KEY (an outreach customer's own key is passed in). */
  apiKey?: string;
  model: string;
  /** Omitted = a single user message (outreach's prompt carries its own instructions). */
  system?: string;
  user: string;
  /** max_completion_tokens: reasoning counts inside it (openAiCompletionBudget). */
  maxTokens: number;
  route: string;
  tool?: string | null;
  jobId?: string | null;
  actorRole?: string | null;
  metadata?: Record<string, unknown>;
  temperature?: number;
  timeoutMs?: number;
  /** The caller's abort (a closed browser request); the timeout applies as well. */
  signal?: AbortSignal;
}

export type OpenAiTextResult =
  | { ok: true; text: string; model: string; finishReason: string; usage?: OpenAiUsageLike; costUsd: number }
  | { ok: false; status: number; error: string; detail?: string };

const DEFAULT_TIMEOUT_MS = 600_000;

/** Every OpenAI-answered call is logged (tokens are billed even when the answer is unusable). Never throws. */
export async function openAiText(a: OpenAiTextArgs): Promise<OpenAiTextResult> {
  const apiKey = a.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "OPENAI_API_KEY not configured" };
  try {
    const res = await fetch(providerUrl(a.grant, "openai", "/v1/chat/completions"), {
      method: "POST",
      signal: a.signal ? AbortSignal.any([a.signal, AbortSignal.timeout(a.timeoutMs ?? DEFAULT_TIMEOUT_MS)]) : AbortSignal.timeout(a.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: a.model,
        // gpt-5+/6 family: max_completion_tokens (max_tokens is a 400); temperature only when asked (reasoning models 400 on it).
        max_completion_tokens: a.maxTokens,
        ...(a.temperature === undefined ? {} : { temperature: a.temperature }),
        messages: [...(a.system === undefined ? [] : [{ role: "system", content: a.system }]), { role: "user", content: a.user }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, status: 502, error: `openai_${res.status}`, ...(detail ? { detail: detail.slice(0, 200) } : {}) };
    }
    const j = (await res.json()) as { model?: string; usage?: OpenAiUsageLike; choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }> };
    const model = j.model ?? a.model;
    const text = j.choices?.[0]?.message?.content ?? "";
    const finishReason = j.choices?.[0]?.finish_reason ?? "";
    const unusable = openAiUnusable({ text, finishReason });
    void logAiCall({ route: a.route, model, ...openaiUsageTokens(j.usage), grant: a.grant, actorRole: a.actorRole ?? null,
      jobId: a.jobId ?? null, tool: a.tool ?? null, metadata: unusable ? { ...(a.metadata ?? {}), unusable } : a.metadata });
    return { ok: true, text, model, finishReason, usage: j.usage, costUsd: textCallCostUsd({ model, ...openaiUsageTokens(j.usage) }) };
  } catch (err) {
    return { ok: false, status: 502, error: err instanceof Error ? err.message : String(err) };
  }
}

/** An answer that is not one: nothing written, or cut off at the limit (all of it spent on reasoning, or half an answer).
 *  null = usable. Callers that replace the model never hand such an answer back as a success. */
export function openAiUnusable(r: { text: string; finishReason: string }): "openai_empty" | "openai_length" | null {
  if (r.finishReason === "length") return "openai_length";
  return r.text.trim() ? null : "openai_empty";
}

const UNUSABLE_TEXT = { openai_empty: "沒有寫出內容", openai_length: "思考用光上限，沒寫完" } as const;
/** The skip line a page shows when the OpenAI answer was dropped and the feature's Claude model answered instead. */
export function openAiFallbackNote(model: AiTextModel, error: "openai_empty" | "openai_length") {
  return { model, error, reason: `${textModelOption(model).label}：${UNUSABLE_TEXT[error]}，改用 Claude` };
}
