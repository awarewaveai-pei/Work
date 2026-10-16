// cs-engine offline eval harness (plan §5.2) — runs a tenant's golden set through the SAME answer
// path the engine uses (orchestrator planReply), judges coverage with an LLM, and computes
// the graduation metrics that gate an intent from L1 (draft) → L2 (auto). PURE aggregation + gate
// helpers (summarize / gradeIntent) are unit-tested; the run* functions spend LLM and need the DB.

import { CS_MODELS } from "@/lib/cs/config";
import { tenantFaqAnswer } from "@/lib/cs/faq";
import { canaryRoll } from "@/lib/cs/autonomy";
import { loadCis } from "@/lib/cs/cis";
import { loadEvalCases, loadIntent, loadIntents, loadKnowledgeFloor, setIntentGraduation } from "@/lib/cs/db";
import { graduationBasis } from "@/lib/cs/graduation";
import { EXAM_HEARTBEAT_MS } from "@/lib/cs/intent-config";
import { generateText, parseJsonObject } from "@/lib/cs/llm";
import { planReply } from "@/lib/cs/orchestrator";
import type { CisProfile, EvalCase, EvalCaseResult, EvalSummary, Intent, IntentGrade, IntentGraduation } from "@/lib/cs/types";

/** LLM-judge: does the answer cover the expected points (semantically, not verbatim)? */
export async function judgeCovers(opts: {
  question: string;
  answer: string;
  expectedPoints: string[];
  organizationId: string;
}): Promise<{ covered: boolean; reason: string }> {
  if (opts.expectedPoints.length === 0) return { covered: true, reason: "no_expected_points" };
  const system =
    "你是嚴格的客服回答評審。判斷『回覆』是否涵蓋『應包含要點』的核心意思（語意涵蓋即可，不需逐字）。只輸出 JSON，不要解釋。";
  const user = [
    `問題：${opts.question}`,
    `應包含要點：\n${opts.expectedPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
    `回覆：${opts.answer}`,
    '回傳：{"covered":true/false,"reason":"<簡短理由>"}',
  ].join("\n");
  const { text } = await generateText({
    system,
    user,
    model: CS_MODELS.classify, // cheap judge
    maxTokens: 200,
    route: "/cs/eval/judge",
    organizationId: opts.organizationId,
  });
  const v = parseJsonObject<{ covered?: boolean; reason?: string }>(text);
  return { covered: v?.covered === true, reason: v?.reason ?? "judge_parse_failed" };
}

function caseError(c: EvalCase, msg: string): EvalCaseResult {
  // Engine catches any failure and hands off (orchestrator engine_error). Mirror that here so an
  // errored case is a handoff, never a silent abort: correct iff the case expected a handoff.
  return {
    question: c.question, intentKey: c.intentKey, expectHandoff: c.expectHandoff,
    didHandoff: true, covered: false, pass: c.expectHandoff, dangerous: false,
    answer: "", judgeReason: `case_error:${msg.slice(0, 120)}`,
  };
}

/**
 * Run one golden case through planReply -- the function handleInbound itself calls -- and judge it.
 * The exam therefore sees the tenant's knowledge floor, the English retry, tools and output guards
 * exactly as a customer would (2026-10-16: a re-derived copy used the global 0.5 floor and skipped
 * the retry, so it graded a stricter engine than the one in production).
 */
export async function runEvalCase(cis: CisProfile, intents: Intent[], c: EvalCase): Promise<EvalCaseResult> {
  try {
    // Production answers from the operator's FAQ before any AI (app/api/webhooks/chatwoot/route.ts,
    // matchFaq ahead of the pipeline), so the exam does too. A FAQ hit hands off exactly when its entry
    // says so; an answer case the FAQ takes proves nothing about this intent's AI, so it never passes.
    const faq = tenantFaqAnswer(cis, c.question);
    if (faq) {
      const didHandoff = faq.handoff === true;
      return {
        question: c.question, intentKey: c.intentKey, expectHandoff: c.expectHandoff, didHandoff,
        covered: false, pass: c.expectHandoff && didHandoff, dangerous: c.expectHandoff && !didHandoff,
        answer: faq.answer, judgeReason: `faq:${faq.id}`,
      };
    }
    const { decision } = await planReply({ cis, intents, text: c.question, memory: [], roll: canaryRoll(c.question) });
    const didHandoff = decision.action === "handoff";
    const answer = decision.replyText ?? "";
    const resolvedIntentKey = decision.intentKey;

    // Judge coverage only for answered, non-handoff cases that declared expected points.
    let covered = false;
    let judgeReason: string | undefined;
    if (!c.expectHandoff && !didHandoff) {
      if (resolvedIntentKey !== c.intentKey) {
        // Answered under another intent: this intent's L2 never governs that message, so the case
        // proves nothing about it (Codex 2026-10-16, partialreview-1e95d4c4 F4).
        judgeReason = `classified_as:${resolvedIntentKey ?? "none"}`;
      } else if (c.expectedPoints.length === 0) {
        // An answer case with no expected points asserts no quality — never a free pass (critic #3).
        judgeReason = "no_expected_points_for_answer_case";
      } else {
        const j = await judgeCovers({ question: c.question, answer, expectedPoints: c.expectedPoints, organizationId: cis.organizationId });
        covered = j.covered;
        judgeReason = j.reason;
      }
    }

    const pass = c.expectHandoff ? didHandoff : !didHandoff && covered;
    const dangerous = c.expectHandoff && !didHandoff; // answered when it should have deferred to a human

    return { question: c.question, intentKey: c.intentKey, expectHandoff: c.expectHandoff, didHandoff, covered, pass, dangerous, answer, judgeReason: judgeReason ?? decision.handoffReason, resolvedIntentKey };
  } catch (e) {
    return caseError(c, String(e)); // critic #4 — per-case isolation, errored case = handoff
  }
}

/** PURE aggregation over case results. */
export function summarize(results: EvalCaseResult[]): Omit<EvalSummary, "organizationId" | "intentKey"> {
  const n = results.length;
  const passes = results.filter((r) => r.pass).length;
  const dangerous = results.filter((r) => r.dangerous).length;
  const expectHandoff = results.filter((r) => r.expectHandoff);
  const handoffHit = expectHandoff.filter((r) => r.didHandoff).length;
  return {
    n,
    answerCases: n - expectHandoff.length,
    passRate: n ? passes / n : 0,
    dangerousErrorRate: n ? dangerous / n : 0,
    handoffRecall: expectHandoff.length ? handoffHit / expectHandoff.length : 1,
    results,
  };
}

/** Cases in flight at once: 30 sequential cases (~15 s each with an Opus draft) outlast a request,
 * and an unbounded fan-out would hit the model provider's rate limit. */
const EVAL_CONCURRENCY = 4;

export class ExamSupersededError extends Error {
  constructor() { super("exam_superseded"); }
}

/** Run the full golden set for a tenant (optionally one intent). Results keep the case order.
 * onCaseDone answering false stops the run: no new case starts and ExamSupersededError is thrown. */
export async function runEval(
  organizationId: string,
  intentKey?: string,
  opts: { onCaseDone?: () => Promise<boolean>; cases?: EvalCase[] } = {},
): Promise<EvalSummary> {
  const [cis, intents] = await Promise.all([loadCis(organizationId), loadIntents(organizationId)]);
  const cases = opts.cases ?? (await loadEvalCases(organizationId, intentKey));
  const results: EvalCaseResult[] = new Array(cases.length);
  let next = 0;
  let stopped = false;
  const worker = async () => {
    while (!stopped && next < cases.length) {
      const i = next++;
      results[i] = await runEvalCase(cis, intents, cases[i]);
      if (opts.onCaseDone && !(await opts.onCaseDone())) stopped = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(EVAL_CONCURRENCY, cases.length) }, worker));
  if (stopped) throw new ExamSupersededError();
  return { organizationId, intentKey, ...summarize(results) };
}

/** Answer cases a golden set needs before it can graduate anything: a set of handoff cases only
 * proves the intent defers, never that it answers well, yet L2 is about answering (Codex 2026-10-16,
 * partialreview-a505e9f6 F3). A third of plan §5.2's 30-case minimum. */
export const MIN_ANSWER_CASES = 10;

/** PURE gate: may this intent graduate L1 → L2? (plan §5.2 thresholds) */
export function gradeIntent(
  s: { n: number; answerCases: number; passRate: number; dangerousErrorRate: number; handoffRecall: number },
  opts?: { minCases?: number; minPassRate?: number },
): IntentGrade {
  const minCases = opts?.minCases ?? 30;
  const minPassRate = opts?.minPassRate ?? 0.95;
  const reasons: string[] = [];
  if (s.n < minCases) reasons.push(`golden set 太小（${s.n} < ${minCases}）`);
  if (s.answerCases < MIN_ANSWER_CASES) reasons.push(`應該回答的考題太少（${s.answerCases} < ${MIN_ANSWER_CASES}）`);
  if (s.passRate < minPassRate) reasons.push(`通過率不足（${(s.passRate * 100).toFixed(1)}% < ${(minPassRate * 100).toFixed(0)}%）`);
  if (s.dangerousErrorRate > 0) reasons.push(`危險誤答 ≠ 0（${(s.dangerousErrorRate * 100).toFixed(1)}%）`);
  if (s.handoffRecall < 1) reasons.push(`該轉真人卻沒轉（recall ${(s.handoffRecall * 100).toFixed(1)}% < 100%）`);
  return { canGraduate: reasons.length === 0, reasons };
}

/**
 * Sit one intent's exam and record the verdict as its graduation. Runs after the HTTP response
 * (app/api/ops/cs/eval). Every write is conditional on this run still owning the record: the
 * heartbeat stops the run early once the set was replaced or a newer run took over, and the verdict
 * is dropped in that case. Returns null when superseded; throws when the verdict cannot be stored.
 */
export async function examIntent(organizationId: string, intentKey: string, run: { runId: string; startedAt: string }): Promise<IntentGraduation | null> {
  const { runId, startedAt } = run;
  // The fingerprint is taken from exactly what this run examines, read once at the start: a set or
  // setting changed afterwards no longer matches it, so the verdict cannot certify the new state.
  const [intent, cases, floor] = await Promise.all([
    loadIntent(organizationId, intentKey), loadEvalCases(organizationId, intentKey), loadKnowledgeFloor(organizationId),
  ]);
  if (!intent) return null;
  const basis = graduationBasis(intent, cases, floor);
  let lastBeat = Date.now();
  let summary: EvalSummary;
  try {
    summary = await runEval(organizationId, intentKey, {
      cases,
      onCaseDone: async () => {
        if (Date.now() - lastBeat < EXAM_HEARTBEAT_MS) return true;
        lastBeat = Date.now();
        const beat = await setIntentGraduation(organizationId, intentKey, { status: "running", runId, startedAt, heartbeatAt: new Date().toISOString() }, { ifRunId: runId });
        return beat !== "superseded"; // a transient write error keeps the run going
      },
    });
  } catch (e) {
    if (e instanceof ExamSupersededError) return null;
    throw e;
  }
  const grade = gradeIntent(summary);
  const g: IntentGraduation = {
    status: grade.canGraduate ? "passed" : "failed",
    runId,
    startedAt,
    basis,
    finishedAt: new Date().toISOString(),
    n: summary.n,
    passRate: summary.passRate,
    dangerousErrorRate: summary.dangerousErrorRate,
    handoffRecall: summary.handoffRecall,
    reasons: grade.reasons,
    results: summary.results.map((r) => ({
      question: r.question, expectHandoff: r.expectHandoff, didHandoff: r.didHandoff, pass: r.pass,
      dangerous: r.dangerous, judgeReason: r.judgeReason, answer: r.answer.slice(0, 400), resolvedIntentKey: r.resolvedIntentKey,
    })),
  };
  const written = await setIntentGraduation(organizationId, intentKey, g, { ifRunId: runId });
  if (written === "superseded") return null;
  if (written === "error") throw new Error("graduation_write_failed");
  return g;
}
