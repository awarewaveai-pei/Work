import { describe, expect, it } from "vitest";
import { runEditorialQa, runRightsQa } from "../editorial-rights-qa";

describe("editorial and rights QA", () => {
  it("fails forbidden terms and warns on missing required terms", () => {
    const result = runEditorialQa({
      title: "Launch",
      script: "This script contains a blocked phrase",
      forbiddenTerms: ["blocked phrase"],
      requiredTerms: ["brand"],
    });
    expect(result.status).toBe("failed");
    expect(result.findings.map((finding) => finding.code)).toEqual(["forbidden_term", "required_term_missing"]);
  });

  it("passes a complete editorial record", () => {
    const result = runEditorialQa({ title: "Brand launch", script: "Brand shows the new product", requiredTerms: ["brand"] });
    expect(result.status).toBe("passed");
    expect(result.findings).toHaveLength(0);
  });

  it("fails closed when rights evidence is missing or expired", () => {
    const result = runRightsQa({ assets: [{ assetId: "asset-1", status: "cleared", licenseRef: "lic-1", sourceRef: "src-1", expiresAt: "2020-01-01T00:00:00Z" }] });
    expect(result.status).toBe("failed");
    expect(result.findings.map((finding) => finding.code)).toContain("rights_expired");
  });

  it("passes explicit current rights evidence", () => {
    const result = runRightsQa({ assets: [{ assetId: "asset-1", status: "cleared", licenseRef: "lic-1", sourceRef: "src-1" }] });
    expect(result.status).toBe("passed");
  });
});

