import type { IncidentDraft, IncidentEnvironment, IncidentSeverity, IncidentSignalType } from "../types";

export function normalizeGrafana(raw: any): IncidentDraft {
  const alert = raw?.alerts?.[0] ?? {};
  const labels: Record<string, string> = alert.labels ?? {};
  const annotations: Record<string, string> = alert.annotations ?? {};

  const severity: IncidentSeverity =
    labels.severity === "critical" || labels.severity === "high" || labels.severity === "medium" || labels.severity === "low"
      ? (labels.severity as IncidentSeverity)
      : "medium";

  const env = labels.environment;
  const environment: IncidentEnvironment = env === "staging" ? "staging" : env === "development" ? "development" : "production";

  const ann = (annotations.summary ?? annotations.description ?? "").toLowerCase();
  const signal_type: IncidentSignalType = /latency|p95|p99/.test(ann)
    ? "latency"
    : /cpu|mem|disk|load/.test(ann)
      ? "resource"
      : /uptime|down|reachab/.test(ann)
        ? "uptime"
        : /deploy|rollout/.test(ann)
          ? "deployment"
          : "error";

  const title = annotations.summary ?? labels.alertname ?? "Grafana alert";

  return {
    source: "grafana",
    external_id: alert.fingerprint ?? `${labels.alertname}:${alert.startsAt}`,
    fingerprint: "",
    signal_type,
    severity,
    service: labels.service ?? null,
    environment,
    title,
    message: annotations.description ?? null,
    raw,
    tags: { ...labels },
  };
}
