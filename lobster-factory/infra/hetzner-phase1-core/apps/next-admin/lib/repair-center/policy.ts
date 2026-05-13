import type { IncidentSeverity, IncidentSource } from "@/lib/ops-inbox/types";
import type { RepairPolicy } from "./types";

export interface RepairSourcePolicy {
  source: IncidentSource;
  label: string;
  policy: RepairPolicy;
  family: "code_exception" | "availability_slo" | "infrastructure" | "product_behavior" | "manual";
  rationale: string;
}

const REPAIR_SOURCE_POLICY_BY_SOURCE = {
  sentry: {
    source: "sentry",
    label: "Sentry",
    policy: "auto_repair",
    family: "code_exception",
    rationale: "Stack traces and file context can produce bounded code PRs after backup and approval.",
  },
  uptime_kuma: {
    source: "uptime_kuma",
    label: "Uptime Kuma",
    policy: "analysis_only",
    family: "availability_slo",
    rationale: "Availability failures may be code, DNS, DB, nginx, capacity, or deploy drift.",
  },
  grafana: {
    source: "grafana",
    label: "Grafana",
    policy: "analysis_only",
    family: "availability_slo",
    rationale: "Latency, logs, and SLO alerts need triage before a code-scoped PR is safe.",
  },
  posthog: {
    source: "posthog",
    label: "PostHog",
    policy: "analysis_only",
    family: "product_behavior",
    rationale: "Business and funnel anomalies are evidence, not direct proof of a code bug.",
  },
  netdata: {
    source: "netdata",
    label: "Netdata",
    policy: "human_only",
    family: "infrastructure",
    rationale: "Host resources and container health usually require operator or infrastructure action.",
  },
  manual: {
    source: "manual",
    label: "Manual",
    policy: "triage_needed",
    family: "manual",
    rationale: "Manual incidents need an operator to classify owner boundary before automation.",
  },
} satisfies Record<IncidentSource, RepairSourcePolicy>;

export const REPAIR_SOURCE_POLICIES: RepairSourcePolicy[] = Object.values(REPAIR_SOURCE_POLICY_BY_SOURCE);

export function policyCatalogForSource(source: IncidentSource): RepairSourcePolicy {
  return REPAIR_SOURCE_POLICY_BY_SOURCE[source];
}

export function policyForIncident(source: IncidentSource, severity: IncidentSeverity): RepairPolicy {
  const catalogPolicy = policyCatalogForSource(source).policy;
  if (catalogPolicy !== "triage_needed") return catalogPolicy;
  if (severity === "critical") return "triage_needed";
  return source === "manual" ? "triage_needed" : "human_only";
}

export function repairPolicyLabel(policy: RepairPolicy): string {
  if (policy === "auto_repair") return "Auto-repair";
  if (policy === "analysis_only") return "Analysis-only";
  if (policy === "human_only") return "Human-only";
  return "Triage needed";
}

export function canApprovePolicy(policy: RepairPolicy): boolean {
  return policy === "auto_repair" || policy === "analysis_only" || policy === "triage_needed";
}

export function needsGitHubIssue(policy: RepairPolicy): boolean {
  return policy === "auto_repair" || policy === "analysis_only" || policy === "triage_needed";
}
