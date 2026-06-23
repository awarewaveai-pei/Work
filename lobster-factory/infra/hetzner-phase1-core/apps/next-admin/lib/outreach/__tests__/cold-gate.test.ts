import { describe, it, expect } from "vitest";
import { checkColdGate, buildEvidenceSnapshot, lintMessage, DEFAULT_FORBIDDEN } from "../cold-gate";

describe("checkColdGate (pre-generation)", () => {
  it("passes with observation + source_url", () => {
    const r = checkColdGate({ observation: "常辦週末小班", source_url: "https://dir/acme" });
    expect(r.status).toBe("pass");
    expect(r.blockers).toHaveLength(0);
  });
  it("blocks when observation missing", () => {
    const r = checkColdGate({ source_url: "https://x" });
    expect(r.status).toBe("block");
    expect(r.blockers.some((b) => b.includes("observation"))).toBe(true);
  });
  it("blocks when source_url missing", () => {
    expect(checkColdGate({ observation: "o" }).status).toBe("block");
  });
  it("blocks do_not_contact regardless of data", () => {
    const r = checkColdGate({ observation: "o", source_url: "s", do_not_contact: true });
    expect(r.status).toBe("block");
    expect(r.blockers.some((b) => b.includes("do_not_contact"))).toBe(true);
  });
});

describe("buildEvidenceSnapshot", () => {
  it("captures only present evidence fields, empty unsupported_claims", () => {
    const e = buildEvidenceSnapshot({ observation: " obs ", source_url: "https://x", pain_guess: "" });
    expect(e.used_observation).toBe("obs");
    expect(e.source_url).toBe("https://x");
    expect(e.used_pain_guess).toBeNull();
    expect(e.unsupported_claims).toEqual([]);
  });
});

describe("lintMessage (post-generation)", () => {
  it("clean low-pressure message passes", () => {
    const body = "你好，看到你們常辦週末小班，想分享一個藝術療癒取向的合作點子。如果不適合，我就不再打擾。";
    const r = lintMessage(body, []);
    expect(r.quality_gate_status).toBe("pass");
    expect(r.forbidden_hits).toHaveLength(0);
    expect(r.safety_score).toBe(100);
  });
  it("blocks on default forbidden phrase", () => {
    const r = lintMessage("我們保證療癒你的客戶。如果不適合，我就不再打擾。", []);
    expect(r.quality_gate_status).toBe("block");
    expect(r.forbidden_hits).toContain("保證療癒");
  });
  it("blocks on service-profile custom forbidden word", () => {
    const r = lintMessage("這個方案穩賺。如果不適合，我就不再打擾。", ["獨家秘方"]);
    expect(r.forbidden_hits).toContain("穩賺");
    expect(r.quality_gate_status).toBe("block");
  });
  it("warns on hard CTA + missing opt-out", () => {
    const r = lintMessage("立即購買我們的方案！", []);
    expect(r.quality_gate_status).toBe("warn");
    expect(r.findings.some((f) => f.includes("CTA"))).toBe(true);
    expect(r.findings.some((f) => f.includes("拒收"))).toBe(true);
  });
  it("blocks empty body", () => {
    expect(lintMessage("", []).quality_gate_status).toBe("block");
  });
  it("DEFAULT_FORBIDDEN includes the §C4 sensitive phrases", () => {
    expect(DEFAULT_FORBIDDEN).toContain("療效保證");
    expect(DEFAULT_FORBIDDEN).toContain("保證成交");
  });
});
