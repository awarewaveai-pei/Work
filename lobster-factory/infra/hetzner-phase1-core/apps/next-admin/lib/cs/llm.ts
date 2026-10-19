// cs-engine LLM layer — Claude turns (with tool support) + cross-provider failover to Gemini,
// every call metered via logAiCall (best-effort, never throws). Mirrors the existing patterns in
// lib/ops-inbox/ai/{claude,gemini}.ts (AbortController timeout / withTimeout race).

import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import { loadGoogleGenerativeAI } from "@/lib/ai/gateway";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { CS_MODELS, CS_TIMEOUTS } from "@/lib/cs/config";
import { claudeParams } from "@/lib/ai/gateway";

export interface ClaudeTurnInput {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens: number;
  tools?: Anthropic.Tool[];
  timeoutMs?: number;
  route: string;
  organizationId?: string | null;
}

/** One Claude Messages turn. Returns the raw message so callers can read text OR tool_use blocks. */
export async function claudeTurn(input: ClaudeTurnInput): Promise<Anthropic.Message> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("missing ANTHROPIC_API_KEY");

  const Anthropic = await loadAnthropic();
  const client = new Anthropic({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? CS_TIMEOUTS.generateMs);
  try {
    const res = await client.messages.create(
      {
        // low effort: customer-facing turns run under CS_TIMEOUTS.generateMs
        ...claudeParams(input.model, input.maxTokens, "low"),
        system: input.system,
        messages: input.messages,
        ...(input.tools && input.tools.length ? { tools: input.tools } : {}),
      },
      { signal: controller.signal },
    );
    void logAiCall({
      route: input.route,
      response: res,
      organizationId: input.organizationId ?? null,
      tool: "cs",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Concatenated text of all text blocks in a Claude message. */
export function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** All tool_use blocks the model emitted this turn. */
export function extractToolUses(msg: Anthropic.Message): Anthropic.ToolUseBlock[] {
  return msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
  const t = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`gemini_timeout_${ms}ms`)), ms));
  return Promise.race([p, t]);
};

/** Gemini text completion — the failover path. Throws if GEMINI_API_KEY missing. */
async function geminiText(prompt: string, timeoutMs: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("missing GEMINI_API_KEY");
  const GoogleGenerativeAI = await loadGoogleGenerativeAI();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: CS_MODELS.geminiFallback });
  const result = await withTimeout(model.generateContent(prompt), timeoutMs);
  return result.response.text().trim();
}

export interface GenerateTextInput {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
  route: string;
  organizationId?: string | null;
  timeoutMs?: number;
}

export interface GenerateTextResult {
  text: string;
  provider: "claude" | "gemini";
}

/**
 * Plain text generation with automatic Claude→Gemini failover (multi-provider resilience, §8).
 * Use for no-tool generation (final replies, supervisor, classification). For agentic tool loops
 * use claudeTurn directly.
 */
export async function generateText(opts: GenerateTextInput): Promise<GenerateTextResult> {
  const timeoutMs = opts.timeoutMs ?? CS_TIMEOUTS.generateMs;
  try {
    const msg = await claudeTurn({
      model: opts.model ?? CS_MODELS.generate,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      maxTokens: opts.maxTokens ?? 1024,
      route: opts.route,
      organizationId: opts.organizationId,
      timeoutMs,
    });
    const text = extractText(msg);
    if (text) return { text, provider: "claude" };
    throw new Error("empty_claude_response");
  } catch {
    // Failover. If Gemini also fails, let it throw — orchestrator catches and routes to a human.
    const text = await geminiText(`${opts.system}\n\n${opts.user}`, timeoutMs);
    return { text, provider: "gemini" };
  }
}

/** Parse the first JSON object found in a model response. Returns null on failure. */
export function parseJsonObject<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
