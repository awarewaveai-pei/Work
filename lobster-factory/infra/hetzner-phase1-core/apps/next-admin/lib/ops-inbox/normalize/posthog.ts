import type { IncidentDraft, IncidentEnvironment, IncidentSeverity } from "../types";

export function normalizePostHog(raw: any): IncidentDraft {
  const event = raw?.event ?? {};
  const props: Record<string, unknown> = event.properties ?? {};

  const env = String(props.environment ?? "production");
  const environment: IncidentEnvironment = env === "staging" ? "staging" : env === "development" ? "development" : "production";

  const dropPct = Number(raw?.drop_percent ?? 0);
  const severity: IncidentSeverity = dropPct >= 50 ? "high" : dropPct >= 30 ? "medium" : "low";

  return {
    source: "posthog",
    external_id: String(raw?.alert_id ?? event.uuid ?? Date.now()),
    fingerprint: "",
    signal_type: "business",
    severity,
    service: (props.$service as string) ?? null,
    environment,
    title: raw?.name ?? "PostHog business alert",
    message: raw?.description ?? null,
    raw,
    tags: { alert_id: raw?.alert_id ?? null, drop_percent: dropPct },
  };
}
