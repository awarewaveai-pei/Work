import { describe, expect, it } from "vitest";
import { runEditorialQa, runRightsQa, termAppears } from "../editorial-rights-qa";

describe("term match (R6)", () => {
  it("a Latin term does not match inside a longer word, and a required term is not 'present' that way", () => {
    expect(termAppears("Keep your data secure", "cure")).toBe(false);
    expect(runEditorialQa({ title: "t", script: "Keep your data secure", forbiddenTerms: ["cure"] }).status).toBe("passed");
    expect(runEditorialQa({ title: "t", script: "brandnew launch", requiredTerms: ["brand"] }).findings.map((f) => f.code)).toEqual(["required_term_missing"]);
  });

  it("a standalone Latin term still matches, also next to Chinese; a Chinese term stays a substring; mixed terms work", () => {
    expect(termAppears("This will Cure you.", "cure")).toBe(true);
    expect(termAppears("這個cure很好", "cure")).toBe(true);
    expect(termAppears("效果保證有效", "保證")).toBe(true);
    expect(termAppears("最新的ChatGPT教學影片", "chatgpt 教學")).toBe(false);
    expect(termAppears("最新的ChatGPT 教學影片", "chatgpt 教學")).toBe(true);
    expect(termAppears("用 GPT4o 做", "gpt4")).toBe(false);
  });

  it("existing data: each of Soulful's live forbidden claims still matches (inflected English too)", () => {
    const live = ["cure", "heal illness", "treat", "diagnose", "guaranteed results", "保證"];
    const script = "It cures pain, can heal illness, treated daily, we diagnose fast, guaranteed results, 保證有效";
    expect(live.filter((t) => !termAppears(script, t))).toEqual([]);
    expect(termAppears("a new treatment plan", "treat")).toBe(true);
  });
});

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

