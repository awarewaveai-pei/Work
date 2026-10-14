import { describe, expect, it } from "vitest";

import type { FormField } from "./form-model";
import { fieldAt, isOldVersion, plain, shownPath } from "./record";

describe("isOldVersion", () => {
  it("is told by the stored gates or schema version, not by missing sections (P-15)", () => {
    expect(isOldVersion({ findings: [] }, [{ gate_id: "citation_integrity" }])).toBe(true);        // 1.0.0: three gates
    expect(isOldVersion({ findings: [] }, [{ gate_id: "detail_integrity" }])).toBe(false);          // 1.2.0 with every section dropped
    expect(isOldVersion({ findings: [] }, [], "1.0.0")).toBe(true);
    expect(isOldVersion({ findings: [] }, [], "1.2.0")).toBe(false);
    expect(isOldVersion(null, [])).toBe(false);
  });
});

describe("plain", () => {
  // strategy.swot's factors as GET /methods/strategy.swot/form gives them (2026-10-14)
  const FACTORS: FormField = { key: "factors", kind: "rows", label: "因素", item: { kind: "group", fields: [
    { key: "id", kind: "text", label: "編號" },
    { key: "category", kind: "choice", label: "類別", options: [{ value: "OPPORTUNITY", label: "機會" }] },
    { key: "statement", kind: "text", label: "陳述" },
    { key: "source", kind: "text", label: "來源" },
    { key: "provenance", kind: "provenance" },
  ] } };
  const row = { id: "F-3", category: "OPPORTUNITY", statement: "當地法規剛放寬外資限制", source: "經濟部公告",
                provenance: { authorship_state: "HUMAN_ORIGINAL", epistemic_type: "HUMAN_OPINION", locked: null } };

  it("reads a cited row as the form's labels and values, a choice as its label, never as JSON", () => {
    const text = plain(row, fieldAt([FACTORS], "r/factors/2"));
    expect(text).toBe("編號：F-3；類別：機會；陳述：當地法規剛放寬外資限制；來源：經濟部公告");
    expect(plain(row)).not.toMatch(/[{}"]/);   // no field known: the plain values, still no JSON
    expect(plain("當地法規", fieldAt([FACTORS], "r/factors/2/statement"))).toBe("當地法規");
    expect(plain([row, row], fieldAt([FACTORS], "r/factors"))).toBe(`${text}；${text}`);
  });

  it("reads a citation of a system part as the row that holds it", () => {
    expect(shownPath([FACTORS], "r/factors/2/provenance")).toBe("r/factors/2");
    expect(shownPath([FACTORS], "r/factors/2/statement")).toBe("r/factors/2/statement");
  });
});
