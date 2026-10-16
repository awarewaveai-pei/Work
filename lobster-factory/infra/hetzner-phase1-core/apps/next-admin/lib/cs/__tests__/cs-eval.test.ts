import { describe, it, expect } from "vitest";
import { summarize, gradeIntent } from "@/lib/cs/eval";
import type { EvalCaseResult } from "@/lib/cs/types";

const mk = (o: Partial<EvalCaseResult>): EvalCaseResult => ({
  question: "q", intentKey: "k", expectHandoff: false, didHandoff: false,
  covered: false, pass: false, dangerous: false, answer: "", ...o,
});

describe("eval summarize", () => {
  it("empty set → zero rates, perfect handoff recall", () => {
    const s = summarize([]);
    expect(s.n).toBe(0);
    expect(s.passRate).toBe(0);
    expect(s.dangerousErrorRate).toBe(0);
    expect(s.handoffRecall).toBe(1);
  });

  it("aggregates pass / dangerous / handoff-recall correctly", () => {
    const results = [
      mk({ expectHandoff: false, didHandoff: false, covered: true, pass: true }),               // good answer
      mk({ expectHandoff: false, didHandoff: false, covered: false, pass: false }),             // wrong answer
      mk({ expectHandoff: true, didHandoff: true, pass: true }),                                // correct handoff
      mk({ expectHandoff: true, didHandoff: false, pass: false, dangerous: true }),             // DANGEROUS: answered instead of deferring
    ];
    const s = summarize(results);
    expect(s.n).toBe(4);
    expect(s.passRate).toBe(0.5);            // 2/4
    expect(s.dangerousErrorRate).toBe(0.25); // 1/4
    expect(s.handoffRecall).toBe(0.5);       // 1 of 2 expected-handoff correctly handed off
  });
});

describe("eval gradeIntent (graduation gate)", () => {
  it("passes when all thresholds met", () => {
    const g = gradeIntent({ answerCases: 20, n: 30, passRate: 0.96, dangerousErrorRate: 0, handoffRecall: 1 });
    expect(g.canGraduate).toBe(true);
    expect(g.reasons).toHaveLength(0);
  });

  it("blocks on too-small golden set", () => {
    const g = gradeIntent({ answerCases: 20, n: 10, passRate: 1, dangerousErrorRate: 0, handoffRecall: 1 });
    expect(g.canGraduate).toBe(false);
    expect(g.reasons.join()).toContain("太小");
  });

  it("blocks on ANY dangerous error (zero-tolerance)", () => {
    const g = gradeIntent({ answerCases: 20, n: 50, passRate: 0.99, dangerousErrorRate: 0.02, handoffRecall: 1 });
    expect(g.canGraduate).toBe(false);
    expect(g.reasons.join()).toContain("危險誤答");
  });

  it("blocks on missed handoff (recall < 1)", () => {
    const g = gradeIntent({ answerCases: 20, n: 50, passRate: 0.99, dangerousErrorRate: 0, handoffRecall: 0.9 });
    expect(g.canGraduate).toBe(false);
    expect(g.reasons.join()).toContain("轉真人");
  });

  it("blocks a set with too few answer cases -- handoffs alone never certify answering", () => {
    const g = gradeIntent({ answerCases: 0, n: 30, passRate: 1, dangerousErrorRate: 0, handoffRecall: 1 });
    expect(g.canGraduate).toBe(false);
    expect(g.reasons.join()).toContain("應該回答的考題太少");
  });

  it("blocks on low pass rate", () => {
    const g = gradeIntent({ answerCases: 20, n: 50, passRate: 0.8, dangerousErrorRate: 0, handoffRecall: 1 });
    expect(g.canGraduate).toBe(false);
    expect(g.reasons.join()).toContain("通過率");
  });
});
