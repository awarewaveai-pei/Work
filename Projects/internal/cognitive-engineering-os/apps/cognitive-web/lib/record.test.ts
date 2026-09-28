import { describe, expect, it } from "vitest";

import { isOldVersion } from "./record";

describe("isOldVersion", () => {
  it("is told by the stored gates or schema version, not by missing sections (P-15)", () => {
    expect(isOldVersion({ findings: [] }, [{ gate_id: "citation_integrity" }])).toBe(true);        // 1.0.0: three gates
    expect(isOldVersion({ findings: [] }, [{ gate_id: "detail_integrity" }])).toBe(false);          // 1.2.0 with every section dropped
    expect(isOldVersion({ findings: [] }, [], "1.0.0")).toBe(true);
    expect(isOldVersion({ findings: [] }, [], "1.2.0")).toBe(false);
    expect(isOldVersion(null, [])).toBe(false);
  });
});
