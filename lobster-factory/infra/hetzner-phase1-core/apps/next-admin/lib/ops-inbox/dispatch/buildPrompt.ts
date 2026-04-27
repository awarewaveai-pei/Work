import type { Incident } from "@/lib/ops-inbox/types";

export function buildIncidentPrompt(incident: Incident, _target: "cursor" | "chat" | "remote-ui"): string {
  const lines = [
    "Incident from Ops Inbox",
    "",
    `Source: ${incident.source}`,
    `Service: ${incident.service ?? "(host-level)"}`,
    `Environment: ${incident.environment}`,
    `Severity: ${incident.severity}`,
    `Title: ${incident.title}`,
    incident.message ? `Message: ${incident.message}` : "",
    `Occurrences: ${incident.occurrence_count}`,
    "",
    "Raw (redacted):",
    "```json",
    JSON.stringify(incident.raw, null, 2),
    "```",
  ];
  return lines.filter(Boolean).join("\n");
}
