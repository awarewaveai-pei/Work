import { logAiCall } from "./log-ai-call";

export const CHEAP_JSON_MODEL = "gpt-5.4-nano";

interface CheapJsonTextArgs {
  route: string;
  system: string;
  user: string;
  maxTokens: number;
  metadata?: Record<string, unknown>;
  tool?: string | null;
}

interface OpenAiChatCompletion {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export type CheapJsonTextResult =
  | { ok: true; raw: string }
  | { ok: false; status: number; error: string };

export function extractJsonArray(raw: string): string | null {
  return raw.match(/\[[\s\S]*\]/)?.[0] ?? null;
}

export async function generateCheapJsonText(args: CheapJsonTextArgs): Promise<CheapJsonTextResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "OPENAI_API_KEY not configured" };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CHEAP_JSON_MODEL,
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
      model: json.model ?? CHEAP_JSON_MODEL,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
      metadata: args.metadata,
      tool: args.tool,
    });

    return { ok: true, raw };
  } catch (err) {
    return { ok: false, status: 502, error: err instanceof Error ? err.message : String(err) };
  }
}
