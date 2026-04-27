import type { IncidentDraft, IncidentSeverity, IncidentSnapshot, IncidentTransition } from "./types";

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function maxSeverity(a: IncidentSeverity | undefined, b: IncidentSeverity): IncidentSeverity {
  if (!a) return b;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function computeTransition(existing: IncidentSnapshot | null, draft: IncidentDraft): IncidentTransition {
  if (!existing) return { kind: "new" };

  if (existing.status === "resolved" || existing.status === "ignored") {
    return { kind: "reopened", prevStatus: existing.status };
  }

  if (SEVERITY_RANK[draft.severity] > SEVERITY_RANK[existing.severity]) {
    return {
      kind: "severity_escalated",
      prevSeverity: existing.severity,
      newSeverity: draft.severity,
    };
  }

  return {
    kind: "duplicate",
    prevSeverity: existing.severity,
    prevStatus: existing.status,
  };
}
