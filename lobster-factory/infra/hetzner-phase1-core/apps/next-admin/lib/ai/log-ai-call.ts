/**
 * Best-effort text-LLM usage logger. Writes one row to ai_call_logs (migration 0043) with the EXACT
 * token counts from the model response + the USD cost computed by cost-calculator.
 *
 * Contract: NEVER throws, NEVER rejects, NEVER blocks the caller's result. Every LLM route already
 * returns its answer to the user; logging is pure observability bolted on after. A logging failure
 * (Supabase down, table missing) must be invisible to the feature — hence the swallow-everything
 * try/catch and the null-client early return.
 *
 * Usage (non-streaming): after `const msg = await client.messages.create(...)`, call
 *   void logAiCall({ route: "/api/content/outline", response: msg });
 * The Anthropic SDK response carries `.usage` (input_tokens, output_tokens, cache_*); we read it.
 */
import { getSupabaseWriteClient } from "../supabase-server";
import { textCallCostUsd, resolveTextRate } from "./cost-calculator";

/** Shape of the `usage` block on an Anthropic Messages response (subset we need). */
export interface AnthropicUsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface LogAiCallArgs {
  route: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  organizationId?: string | null;
  actorRole?: string | null;
  metadata?: Record<string, unknown>;
  jobId?: string | null;
  tool?: string | null;
}

/**
 * Convenience overload for the common Anthropic path — pass the SDK response and the route; we pull
 * model + usage off it. `response.usage` and `response.model` are always present on a completed
 * (or final-streamed) Anthropic message.
 */
export interface LogAiCallFromResponse {
  route: string;
  response: { model?: string; usage?: AnthropicUsageLike | null };
  fallbackModel?: string;
  organizationId?: string | null;
  actorRole?: string | null;
  metadata?: Record<string, unknown>;
  jobId?: string | null;
  tool?: string | null;
}

function isFromResponse(a: LogAiCallArgs | LogAiCallFromResponse): a is LogAiCallFromResponse {
  return (a as LogAiCallFromResponse).response !== undefined;
}

export async function logAiCall(args: LogAiCallArgs | LogAiCallFromResponse): Promise<void> {
  try {
    let model: string;
    let inputTokens: number;
    let outputTokens: number;
    let cacheReadTokens: number;
    let cacheWriteTokens: number;
    let route: string;
    let organizationId: string | null | undefined;
    let actorRole: string | null | undefined;
    let metadata: Record<string, unknown> | undefined;
    let jobId: string | null | undefined;
    let tool: string | null | undefined;

    if (isFromResponse(args)) {
      const u = args.response.usage ?? {};
      route = args.route;
      model = args.response.model ?? args.fallbackModel ?? "unknown";
      inputTokens = u.input_tokens ?? 0;
      outputTokens = u.output_tokens ?? 0;
      cacheReadTokens = u.cache_read_input_tokens ?? 0;
      cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
      organizationId = args.organizationId;
      actorRole = args.actorRole;
      metadata = args.metadata;
      jobId = args.jobId;
      tool = args.tool;
    } else {
      route = args.route;
      model = args.model;
      inputTokens = args.inputTokens;
      outputTokens = args.outputTokens;
      cacheReadTokens = args.cacheReadTokens ?? 0;
      cacheWriteTokens = args.cacheWriteTokens ?? 0;
      organizationId = args.organizationId;
      actorRole = args.actorRole;
      metadata = args.metadata;
      jobId = args.jobId;
      tool = args.tool;
    }

    // Nothing to record (e.g. a request that failed before any tokens were spent).
    if (inputTokens === 0 && outputTokens === 0 && cacheReadTokens === 0 && cacheWriteTokens === 0) return;

    const supabase = getSupabaseWriteClient();
    if (!supabase) return; // write client not configured — silently skip, never break the feature

    const costUsd = textCallCostUsd({ model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens });
    // Resolve via the same normalizer the cost uses, so vendor + the unpriced-model flag are accurate
    // even when the API echoes a dated id. rate_fallback surfaces mispriced models instead of hiding them.
    const resolved = resolveTextRate(model);

    await supabase.from("ai_call_logs").insert({
      organization_id: organizationId ?? null,
      route,
      model,
      vendor: resolved.rate.vendor,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
      cost_usd: Number(costUsd.toFixed(6)),
      actor_role: actorRole ?? null,
      job_id: jobId ?? null,
      tool: tool ?? null,
      kind: "text",
      metadata: resolved.fallback ? { ...(metadata ?? {}), rate_fallback: true, matched_rate: resolved.matchedKey } : (metadata ?? {}),
    });
  } catch {
    // Swallow — observability must never break the feature it observes.
  }
}

export interface LogImageCostArgs {
  route: string;
  model: string;
  vendor: string;
  costUsd: number;
  jobId?: string | null;
  tool?: string | null;
  /** "video" for per-scene video motion; defaults to "image". */
  kind?: "image" | "video";
}

/** Best-effort per-call cost logger for image/video — one ai_call_logs row. Never throws. */
export async function logImageCost(args: LogImageCostArgs): Promise<void> {
  try {
    const supabase = getSupabaseWriteClient();
    if (!supabase) return;
    await supabase.from("ai_call_logs").insert({
      organization_id: null,
      route: args.route,
      model: args.model,
      vendor: args.vendor,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost_usd: Number(args.costUsd.toFixed(6)),
      actor_role: null,
      job_id: args.jobId ?? null,
      tool: args.tool ?? null,
      kind: args.kind ?? "image",
      metadata: {},
    });
  } catch { /* never break the caller */ }
}
