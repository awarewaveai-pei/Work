import { describe, expect, it } from "vitest";
import {
  canApprovePolicy,
  needsGitHubIssue,
  policyCatalogForSource,
  policyForIncident,
  REPAIR_SOURCE_POLICIES,
  repairPolicyLabel,
} from "../policy";

describe("REPAIR_SOURCE_POLICIES", () => {
  it("covers all 6 sources", () => {
    const sources = REPAIR_SOURCE_POLICIES.map((p) => p.source);
    expect(sources).toContain("sentry");
    expect(sources).toContain("uptime_kuma");
    expect(sources).toContain("grafana");
    expect(sources).toContain("posthog");
    expect(sources).toContain("netdata");
    expect(sources).toContain("manual");
    expect(sources).toHaveLength(6);
  });

  it("every entry has non-empty rationale", () => {
    for (const p of REPAIR_SOURCE_POLICIES) {
      expect(p.rationale.length, `${p.source} rationale empty`).toBeGreaterThan(0);
    }
  });
});

describe("policyCatalogForSource", () => {
  it("sentry → auto_repair", () => expect(policyCatalogForSource("sentry").policy).toBe("auto_repair"));
  it("uptime_kuma → analysis_only", () => expect(policyCatalogForSource("uptime_kuma").policy).toBe("analysis_only"));
  it("grafana → analysis_only", () => expect(policyCatalogForSource("grafana").policy).toBe("analysis_only"));
  it("posthog → analysis_only", () => expect(policyCatalogForSource("posthog").policy).toBe("analysis_only"));
  it("netdata → human_only", () => expect(policyCatalogForSource("netdata").policy).toBe("human_only"));
  it("manual → triage_needed", () => expect(policyCatalogForSource("manual").policy).toBe("triage_needed"));
});

describe("policyForIncident", () => {
  const severities = ["low", "medium", "high", "critical"] as const;

  it("sentry always returns auto_repair regardless of severity", () => {
    for (const s of severities) expect(policyForIncident("sentry", s)).toBe("auto_repair");
  });

  it("uptime_kuma always returns analysis_only", () => {
    for (const s of severities) expect(policyForIncident("uptime_kuma", s)).toBe("analysis_only");
  });

  it("grafana always returns analysis_only", () => {
    for (const s of severities) expect(policyForIncident("grafana", s)).toBe("analysis_only");
  });

  it("posthog always returns analysis_only", () => {
    for (const s of severities) expect(policyForIncident("posthog", s)).toBe("analysis_only");
  });

  it("netdata always returns human_only", () => {
    for (const s of severities) expect(policyForIncident("netdata", s)).toBe("human_only");
  });

  it("manual always returns triage_needed regardless of severity", () => {
    for (const s of severities) expect(policyForIncident("manual", s)).toBe("triage_needed");
  });

  it("manual critical → triage_needed (high-severity manual still needs triage)", () => {
    expect(policyForIncident("manual", "critical")).toBe("triage_needed");
  });
});

describe("canApprovePolicy", () => {
  it("auto_repair → true (can be approved and executed)", () => expect(canApprovePolicy("auto_repair")).toBe(true));
  it("analysis_only → true (can be approved for analysis run)", () => expect(canApprovePolicy("analysis_only")).toBe(true));
  it("triage_needed → true (can be approved after triage)", () => expect(canApprovePolicy("triage_needed")).toBe(true));
  it("human_only → false (must not enter automated approval flow)", () => expect(canApprovePolicy("human_only")).toBe(false));
});

describe("needsGitHubIssue", () => {
  it("auto_repair → true", () => expect(needsGitHubIssue("auto_repair")).toBe(true));
  it("analysis_only → true", () => expect(needsGitHubIssue("analysis_only")).toBe(true));
  it("triage_needed → true", () => expect(needsGitHubIssue("triage_needed")).toBe(true));
  it("human_only → false (operator handles directly, no automated Issue)", () => expect(needsGitHubIssue("human_only")).toBe(false));
});

describe("repairPolicyLabel", () => {
  it("auto_repair → 可自動修復", () => expect(repairPolicyLabel("auto_repair")).toBe("可自動修復"));
  it("analysis_only → 僅分析", () => expect(repairPolicyLabel("analysis_only")).toBe("僅分析"));
  it("human_only → 人工處理", () => expect(repairPolicyLabel("human_only")).toBe("人工處理"));
  it("triage_needed → 需分流", () => expect(repairPolicyLabel("triage_needed")).toBe("需分流"));
});
