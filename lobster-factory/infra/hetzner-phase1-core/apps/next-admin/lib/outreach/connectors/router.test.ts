import { describe, it, expect } from "vitest";
import { resolveLadder, LADDERS } from "./router";
import { evaluateQuota, quotaOkFromLimits } from "./quota";
import type { ConnectorNeed, RouterContext } from "./types";

function ctx(enabled: string[], exhausted: string[] = []): RouterContext {
  return {
    enabledConnectors: new Set(enabled),
    quotaOk: (n) => !exhausted.includes(n),
  };
}

const ALL_NEEDS: ConnectorNeed[] = ["ai_generation", "email_verification", "lead_scraping", "email_sending"];

describe("Free-Plan Router — ai_generation", () => {
  it("prefers BYO Gemini when enabled + quota ok", () => {
    expect(resolveLadder("ai_generation", ctx(["gemini"])).chosen?.provider).toBe("gemini");
  });
  it("falls back to manual prompt when no connectors enabled", () => {
    const r = resolveLadder("ai_generation", ctx([]));
    expect(r.chosen?.provider).toBe("manual_prompt");
    expect(r.chosen?.kind).toBe("manual");
  });
  it("skips Gemini when its quota is exhausted", () => {
    // client gemini exhausted, agency not enabled → manual
    expect(resolveLadder("ai_generation", ctx(["gemini"], ["gemini"])).chosen?.provider).toBe("manual_prompt");
  });
  it("uses agency Gemini when client Gemini exhausted but agency enabled", () => {
    expect(resolveLadder("ai_generation", ctx(["gemini", "gemini_agency"], ["gemini"])).chosen?.provider).toBe("gemini_agency");
  });
});

describe("Free-Plan Router — email_verification", () => {
  it("prefers BYO Hunter", () => {
    expect(resolveLadder("email_verification", ctx(["hunter"])).chosen?.provider).toBe("hunter");
  });
  it("free MX/syntax fallback is always usable", () => {
    expect(resolveLadder("email_verification", ctx([])).chosen?.provider).toBe("mx_syntax");
  });
});

describe("Free-Plan Router — lead_scraping (cost-first: manual reserved-credit)", () => {
  it("manual is the first usable step even when Apify is enabled (credit reserved for high-value)", () => {
    expect(resolveLadder("lead_scraping", ctx(["apify"])).chosen?.provider).toBe("manual");
  });
});

describe("Free-Plan Router — email_sending", () => {
  it("transactional Resend is always usable as the last-resort safety net", () => {
    expect(resolveLadder("email_sending", ctx([])).chosen?.provider).toBe("resend");
  });
  it("cold Gmail chosen first when enabled", () => {
    expect(resolveLadder("email_sending", ctx(["gmail"])).chosen?.provider).toBe("gmail");
  });
});

describe("Free-Plan Router — safety net", () => {
  it("every need always resolves to a non-null chosen step", () => {
    for (const need of ALL_NEEDS) {
      expect(resolveLadder(need, ctx([])).chosen, `need=${need}`).not.toBeNull();
    }
  });
  it("every ladder ends in an always-usable (requiresConnector=false) step", () => {
    for (const need of ALL_NEEDS) {
      const last = LADDERS[need][LADDERS[need].length - 1];
      expect(last.requiresConnector, `need=${need}`).toBe(false);
    }
  });
});

describe("Quota Guard", () => {
  it("allows when no monthly limit is set", () => {
    expect(evaluateQuota({ connector_name: "gemini", monthly_limit: null, current_usage: 999, alert_threshold: 0.8 }).allowed).toBe(true);
  });
  it("blocks at/over the limit", () => {
    expect(evaluateQuota({ connector_name: "hunter", monthly_limit: 50, current_usage: 50, alert_threshold: 0.8 }).allowed).toBe(false);
  });
  it("flags nearLimit at the alert threshold", () => {
    const v = evaluateQuota({ connector_name: "hunter", monthly_limit: 50, current_usage: 40, alert_threshold: 0.8 });
    expect(v.allowed).toBe(true);
    expect(v.nearLimit).toBe(true);
  });
  it("quotaOkFromLimits wires into the router: exhausted Hunter → MX fallback", () => {
    const quotaOk = quotaOkFromLimits([{ connector_name: "hunter", monthly_limit: 50, current_usage: 50, alert_threshold: 0.8 }]);
    const r = resolveLadder("email_verification", { enabledConnectors: new Set(["hunter"]), quotaOk });
    expect(r.chosen?.provider).toBe("mx_syntax");
  });
});
