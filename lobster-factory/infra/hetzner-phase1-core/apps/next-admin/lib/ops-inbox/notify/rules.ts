import type { Incident, IncidentTransition, NotificationRule } from "../types";

/**
 * Slack (and future notifiers) honor this gate:
 * - Explicit `OPS_INBOX_NOTIFY_ENABLED=false` (or 0/no/off) → off
 * - Explicit `true` → on
 * - Unset/empty → on **if** `OPS_INBOX_SLACK_INCIDENTS_WEBHOOK` is set (avoids "webhook configured but zero messages")
 * - Otherwise off
 */
export function isOpsInboxNotifyGloballyEnabled(): boolean {
  const raw = process.env.OPS_INBOX_NOTIFY_ENABLED?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  return Boolean(process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK?.trim());
}

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
const CRITICAL_THROTTLE_WINDOW_MS = 3 * 60 * 1000;

export function decideNotification(args: DecideArgs): Decision {
  const { incident, transition, now } = args;

  if (!isOpsInboxNotifyGloballyEnabled()) return { shouldSend: false, reason: "globally_disabled" };
  if (incident.environment === "development") return { shouldSend: false, reason: "env_development" };
  if (incident.status === "ignored") return { shouldSend: false, reason: "status_ignored" };
  // Deploy events: VPS auto-deploy script sends Telegram/Slack directly to avoid double-notification.
  if (incident.source === "deploy") return { shouldSend: false, reason: "deploy_direct_notify" };
  // Site-watch owns its Telegram delivery state (lib/site-watch/notify.ts): one alert + one recovery
  // per episode, resumed from DB state. A dispatcher send would be a second, untracked copy.
  if (incident.source === "site_watch") return { shouldSend: false, reason: "site_watch_direct_notify" };

  if (transition.kind === "severity_escalated") return { shouldSend: true, rule: "severity_escalation" };
  if (transition.kind === "reopened") return { shouldSend: true, rule: "reopen" };

  if (transition.kind === "new") {
    if (incident.severity === "critical") return { shouldSend: true, rule: "critical_immediate" };
    return { shouldSend: true, rule: "new_incident_first_occurrence" };
  }

  // Repeat webhook hits same fingerprint: notify every severity, but throttle so Slack is not flooded.
  // Critical incidents use a shorter window so operators are alerted more promptly.
  if (transition.kind === "duplicate") {
    const lastSend = lastSentAt(incident);
    const windowMs = incident.severity === "critical" ? CRITICAL_THROTTLE_WINDOW_MS : THROTTLE_WINDOW_MS;
    if (lastSend && now.getTime() - lastSend.getTime() < windowMs) {
      return { shouldSend: false, reason: "within_throttle_window" };
    }
    if (incident.severity === "critical") return { shouldSend: true, rule: "critical_immediate" };
    return { shouldSend: true, rule: "duplicate_occurrence" };
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
