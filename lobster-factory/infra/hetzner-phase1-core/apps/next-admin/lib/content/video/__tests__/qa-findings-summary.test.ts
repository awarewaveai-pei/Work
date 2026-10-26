import { describe, expect, it } from "vitest";
import { summarizeQaFindings } from "../qa-findings-summary";

describe("summarizeQaFindings", () => {
  it("editorial/rights shape: top-level findings with code", () => {
    const out = summarizeQaFindings({ findings: [{ code: "missing_script", severity: "error", message: "no script" }] });
    expect(out).toEqual([{ rule: "missing_script", severity: "error", message: "no script" }]);
  });

  it("technical shape: one black_frames per format keeps the format", () => {
    const f = { ruleId: "picture.black_frames", severity: "error", message: "black" };
    const out = summarizeQaFindings({ formats: { "16x9": { signalQa: { findings: [f] } }, "9x16": { technicalQa: { findings: [f] } } } });
    expect(out).toEqual([
      { rule: "picture.black_frames", severity: "error", message: "black", format: "16x9" },
      { rule: "picture.black_frames", severity: "error", message: "black", format: "9x16" },
    ]);
  });

  it("caption shape: violation codes become findings", () => {
    const out = summarizeQaFindings({ violations: ["segments_missing", 7] });
    expect(out).toEqual([{ rule: "segments_missing", severity: "error", message: "segments_missing" }]);
  });

  it("accepts snake_case signal_qa", () => {
    const out = summarizeQaFindings({ formats: { "1x1": { signal_qa: { findings: [{ ruleId: "audio.loudness", severity: "warn", message: "loud" }] } } } });
    expect(out).toEqual([{ rule: "audio.loudness", severity: "warn", message: "loud", format: "1x1" }]);
  });

  it.each([[null], [undefined], ["x"], [42], [[]]])("non-object %j -> []", (v) => {
    expect(summarizeQaFindings(v)).toEqual([]);
  });

  it("caps at 20", () => {
    const findings = Array.from({ length: 30 }, (_, i) => ({ code: `c${i}`, severity: "error", message: "m" }));
    expect(summarizeQaFindings({ findings })).toHaveLength(20);
  });
});
