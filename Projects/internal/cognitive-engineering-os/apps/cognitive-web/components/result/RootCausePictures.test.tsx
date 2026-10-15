import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MethodVisual, recordPicture } from "./MethodVisual";

// The four root-cause tools draw their card ② from the record itself; a record they cannot use falls back to the
// generic picture of the tool's visual kind, and the Pareto marks a vital few only when the operator set the threshold.
const draw = (methodId: string, record: Record<string, unknown>) => renderToStaticMarkup(<MethodVisual kind="table" bindings={{}} methodId={methodId} record={record} />);
const ranking = [
  { hypothesis_id: "H1", metric_value: 17, share_of_total_percent: 42.5, cumulative_share_percent: 42.5 },
  { hypothesis_id: "H2", metric_value: 12, share_of_total_percent: 30, cumulative_share_percent: 72.5 },
  { hypothesis_id: "H4", metric_value: 11, share_of_total_percent: 27.5, cumulative_share_percent: 100 },
];
const causes = [{ hypothesis_id: "H1", statement: "帶領者先講作品的意義" }, { hypothesis_id: "H2", statement: "分享時間不夠" }, { hypothesis_id: "H4", statement: "線上場關著鏡頭" }];

describe("root-cause pictures", () => {
  it("each tool draws its own picture from a usable record, and names its card ②", () => {
    const cases: Array<[string, Record<string, unknown>, string, string]> = [
      ["framing.problem_statement", { content: { current_state: "第 6 次只有 2 位分享", expected_state: "每次至少 5 位", gap: "少 3 位" } }, "problem-gap", "少 3 位"],
      ["root_cause.fishbone", { problem_summary: "分享從 6 人掉到 2 人", hypotheses: [{ id: "H1", statement: "帶領者先講意義", category: "人" }] }, "fishbone", "分享從 6 人掉到 2 人"],
      ["root_cause.five_whys", { target_hypothesis_id: "H1", target_hypothesis_statement: "帶領者先講意義", why_chain: [{ step: 1, question: "為什麼變少？", answer: "流程表這樣寫", supporting_evidence_refs: ["E-1"] }], stop_conditions_met: ["FOUND_SYSTEM_PROCESS_MECHANISM"] }, "why-chain", "依據 E-1"],
      ["root_cause.pareto", { metric_name: "沒開口的原因", ranking, causes, threshold_status: "OPERATOR_SET_PENDING", vital_few_hypothesis_ids: [] }, "pareto", "H1 帶領者先講作品的意義"],
    ];
    for (const [methodId, record, visual, text] of cases) {
      const html = draw(methodId, record);
      expect(html, methodId).toContain(`data-visual="${visual}"`);
      expect(html, methodId).toContain(text);
      expect(recordPicture(methodId, record)?.heading, methodId).toBeTruthy();
    }
  });

  it("a record the picture cannot use falls back to the generic picture and names no heading", () => {
    for (const [methodId, record] of [["framing.problem_statement", { content: { current_state: "x" } }], ["root_cause.five_whys", { why_chain: [] }], ["root_cause.pareto", { ranking: [{ hypothesis_id: "H1" }] }], ["root_cause.pareto", { ranking: [{ hypothesis_id: "H1", metric_value: 0, share_of_total_percent: 0, cumulative_share_percent: 0 }] }]] as const) {
      expect(draw(methodId, record), methodId).toContain('data-visual="table"');
      expect(recordPicture(methodId, record), methodId).toBeUndefined();
    }
  });

  it("the Pareto marks the vital few only when the operator set the threshold (80/20 is not a law)", () => {
    const pending = draw("root_cause.pareto", { metric_name: "m", ranking, causes, threshold_status: "OPERATOR_SET_PENDING", vital_few_threshold_percent: null, vital_few_hypothesis_ids: [] });
    expect(pending).not.toContain('data-vital="yes"');
    expect(pending).toContain("門檻還沒定");
    const set = draw("root_cause.pareto", { metric_name: "m", ranking, causes, threshold_status: "OPERATOR_SET", vital_few_threshold_percent: 80, vital_few_hypothesis_ids: ["H1", "H2", "H4"] });
    expect(set.match(/data-vital="yes"/g)?.length).toBe(3);
    expect(set).toContain("門檻 80%（你定的）");
  });
});
