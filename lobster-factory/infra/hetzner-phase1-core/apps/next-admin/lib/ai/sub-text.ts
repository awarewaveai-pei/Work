/**
 * 訂閱通道的文字入口 (PLAN 2026-11-22 §3). runSubText = one subscription segment (queued on the worker bridge, usd 0
 * ledger row on success, nothing on failure: I6); runTextChain = try a resolved chain in order, the API segment last.
 * Callers keep their own API transport: runTextChain hands them the API model to run, it never calls a provider.
 */
import type { Grant } from "@/lib/entitlements/can";
import { codexAllowed, runSubJob, SUB_TEXT_USAGE_KEYS, type SubLane, type SubTextUsage } from "@/lib/tarot/codex-bridge";
import { logAiCall } from "./log-ai-call";
import { isSubTextModel, SUB_TEXT_MODELS, subTextSpec, type AiTextModel, type ChannelModel, type SubTextModel } from "./text-model-options";

export type SubTextResult =
  | { ok: true; text: string; answeredModel?: string; usage?: SubTextUsage }
  | { ok: false; error: string };

/** Why a segment was skipped, said to the operator (one line per segment, e.g. 「Claude 訂閱 Haiku：筆電離線」). */
const SUB_ERROR_TEXT: Record<string, string> = {
  sub_operator_only: "只有擁有者本人能用訂閱",
  sub_worker_offline: "筆電離線",
  sub_worker_busy: "筆電忙碌中，排不到",
  sub_worker_timeout: "等太久沒有回覆",
  sub_quota_exhausted: "額度用完",
  sub_not_logged_in: "沒有登入",
  sub_exec_failed: "執行失敗",
  sub_empty_output: "沒有寫出內容",
  sub_output_blocked: "輸出含敏感字串，已丟棄",
  sub_unknown_model: "不是訂閱模型",
  /** A detached article job that threw (app/api/content/generate): the poll's error sentence. */
  article_failed: "文章產生失敗，沒有寫出內容，請再試一次",
};
export function subErrorText(error: string, lane: SubLane = "owner"): string {
  if (error === "sub_worker_offline" && lane === "schedule") return "主機沒有登入這一家或離線";
  return SUB_ERROR_TEXT[error] ?? "執行失敗";
}

export interface ChainSkip { model: SubTextModel; error: string }
/** A skipped segment as the page shows it: the error code plus its sentence. */
export const skipNote = (s: ChainSkip, lane: SubLane = "owner") =>
  ({ model: s.model, error: s.error, reason: `${SUB_TEXT_MODELS[s.model].label}：${subErrorText(s.error, lane)}` });

export interface RunSubTextArgs {
  grant: Grant;
  model: SubTextModel;
  system: string;
  prompt: string;
  lane: SubLane;
  signal: AbortSignal;
  /** ai_call_logs route / tool / job_id, as the API path of the same caller logs them. */
  route: string;
  tool?: string | null;
  jobId?: string | null;
}

/** One subscription segment. The owner lane serves only the operator acting herself (I1): anyone else is refused
 *  before anything is queued. */
export async function runSubText(a: RunSubTextArgs): Promise<SubTextResult> {
  const spec = subTextSpec(a.model);
  if (!spec) return { ok: false, error: "sub_unknown_model" };
  if (a.lane === "owner" && !codexAllowed(a.grant.actor)) return { ok: false, error: "sub_operator_only" };
  const out = await runSubJob({ tool: spec.tool, lane: a.lane, cliModel: spec.cliModel, system: a.system, prompt: a.prompt }, a.signal);
  if ("error" in out) return { ok: false, error: out.error };
  const usage: SubTextUsage = {};
  for (const k of SUB_TEXT_USAGE_KEYS) if (typeof out.usage?.[k] === "number") usage[k] = out.usage[k];
  void logAiCall({
    route: a.route, model: a.model, grant: a.grant, jobId: a.jobId, tool: a.tool, answeredModel: out.answeredModel,
    inputTokens: usage.input_tokens ?? usage.codex_input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? usage.codex_output_tokens ?? 0,
    cacheReadTokens: usage.codex_cached_input_tokens ?? 0,
    metadata: { ...usage },
  });
  return { ok: true, text: out.text, ...(out.answeredModel ? { answeredModel: out.answeredModel } : {}), ...(out.usage ? { usage } : {}) };
}

export type ChainOutcome<A> =
  | { via: "sub"; model: SubTextModel; text: string; answeredModel?: string; usage?: SubTextUsage; skipped: ChainSkip[] }
  | { via: "api"; model: AiTextModel; result: A; skipped: ChainSkip[] };

/** Try `models` (resolveTextChain's output) in order: a failed subscription segment is recorded and the next one
 *  tried; the first API segment is final, whatever it returns. A one-model chain = today's API call. */
export async function runTextChain<A>(
  models: readonly ChannelModel[],
  run: { runSub: (model: SubTextModel) => Promise<SubTextResult>; runApi: (model: AiTextModel) => Promise<A> },
): Promise<ChainOutcome<A>> {
  const skipped: ChainSkip[] = [];
  for (const model of models) {
    if (!isSubTextModel(model)) return { via: "api", model, result: await run.runApi(model), skipped };
    // A segment that throws is a failed segment like any other: the chain still reaches the API.
    const out: SubTextResult = await run.runSub(model).catch(() => ({ ok: false as const, error: "sub_exec_failed" }));
    if (!("error" in out)) return { via: "sub", model, text: out.text, ...(out.answeredModel ? { answeredModel: out.answeredModel } : {}), ...(out.usage ? { usage: out.usage } : {}), skipped };
    skipped.push({ model, error: (out as { error: string }).error });
  }
  throw new Error("runTextChain: the chain has no API segment"); // resolveTextChain always ends with one
}
