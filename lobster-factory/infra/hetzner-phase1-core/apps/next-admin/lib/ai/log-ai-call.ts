/**
 * Best-effort text-LLM usage logger. Writes one row to ai_call_logs (migration 0043) with the EXACT
 * token counts from the model response + the USD cost computed by cost-calculator.
 *
 * Contract: NEVER throws, NEVER rejects, NEVER blocks the caller's result. Every LLM route already
 * returns its answer to the user; logging is pure observability bolted on after. A logging failure
 * (Supabase down, table missing) must be invisible to the feature — hence the swallow-everything
 * try/catch and the null-client early return.
 *
 * Charging (ADR 017 4b-11): every row names the grant its call ran under (required, so a call site cannot skip it); the
 * row is billed to that grant's account and the delivered call's cost is charged through grant.report (creditsForCost;
 * only a credits grant in enforce debits). The row id is the idempotency key, so the call is charged once.
 *
 * Usage (non-streaming): after `const msg = await client.messages.create(...)`, call
 *   void logAiCall({ route: "/api/content/outline", response: msg, grant });
 * The Anthropic SDK response carries `.usage` (input_tokens, output_tokens, cache_*); we read it.
 */
import { randomUUID } from "node:crypto";
import { getSupabaseWriteClient } from "../supabase-server";
import { textCallCostUsd, resolveTextRate, imageCostUsd } from "./cost-calculator";
import { IMAGE_RATES, DEFAULT_IMAGE_MODEL } from "./cost-model";
import type { Grant, Hold } from "../entitlements/can";
import { creditsForCost } from "../entitlements/ledger";

// ai_call_logs.job_id is a uuid (0046): any other value would make Postgres refuse the whole row, losing the cost.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const jobColumns = (jobId: string | null | undefined) =>
  jobId && !UUID_RE.test(jobId) ? { job_id: null, rawJobId: jobId } : { job_id: jobId ?? null, rawJobId: null };
/** The organization a grant bills (null when it could not be resolved): a library call logs its cost there. Like the
 *  logger itself it never throws -- reading the account must not break the call being logged. */
export const billedOrgId = (grant: Grant): string | null => {
  const s = (grant as Partial<Grant> | undefined)?.subject;
  return s && s.kind !== "unresolved" ? s.orgId : null;
};

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
  grant: Grant;
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
  grant: Grant;
  actorRole?: string | null;
  metadata?: Record<string, unknown>;
  jobId?: string | null;
  tool?: string | null;
}

/** Gemini's `response.usageMetadata` (subset). Thinking tokens bill as output; cached prompt tokens bill at the cache
 *  rate, so they leave the plain input count. */
export interface GeminiUsageLike {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
}
export function geminiUsageTokens(u: GeminiUsageLike | undefined): Pick<LogAiCallArgs, "inputTokens" | "outputTokens" | "cacheReadTokens"> {
  const cached = u?.cachedContentTokenCount ?? 0;
  return {
    inputTokens: Math.max(0, (u?.promptTokenCount ?? 0) - cached),
    outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    cacheReadTokens: cached,
  };
}

/** OpenAI's `usage` (Chat Completions / Embeddings). Cached prompt tokens are inside prompt_tokens and bill at the
 *  cache rate, so they leave the plain input count. */
export interface OpenAiUsageLike {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}
export function openaiUsageTokens(u: OpenAiUsageLike | null | undefined): Pick<LogAiCallArgs, "inputTokens" | "outputTokens" | "cacheReadTokens"> {
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
  return { inputTokens: Math.max(0, (u?.prompt_tokens ?? 0) - cached), outputTokens: u?.completion_tokens ?? 0, cacheReadTokens: cached };
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

    const id = randomUUID();
    const charge = await chargeCall(args.grant, costUsd, id, route);
    const job = jobColumns(jobId);
    const { error } = await supabase.from("ai_call_logs").insert({
      id,
      organization_id: billedOrgId(args.grant),
      route,
      model,
      vendor: resolved.rate.vendor,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
      cost_usd: Number(costUsd.toFixed(6)),
      actor_role: actorRole ?? null,
      job_id: job.job_id,
      tool: tool ?? null,
      kind: "text",
      metadata: { ...(metadata ?? {}), ...(job.rawJobId ? { raw_job_id: job.rawJobId } : {}), ...charge,
        ...(resolved.fallback ? { rate_fallback: true, matched_rate: resolved.matchedKey } : {}) },
    });
    if (error) console.warn(`[ai-cost] ${route} not recorded: ${error.message}`);
  } catch {
    // Swallow — observability must never break the feature it observes.
  }
}

