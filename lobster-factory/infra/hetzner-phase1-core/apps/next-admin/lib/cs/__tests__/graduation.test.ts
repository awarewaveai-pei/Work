// A pass certifies the golden set and decision settings it was taken under; any change to either
// revokes it on the next read (Codex 2026-10-16 partialreview-5c84dbcc F1-F3).
import { describe, expect, it } from "vitest";
import { graduationBasis, isCurrentGraduation } from "@/lib/cs/graduation";

const intent = { confidenceThreshold: 0.7, isSensitive: false, actionLevel: "A0" };
const cases = [
  { question: "有哪些課程？", expectedPoints: ["兩個模組"], expectHandoff: false, isAdversarial: false },
  { question: "多少錢？", expectedPoints: [], expectHandoff: true, isAdversarial: false },
];
const passed = (basis: string) => ({ status: "passed" as const, startedAt: "t", basis });

describe("isCurrentGraduation", () => {
  const basis = graduationBasis(intent, cases, 0.4);
  it("counts while the set and settings are unchanged, whatever the case order", () => {
    expect(isCurrentGraduation(passed(basis), graduationBasis(intent, [...cases].reverse(), 0.4))).toBe(true);
  });
  it("a lowered confidence floor revokes the pass", () => {
    expect(isCurrentGraduation(passed(basis), graduationBasis({ ...intent, confidenceThreshold: 0 }, cases, 0.4))).toBe(false);
  });
  it("a lowered tenant knowledge floor revokes the pass", () => {
    expect(isCurrentGraduation(passed(basis), graduationBasis(intent, cases, 0.2))).toBe(false);
  });
  it("an edited case revokes the pass", () => {
    const edited = [{ ...cases[0], expectedPoints: ["別的要點"] }, cases[1]];
    expect(isCurrentGraduation(passed(basis), graduationBasis(intent, edited, 0.4))).toBe(false);
  });
  it("a pass stored without a fingerprint never counts", () => {
    expect(isCurrentGraduation({ status: "passed", startedAt: "t" }, basis)).toBe(false);
  });
});
