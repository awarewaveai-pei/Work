import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canApprovePolicy,
  needsGitHubIssue,
  policyCatalogForSource,
  policyForIncident,
  REPAIR_SOURCE_POLICIES,
  repairPolicyLabel,
  severityRequiresHumanReview,
} from "../policy";

describe("REPAIR_SOURCE_POLICIES", () => {
  // Was "covers all 7 sources" with the list typed out: a copy of IncidentSource that broke the day a
  // source was added (site_watch, 0091), while the real completeness check is the `satisfies
  // Record<IncidentSource, …>` in policy.ts. The runtime SSOT for which sources can exist is the
  // database: the LAST migration that redefines ops_incidents_source_check.
  it("has a policy for every source the database accepts", () => {
    const dir = path.resolve(__dirname, "../../..", "../../../../packages/db/migrations");
    let allowed: string[] | null = null;
    for (const f of readdirSync(dir).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort()) {
      const m = /ops_incidents_source_check\s+CHECK\s*\(\s*source\s+IN\s*\(([^)]*)\)/i.exec(readFileSync(path.join(dir, f), "utf8"));
      if (m) allowed = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    }
    expect(allowed, "no ops_incidents_source_check found in migrations").not.toBeNull();
    const sources = REPAIR_SOURCE_POLICIES.map((p) => p.source as string);
    expect(sources).toContain("site_watch");
    expect(sources.filter((s) => !allowed!.includes(s))).toEqual([]);
    // Known drift (SITE_WATCH_MASTER_PLAN §6.2 R3): lib/collect/report-store.ts writes source
    // 'collection' around the IncidentSource type, so it has no policy yet. Fixing R3 = add it to
    // the type and the catalog, then drop it here.
    expect(allowed!.filter((s) => !sources.includes(s))).toEqual(["collection"]);
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
  it("deploy → human_only", () => expect(policyCatalogForSource("deploy").policy).toBe("human_only"));
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

  it("deploy always returns human_only (operational event, repair center does not intervene)", () => {
    for (const s of severities) expect(policyForIncident("deploy", s)).toBe("human_only");
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

describe("can_escalate_to_pr", () => {
  it("uptime_kuma can escalate to PR after confirmed code regression", () =>
    expect(policyCatalogForSource("uptime_kuma").can_escalate_to_pr).toBe(true));
  it("grafana can escalate to PR after confirmed code regression", () =>
    expect(policyCatalogForSource("grafana").can_escalate_to_pr).toBe(true));
  it("posthog cannot escalate — business signal, not code bug", () =>
    expect(policyCatalogForSource("posthog").can_escalate_to_pr).toBe(false));
  it("netdata cannot escalate — infra layer, code fix won't help", () =>
    expect(policyCatalogForSource("netdata").can_escalate_to_pr).toBe(false));
  it("manual cannot auto-escalate", () =>
    expect(policyCatalogForSource("manual").can_escalate_to_pr).toBe(false));
  it("deploy cannot auto-escalate — operational event, not code regression", () =>
    expect(policyCatalogForSource("deploy").can_escalate_to_pr).toBe(false));
});

describe("severityRequiresHumanReview", () => {
  it("critical → true (any source, needs_human_review forced)", () =>
    expect(severityRequiresHumanReview("critical")).toBe(true));
  it("high → false", () => expect(severityRequiresHumanReview("high")).toBe(false));
  it("medium → false", () => expect(severityRequiresHumanReview("medium")).toBe(false));
  it("low → false", () => expect(severityRequiresHumanReview("low")).toBe(false));
});
