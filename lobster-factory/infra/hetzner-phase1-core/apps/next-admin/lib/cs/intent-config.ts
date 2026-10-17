// Intent configuration as the ops console edits it: what a PATCH may change, and the one sentence
// that says what the engine will actually do with an intent. Pure; no I/O. The sentence follows
// decideAnswerAction (lib/cs/autonomy.ts) gate for gate, so the 客服 tab never shows a level the
// engine would not honour (2026-10-16: "L2 自動" was shown for intents that could only draft).

import { passesCanary } from "@/lib/cs/autonomy";
import type { IntentFields } from "@/lib/cs/db";
import type { IntentGraduation } from "@/lib/cs/types";

/** A running exam refreshes heartbeatAt at most this often (lib/cs/eval.ts examIntent). */
export const EXAM_HEARTBEAT_MS = 30_000;
/** A running exam whose heartbeat is older than this died (container restart) and may be restarted. */
export const EXAM_STALE_MS = 3 * 60_000;

/** True while the exam that owns this record is still alive. A time limit on the whole run would
 * expire under a long golden set and start a duplicate (Codex 2026-10-16, partialreview-1e95d4c4 F6). */
export function examInFlight(g: IntentGraduation | null, now: number = Date.now()): boolean {
  return g?.status === "running" && now - Date.parse(g.heartbeatAt ?? g.startedAt) < EXAM_STALE_MS;
}

export const ANSWER_LEVELS = ["L0", "L1", "L2"] as const;
export const ACTION_LEVELS = ["A0", "A1", "A2"] as const;

/** Fields of a PATCH body. A field that is present but invalid is an error, never a silent default. */
export function parseIntentPatch(body: Record<string, unknown>): { fields: IntentFields } | { error: string } {
  const f: IntentFields = {};
  if ("answerLevel" in body) {
    if (!(ANSWER_LEVELS as readonly unknown[]).includes(body.answerLevel)) return { error: "invalid_answerLevel" };
    f.answerLevel = body.answerLevel as string;
  }
  if ("actionLevel" in body) {
    if (!(ACTION_LEVELS as readonly unknown[]).includes(body.actionLevel)) return { error: "invalid_actionLevel" };
    f.actionLevel = body.actionLevel as string;
  }
  if ("isSensitive" in body) {
    if (typeof body.isSensitive !== "boolean") return { error: "invalid_isSensitive" };
    f.isSensitive = body.isSensitive;
  }
  if ("canaryPct" in body) {
    const v = body.canaryPct;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 100) return { error: "invalid_canaryPct" };
    f.canaryPct = v;
  }
  if ("handoffReply" in body) {
    const v = body.handoffReply;
    if (v !== null && (typeof v !== "string" || v.length > 300)) return { error: "invalid_handoffReply" };
    f.handoffReply = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  if ("label" in body) {
    if (typeof body.label !== "string" || !body.label.trim()) return { error: "invalid_label" };
    f.label = body.label.trim();
  }
  return { fields: f };
}

/** What happens to a customer message classified into this intent, in one sentence. */
export function intentBehavior(i: { answerLevel: string; canaryPct: number; isSensitive: boolean; graduated: boolean }): string {
  if (i.isSensitive) return "敏感：一律轉真人";
  if (i.answerLevel === "L0") return "不寫答案，直接轉真人";
  if (i.answerLevel === "L1") return "AI 寫草稿給專員，客人先收到確認句";
  if (!i.graduated) return "設成自動但沒有通過考試：照草稿處理";
  if (!passesCanary(i.canaryPct, 0)) return "自動比例 0%：照草稿處理";
  if (passesCanary(i.canaryPct, 99)) return "AI 直接回客人（知識庫沒有答案、敏感或沒把握時仍轉真人）";
  return `約 ${i.canaryPct}% 的訊息 AI 直接回客人，其餘寫草稿`;
}

/** Golden-set size the 客服 tab accepts in one replace (plan §5.2 asks for 30; the plan's long-term set is 200–500). */
export const MAX_EVAL_CASES = 500;

export interface EvalCaseInput {
  question: string;
  expectedPoints: string[];
  expectHandoff: boolean;
  isAdversarial: boolean;
}

/**
 * Cases for one intent's golden set. Every case must be judgeable: a case that expects an answer
 * needs at least one expected point (runEvalCase fails it otherwise), a handoff case needs none.
 */
export function parseEvalCases(raw: unknown): { cases: EvalCaseInput[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "cases_must_be_array" };
  if (raw.length > MAX_EVAL_CASES) return { error: "too_many_cases" };
  const cases: EvalCaseInput[] = [];
  for (const [i, c] of raw.entries()) {
    if (!c || typeof c !== "object") return { error: `case_${i + 1}_invalid` };
    const r = c as Record<string, unknown>;
    const question = typeof r.question === "string" ? r.question.trim() : "";
    if (!question || question.length > 500) return { error: `case_${i + 1}_question` };
    const points = Array.isArray(r.expectedPoints) ? r.expectedPoints : [];
    if (points.length > 10 || points.some((p) => typeof p !== "string" || !p.trim() || p.length > 300)) return { error: `case_${i + 1}_expectedPoints` };
    const expectHandoff = r.expectHandoff === true;
    if (!expectHandoff && points.length === 0) return { error: `case_${i + 1}_needs_expectedPoints` };
    cases.push({ question, expectedPoints: (points as string[]).map((p) => p.trim()), expectHandoff, isAdversarial: r.isAdversarial === true });
  }
  return { cases };
}
