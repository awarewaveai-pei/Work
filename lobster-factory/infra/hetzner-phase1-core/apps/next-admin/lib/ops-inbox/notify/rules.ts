import type { Incident, IncidentTransition, NotificationRule } from "../types";

interface DecideArgs {
  incident: Incident;
  transition: IncidentTransition;
  now: Date;
}

interface Decision {
  shouldSend: boolean;
  rule?: NotificationRule;
  reason?: string;
}

const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

export function decideNotification(args: DecideArgs): Decision {
  const { incident, transition, now } = args;

  if (process.env.OPS_INBOX_NOTIFY_ENABLED !== "true") return { shouldSend: false, reason: "globally_disabled" };
  if (incident.environment === "development") return { shouldSend: false, reason: "env_development" };
  if (incident.status === "ignored") return { shouldSend: false, reason: "status_ignored" };

  if (transition.kind === "severity_escalated") return { shouldSend: true, rule: "severity_escalation" };
  if (transition.kind === "reopened") return { shouldSend: true, rule: "reopen" };

  if (transition.kind === "new") {
    if (incident.severity === "critical") return { shouldSend: true, rule: "critical_immediate" };
    return { shouldSend: true, rule: "new_incident_first_occurrence" };
  }

  if (transition.kind === "duplicate") {
    if (incident.severity !== "critical") return { shouldSend: false, reason: "duplicate_non_critical" };
    const lastSend = lastSentAt(incident);
    if (lastSend && now.getTime() - lastSend.getTime() < THROTTLE_WINDOW_MS) {
      return { shouldSend: false, reason: "within_throttle_window" };
    }
    return { shouldSend: true, rule: "critical_immediate" };
  }

  return { shouldSend: false, reason: "unknown_transition" };
}

function lastSentAt(incident: Incident): Date | null {
  const sent = (incident.notification_log ?? [])
    .filter((e) => e.status === "sent")
    .map((e) => new Date(e.ts));
  if (!sent.length) return null;
  return sent.reduce((a, b) => (a > b ? a : b));
}
