import { geminiUsageTokens, logAiCall, openaiUsageTokens, type GeminiUsageLike } from "./log-ai-call";
import { GEMINI_LITE_MODEL } from "./gemini-models";
import { loadAnthropic, type Anthropic, providerUrl } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { isAiTextModel, isOpenAiTextModel, normalizeAiTextModel, type AiTextModel } from "./text-model-options";
import { claudeFallback, claudeIncomplete, claudeParams, claudeText } from "./gateway";

export const CHEAP_JSON_MODEL: AiTextModel = "gpt-5.4-nano";

interface CheapJsonTextArgs {
  route: string;
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  metadata?: Record<string, unknown>;
  tool?: string | null;
  /** The feature the call is billed to (e.g. outreach.qa); default ops.cheap-json, internal. */
  grant?: Grant;
  /** Abort after this long; default = the Anthropic SDK's own 10 min, so no call waits forever on either vendor. */
  timeoutMs?: number;
  /** OpenAI and Gemini models (a Claude model's parameters come from claudeParams). 0 for a judgment that must answer
   *  the same input the same way; unset = the vendor default. */
  temperature?: number;
}

const DEFAULT_TIMEOUT_MS = 600_000;

interface OpenAiChatCompletion {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export type CheapJsonTextResult =
  | { ok: true; raw: string; model: AiTextModel | typeof GEMINI_LITE_MODEL }
  | { ok: false; status: number; error: string };

export function extractJsonArray(raw: string): string | null {
  return raw.match(/\[[\s\S]*\]/)?.[0] ?? null;
}

export async function generateCheapJsonText(args: CheapJsonTextArgs): Promise<CheapJsonTextResult> {
  // Gemini is not a picker model (AI_TEXT_MODELS); the one id cost-model.ts prices is accepted here by name.
  if (args.model === GEMINI_LITE_MODEL) return generateGeminiJsonText(args);
  const model = normalizeAiTextModel(args.model ?? CHEAP_JSON_MODEL);
  if (!isOpenAiTextModel(model)) return generateAnthropicJsonText({ ...args, model });
  return generateOpenAiJsonText({ ...args, model });
}

async function generateOpenAiJsonText(args: CheapJsonTextArgs & { model: AiTextModel }): Promise<CheapJsonTextResult> {
  const grant = args.grant ?? (await grantFor("ops.cheap-json"));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "OPENAI_API_KEY not configured" };

  try {
    const res = await fetch(providerUrl(grant, "openai", "/v1/chat/completions"), {
      method: "POST",
      signal: AbortSignal.timeout(args.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        max_completion_tokens: args.maxTokens,
        ...(args.temperature === undefined ? {} : { temperature: args.temperature }),
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
    });

    if (!res.ok) return { ok: false, status: 502, error: `openai_${res.status}` };

    const json = (await res.json()) as OpenAiChatCompletion;
    const raw = json.choices?.[0]?.message?.content ?? "";

    void logAiCall({
      route: args.route,
      model: json.model ?? args.model,
      ...openaiUsageTokens(json.usage),
      grant,
      metadata: args.metadata,
      tool: args.tool,
    });

    return { ok: true, raw, model: args.model };
  } catch (err) {
    return { ok: false, status: 502, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The platform's free-tier Gemini key (operator 2026-11-05: the OpenAI account ran out of credits). JSON mode; the lite
 *  model refuses thinkingBudget 0, so no thinkingConfig. The key goes in the query string; never log the url. */
async function generateGeminiJsonText(args: CheapJsonTextArgs): Promise<CheapJsonTextResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "GEMINI_API_KEY not configured" };
  try {
    const grant = args.grant ?? (await grantFor("ops.cheap-json"));
    const res = await fetch(providerUrl(grant, "gemini", `/v1beta/models/${GEMINI_LITE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`), {
      method: "POST",
      signal: AbortSignal.timeout(args.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: "user", parts: [{ text: args.user }] }],
        generationConfig: { maxOutputTokens: args.maxTokens, responseMimeType: "application/json",
          ...(args.temperature === undefined ? {} : { temperature: args.temperature }) },
      }),
    });
    if (!res.ok) return { ok: false, status: 502, error: `gemini_${res.status}` };
    const json = (await res.json()) as { usageMetadata?: GeminiUsageLike; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    void logAiCall({ route: args.route, model: GEMINI_LITE_MODEL, ...geminiUsageTokens(json.usageMetadata), grant, metadata: args.metadata, tool: args.tool });
    return { ok: true, raw, model: GEMINI_LITE_MODEL };
  } catch (err) {
    return { ok: false, status: 502, error: err instanceof Error ? err.message : String(err) };
  }
}

async function generateAnthropicJsonText(args: CheapJsonTextArgs & { model: AiTextModel }): Promise<CheapJsonTextResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "ANTHROPIC_API_KEY not configured" };

  try {
    const grant = args.grant ?? (await grantFor("ops.cheap-json"));
    const Anthropic = await loadAnthropic(grant);
    const client = new Anthropic({ apiKey, timeout: args.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    const msg = await client.beta.messages.create({
      ...claudeParams(args.model, args.maxTokens, "low"),
      ...claudeFallback(args.model),
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    });
    const raw = claudeText(msg);

    void logAiCall({
      route: args.route,
      response: msg,
      fallbackModel: args.model,
      grant,
      metadata: args.metadata,
      tool: args.tool,
    });

    const incomplete = claudeIncomplete(msg);
    if (incomplete) return { ok: false, status: 502, error: incomplete };
    // a classifier fallback may have answered: report the model that did (when it is one of ours)
    const answered = msg.model.replace(/-\d{8}$/, "");
    return { ok: true, raw, model: isAiTextModel(answered) ? answered : args.model };
  } catch (err) {
    return { ok: false, status: 502, error: err instanceof Error ? err.message : String(err) };
  }
}