/** Charges one delivered call; never throws (a failed debit is logged and the row records it). */
async function chargeCall(grant: Grant, costUsd: number, id: string, route: string): Promise<Record<string, number | boolean>> {
  const units = creditsForCost(costUsd);
  if (units === 0) return {};
  try {
    const { charged, shortfall } = await grant.report({ units, idempotencyKey: `ai-call:${id}`, meta: { ai_call_id: id } });
    return { credits_charged: charged, ...(shortfall > 0 ? { credits_shortfall: shortfall } : {}) };
  } catch (e) {
    console.warn(`[ai-cost] ${route} charge failed: ${String(e).slice(0, 200)}`);
    return { credits_charge_failed: true };
  }
}

/** Takes a priced call's credits before it starts (Grant.hold, ADR 017 4b-12). null = do not start the call: the wallet
 *  cannot cover it, or the hold could not be written. Pass the hold to logImageCost/logImageResult, which settle it. */
export async function holdCost(grant: Grant, costUsd: number): Promise<Hold | null> {
  try {
    return await grant.hold(creditsForCost(costUsd));
  } catch (e) {
    console.warn(`[ai-cost] hold failed: ${String(e).slice(0, 200)}`);
    return null;
  }
}

/** Settles a hold with the delivered call's price (0 when nothing was delivered); never throws. */
async function settleCall(hold: Hold, units: number, route: string): Promise<Record<string, number | boolean>> {
  try {
    const { charged, shortfall } = await hold.settle(units, { ai_call_id: hold.id });
    return { credits_held: hold.units, credits_charged: charged, ...(shortfall > 0 ? { credits_shortfall: shortfall } : {}) };
  } catch (e) {
    console.error(`[ai-cost] ${route} hold ${hold.id} not settled: ${String(e).slice(0, 200)}`);
    return { credits_held: hold.units, credits_settle_failed: true };
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
  grant: Grant;
  /** false = the provider charged but the customer got nothing (logImageResult): our cost, recorded, not charged. */
  delivered?: boolean;
  /** The credits holdCost took before the call: settled here (the row id is the hold's). */
  hold?: Hold;
}

/** Best-effort per-call cost logger for image/video — one ai_call_logs row. Never throws. */
export async function logImageCost(args: LogImageCostArgs): Promise<void> {
  try {
    const supabase = getSupabaseWriteClient();
    if (!supabase) return;
    const id = args.hold?.id ?? randomUUID();
    const delivered = args.delivered !== false;
    const charge = args.hold ? await settleCall(args.hold, delivered ? creditsForCost(args.costUsd) : 0, args.route)
      : delivered ? await chargeCall(args.grant, args.costUsd, id, args.route) : {};
    const job = jobColumns(args.jobId);
    const { error } = await supabase.from("ai_call_logs").insert({
      id,
      organization_id: billedOrgId(args.grant),
      route: args.route,
      model: args.model,
      vendor: args.vendor,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost_usd: Number(args.costUsd.toFixed(6)),
      actor_role: null,
      job_id: job.job_id,
      tool: args.tool ?? null,
      kind: args.kind ?? "image",
      metadata: { ...(job.rawJobId ? { raw_job_id: job.rawJobId } : {}), ...charge },
    });
    if (error) console.warn(`[ai-cost] ${args.route} image cost not recorded: ${error.message}`);
  } catch { /* never break the caller */ }
}

/** A held call that never reached the provider's bill (refused, failed before work): the whole hold goes back. */
export function releaseHold(hold: Hold | null | undefined, route: string): void {
  if (hold) void settleCall(hold, 0, route);
}

/** One lib/tarot/image-gen.ts result. Logged when the provider charged: on success, and on a failure after the provider
 *  finished (`billed`, e.g. the download of a finished image failed). Vendor and price come from IMAGE_RATES. */
export function logImageResult(result: { ok: boolean; billed?: boolean; costUsd?: number }, args: { route: string; model: string; jobId?: string | null; tool?: string | null; grant: Grant; hold?: Hold }): void {
  if (!result.ok && !result.billed) return releaseHold(args.hold, args.route);
  const rate = IMAGE_RATES[args.model] ?? IMAGE_RATES[DEFAULT_IMAGE_MODEL];
  // A provider that reports usage (OpenAI images bill by token) gives the exact cost; others use the per-image price.
  void logImageCost({ ...args, vendor: rate.vendor, costUsd: result.costUsd ?? imageCostUsd(args.model), delivered: result.ok });
}
