import { describe, expect, it } from "vitest";
import { summarizeQaFindings } from "../qa-findings-summary";
import { FINDING_TEXT, explainFinding } from "@/app/(shell)/tools/video/qa-labels";

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

// P6.10 defect A (asset f5caefaf, 2026-11-13): technical QA warned with signalQa {integratedLufs:-70} and no findings
// showed only "⚠ 警告". Every warned/failed report must yield at least one explainable finding.
describe("summarizeQaFindings -- warned/failed always explained", () => {
  const silent = { source: "video-service", formats: { master: { signalQa: { audio: true, status: "warned", truePeakDb: null, integratedLufs: -70 }, technicalQa: { status: "passed", findings: [] } } } };

  it("a silent master (-70 LUFS, no findings) becomes audio.silent with the measured value", () => {
    expect(summarizeQaFindings(silent, "warned")).toEqual([{ rule: "audio.silent", severity: "warn", message: "", format: "master", evidence: { integratedLufs: -70 } }]);
  });

  it("the page text names the cause and the fix, from the report", () => {
    const [f] = summarizeQaFindings(silent, "warned");
    expect(explainFinding(f)).toBe("影片沒有聲音（−70 LUFS）：加配樂或旁白後重新匯出");
  });

  it("a non-passed report with nothing to read still yields qa.unexplained", () => {
    expect(summarizeQaFindings({}, "failed")).toEqual([{ rule: "qa.unexplained", severity: "error", message: "", evidence: { status: "failed" } }]);
    expect(summarizeQaFindings({}, "passed")).toEqual([]);
  });

  it("every rule a producer can emit has a cause-and-fix sentence", () => {
    for (const rule of Object.keys(FINDING_TEXT)) expect(explainFinding({ rule, message: "" })).toMatch(/：.+/);
    expect(explainFinding({ rule: "some.new_rule", message: "raw message" })).toMatch(/^raw message：/);
  });
});
