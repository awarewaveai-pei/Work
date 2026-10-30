import { logAiCall, openaiUsageTokens } from "./log-ai-call";
import { loadAnthropic, type Anthropic, providerUrl } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
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
}

interface OpenAiChatCompletion {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export type CheapJsonTextResult =
  | { ok: true; raw: string; model: AiTextModel }
  | { ok: false; status: number; error: string };

export function extractJsonArray(raw: string): string | null {
  return raw.match(/\[[\s\S]*\]/)?.[0] ?? null;
}

export async function generateCheapJsonText(args: CheapJsonTextArgs): Promise<CheapJsonTextResult> {
  const model = normalizeAiTextModel(args.model ?? CHEAP_JSON_MODEL);
  if (!isOpenAiTextModel(model)) return generateAnthropicJsonText({ ...args, model });
  return generateOpenAiJsonText({ ...args, model });
}

async function generateOpenAiJsonText(args: CheapJsonTextArgs & { model: AiTextModel }): Promise<CheapJsonTextResult> {
  const grant = await grantFor("ops.cheap-json");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "OPENAI_API_KEY not configured" };

  try {
    const res = await fetch(providerUrl(grant, "openai", "/v1/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        max_completion_tokens: args.maxTokens,
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

async function generateAnthropicJsonText(args: CheapJsonTextArgs & { model: AiTextModel }): Promise<CheapJsonTextResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "ANTHROPIC_API_KEY not configured" };

  try {
    const grant = await grantFor("ops.cheap-json");
    const Anthropic = await loadAnthropic(grant);
    const client = new Anthropic({ apiKey });
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
