import { describe, it, expect } from "vitest";
import { checkColdGate, lintMessage, DEFAULT_FORBIDDEN } from "../cold-gate";

describe("checkColdGate with evidence (SPEC §5.2)", () => {
  it("one approved evidence row passes without the old observation", () => {
    expect(checkColdGate({}, 1).status).toBe("pass");
    expect(checkColdGate({}, 0).status).toBe("block");
  });
  it("a warm lead is refused whatever its evidence", () => {
    for (const status of ["replied", "proposal_sent", "meeting_booked", "warm", "synced_to_fluentcrm", "nurturing", "customer", "unsubscribed", "do_not_contact"]) {
      expect(checkColdGate({ status }, 3).status).toBe("block");
    }
    expect(checkColdGate({ consent_source: "meta_lead_ad:123" }, 3).status).toBe("block");
    expect(checkColdGate({ status: "qualified", consent_source: "self_published:https://a" }, 1).status).toBe("pass");
  });
});

describe("checkColdGate (pre-generation)", () => {
  it("a lead with only the old observation + source_url and no evidence row is blocked (card C9.2)", () => {
    const old = { observation: "常辦週末小班", source_url: "https://dir/acme" };
    const r = checkColdGate({ ...old, name: "acme" });
    expect(r.status).toBe("block");
    expect(r.blockers.some((b) => b.includes("證據"))).toBe(true);
  });
  it("blocks do_not_contact regardless of evidence", () => {
    const r = checkColdGate({ do_not_contact: true }, 2);
    expect(r.status).toBe("block");
    expect(r.blockers.some((b) => b.includes("do_not_contact"))).toBe(true);
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
