import { afterEach, describe, expect, it } from "vitest";
import { isResearchBridgesEnabled, researchBridgesFrozenBody, RESEARCH_BRIDGES_FROZEN } from "./research-bridges";

afterEach(() => {
  delete process.env.RESEARCH_BRIDGES_ENABLED;
});

describe("research bridges kill switch", () => {
  it("is OFF when the variable is absent (the production default since 2026-09-23)", () => {
    delete process.env.RESEARCH_BRIDGES_ENABLED;
    expect(isResearchBridgesEnabled()).toBe(false);
  });

  it("turns ON only for the exact string \"true\"", () => {
    process.env.RESEARCH_BRIDGES_ENABLED = "true";
    expect(isResearchBridgesEnabled()).toBe(true);
  });

  it("does not accept look-alikes: a typo in prod must fail closed, not re-open the bridges", () => {
    for (const v of ["TRUE", "1", "yes", "on", " true"]) {
      process.env.RESEARCH_BRIDGES_ENABLED = v;
      expect(isResearchBridgesEnabled(), `value ${JSON.stringify(v)}`).toBe(false);
    }
  });

  it("answers with a stable error code plus a human hint that names where the work moved", () => {
    const body = researchBridgesFrozenBody();
    expect(body.ok).toBe(false);
    expect(body.error).toBe(RESEARCH_BRIDGES_FROZEN);
    expect(body.hint).toContain("Cognitive OS");
    expect(body.hint).toContain("RESEARCH_LINES_MASTER_PLAN");
  });
});
