import type { IncidentSeverity, IncidentSource } from "@/lib/ops-inbox/types";
import type { RepairPolicy } from "./types";

export function policyForIncident(source: IncidentSource, severity: IncidentSeverity): RepairPolicy {
  if (source === "sentry") return "auto_repair";
  if (source === "uptime_kuma" || source === "grafana") return "analysis_only";
  if (source === "netdata") return "human_only";
  if (severity === "critical") return "triage_needed";
  return "human_only";
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
