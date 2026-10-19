// Shared Anthropic SDK wrapper for review handlers.
// Uses prompt caching to keep system prompt warm across invocations.
// Model defaults to CLAUDE_DEFAULT_MODEL (lib/ai/gateway.ts); ANTHROPIC_MODEL overrides.
//
// Error contract: generateSummary NEVER throws — all failure modes return a
// human-readable string so callers always produce a completed command result
// rather than a command_handler_failed event. Sentry is notified for
// actionable errors (auth misconfiguration, unexpected API errors) but NOT
// for rate-limit / overload / transient conditions that resolve themselves.

import { loadAnthropic, type Anthropic } from "@/lib/ai/gateway";
import * as Sentry from "@sentry/nextjs";
import { CLAUDE_DEFAULT_MODEL, claudeFallback, claudeIncomplete, claudeParams, claudeText } from "@/lib/ai/gateway";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? CLAUDE_DEFAULT_MODEL;
const SYSTEM_PROMPT = `You are an operations summary writer for the Lobster Factory / Agency OS platform.
You receive a JSON payload of recent runs, incidents, and errors. Produce:
1. A 2-3 sentence executive summary (high-signal, no filler).
2. A "What changed" bullet list (max 5 bullets, factual).
3. A "Recommended next action" line (concrete, ≤ 1 sentence).

Constraints:
- Output Markdown for Telegram (no headings beyond bold).
- Never invent data not present in the payload.
- If payload is empty, say so plainly.
- Output Traditional Chinese (繁體中文) for body text; keep technical identifiers (commands, status enums) in original English.`;

export interface AnthropicSummaryInput {
  title: string;
  payload: Record<string, unknown>;
}

// Compact raw-data fallback appended to every degraded reply so operators
// still get the numbers even when the AI layer is unavailable.
function rawFallback(payload: Record<string, unknown>): string {
  return `\`\`\`json\n${JSON.stringify(payload, null, 2).slice(0, 1500)}\n\`\`\``;
}

export async function generateSummary(input: AnthropicSummaryInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Config omission — not a code bug; no Sentry noise.
    return `_AI summary unavailable: ANTHROPIC_API_KEY not configured._\n${rawFallback(input.payload)}`;
  }

  const Anthropic = await loadAnthropic();
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      ...claudeParams(DEFAULT_MODEL, 1024, "low"),
      ...claudeFallback(DEFAULT_MODEL),
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `${input.title}\n\nData:\n${JSON.stringify(input.payload, null, 2)}`,
        },
      ],
    });

    const incomplete = claudeIncomplete(response);
    if (incomplete) return `_AI summary unavailable (${incomplete})._\n${rawFallback(input.payload)}`;
    const text = claudeText(response);
    return text || "_AI summary returned empty response._";
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      // authentication_error / permission_error → key is wrong or missing scope.
      // Fire Sentry once (actionable: operator must fix ANTHROPIC_API_KEY).
      if (err.status === 401 || err.status === 403) {
        Sentry.captureException(err, {
          tags: { component: "command-plane", phase: "anthropic_auth" },
          extra: { status: err.status, error_type: (err as { error?: { type?: string } }).error?.type },
        });
        return `_AI summary unavailable: Anthropic auth error (${err.status}) — check ANTHROPIC\\_API\\_KEY on server._\n${rawFallback(input.payload)}`;
      }

      // rate_limit_error (429) / overloaded_error (529) → transient, self-resolving.
      // No Sentry — operator cannot act on these; they resolve automatically.
      if (err.status === 429 || err.status === 529) {
        return `_AI summary unavailable: Anthropic ${err.status === 429 ? "rate limit" : "service overloaded"} — retry in a few minutes._\n${rawFallback(input.payload)}`;
      }

      // All other Anthropic API errors (5xx, etc.) → unexpected; capture to Sentry.
      Sentry.captureException(err, {
        tags: { component: "command-plane", phase: "anthropic_api" },
        extra: { status: err.status },
      });
      return `_AI summary unavailable: Anthropic API error (${err.status})._\n${rawFallback(input.payload)}`;
    }

    // Non-API error (network timeout, DNS, etc.) — capture to Sentry.
    Sentry.captureException(err, {
      tags: { component: "command-plane", phase: "anthropic_network" },
    });
    return `_AI summary unavailable: network error contacting Anthropic._\n${rawFallback(input.payload)}`;
  }
}
