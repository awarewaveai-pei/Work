import type { IncidentDraft, IncidentEnvironment, IncidentSeverity } from "../types";
import { kumaHostnameToService, kumaMonitorNameToService } from "../registry/sourceMapping";

const KUMA_STATUS = { DOWN: 0, UP: 1, PENDING: 2, MAINTENANCE: 3 } as const;

export function normalizeUptimeKuma(raw: any): IncidentDraft {
  const monitor = raw?.monitor ?? {};
  const heartbeat = raw?.heartbeat ?? {};
  const tags: Array<{ name: string; value: string }> = monitor.tags ?? [];

  const isDown = heartbeat.status === KUMA_STATUS.DOWN;
  const certExpiringSoon = /cert.*expire/i.test(heartbeat.msg ?? "");

  const envTag = tags.find((t) => t.name === "env")?.value;
  const environment: IncidentEnvironment =
    envTag === "staging" ? "staging" : envTag === "development" ? "development" : /staging\./i.test(monitor.hostname ?? "") ? "staging" : "production";

  const severity: IncidentSeverity = certExpiringSoon ? "low" : isDown ? (environment === "production" ? "critical" : "medium") : "low";

  const serviceTag = tags.find((t) => t.name === "service")?.value;
  const service =
    (serviceTag as any) ??
    kumaHostnameToService(monitor.hostname) ??
    kumaHostnameToService(monitor.url) ??
    kumaMonitorNameToService(monitor.name);

  const title = isDown ? `Uptime: ${monitor.name} is DOWN` : `Uptime: ${monitor.name} ${heartbeat.msg ?? "event"}`;

  return {
    source: "uptime_kuma",
    external_id: String(monitor.id ?? Date.now()),
    fingerprint: "",
    signal_type: "uptime",
    severity,
    service,
    environment,
    title,
    message: heartbeat.msg ?? null,
    raw,
    tags: { kuma_type: monitor.type, kuma_url: monitor.url, hostname: monitor.hostname },
  };
}
