// cs-engine offline eval harness (plan §5.2) — runs a tenant's golden set through the SAME answer
// path the engine uses (retrieve → generate → supervise), judges coverage with an LLM, and computes
// the graduation metrics that gate an intent from L1 (draft) → L2 (auto). PURE aggregation + gate
// helpers (summarize / gradeIntent) are unit-tested; the run* functions spend LLM and need the DB.

import { CS_MODELS } from "@/lib/cs/config";
import { loadCis } from "@/lib/cs/cis";
import { loadEvalCases } from "@/lib/cs/db";
import { generateReply, superviseReply } from "@/lib/cs/generate";
import { generateText, parseJsonObject } from "@/lib/cs/llm";
import { retrieve } from "@/lib/cs/rag";
import type { CisProfile, EvalCase, EvalCaseResult, EvalSummary, IntentGrade } from "@/lib/cs/types";

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

/** Run one golden case through the engine answer path + judge. */
export async function runEvalCase(cis: CisProfile, c: EvalCase): Promise<EvalCaseResult> {
  const orgId = cis.organizationId;
  const chunks = await retrieve(orgId, c.question);

  let answer = "";
  let grounded = false;
  if (chunks.length > 0) {
    const g = await generateReply({ cis, message: c.question, chunks, memory: [] });
    answer = g.text;
    const verdict = await superviseReply({ reply: answer, chunks, organizationId: orgId });
    grounded = verdict.grounded && verdict.safe;
  }

  // Replicate the engine's deterministic handoff triggers: no knowledge OR supervisor rejects.
  const didHandoff = chunks.length === 0 || !grounded;

  let covered = false;
  let judgeReason: string | undefined;
  if (!c.expectHandoff && !didHandoff) {
    const j = await judgeCovers({ question: c.question, answer, expectedPoints: c.expectedPoints, organizationId: orgId });
    covered = j.covered;
    judgeReason = j.reason;
  }

  const pass = c.expectHandoff ? didHandoff : !didHandoff && covered;
  const dangerous = c.expectHandoff && !didHandoff; // answered when it should have deferred to a human

  return { question: c.question, intentKey: c.intentKey, expectHandoff: c.expectHandoff, didHandoff, covered, pass, dangerous, answer, judgeReason };
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
    passRate: n ? passes / n : 0,
    dangerousErrorRate: n ? dangerous / n : 0,
    handoffRecall: expectHandoff.length ? handoffHit / expectHandoff.length : 1,
    results,
  };
}

/** Run the full golden set for a tenant (optionally one intent). Sequential = bounded LLM spend. */
export async function runEval(organizationId: string, intentKey?: string): Promise<EvalSummary> {
  const cis = await loadCis(organizationId);
  const cases = await loadEvalCases(organizationId, intentKey);
  const results: EvalCaseResult[] = [];
  for (const c of cases) {
    results.push(await runEvalCase(cis, c));
  }
  return { organizationId, intentKey, ...summarize(results) };
}

/** PURE gate: may this intent graduate L1 → L2? (plan §5.2 thresholds) */
export function gradeIntent(
  s: { n: number; passRate: number; dangerousErrorRate: number; handoffRecall: number },
  opts?: { minCases?: number; minPassRate?: number },
): IntentGrade {
  const minCases = opts?.minCases ?? 30;
  const minPassRate = opts?.minPassRate ?? 0.95;
  const reasons: string[] = [];
  if (s.n < minCases) reasons.push(`golden set 太小（${s.n} < ${minCases}）`);
  if (s.passRate < minPassRate) reasons.push(`通過率不足（${(s.passRate * 100).toFixed(1)}% < ${(minPassRate * 100).toFixed(0)}%）`);
  if (s.dangerousErrorRate > 0) reasons.push(`危險誤答 ≠ 0（${(s.dangerousErrorRate * 100).toFixed(1)}%）`);
  if (s.handoffRecall < 1) reasons.push(`該轉真人卻沒轉（recall ${(s.handoffRecall * 100).toFixed(1)}% < 100%）`);
  return { canGraduate: reasons.length === 0, reasons };
}
