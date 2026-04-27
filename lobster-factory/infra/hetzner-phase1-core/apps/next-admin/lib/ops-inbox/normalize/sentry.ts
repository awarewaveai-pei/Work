import type { IncidentDraft, IncidentEnvironment, IncidentSeverity } from "../types";
import { sentryProjectSlugToService } from "../registry/sourceMapping";

export function normalizeSentry(raw: any): IncidentDraft {
  const issue = raw?.data?.issue ?? {};
  const event = raw?.data?.event ?? raw?.event ?? {};
  const projectSlug: string | undefined = raw?.data?.project_slug ?? raw?.project_slug;

  const level: string = event.level ?? issue.level ?? "error";
  const severity: IncidentSeverity =
    level === "fatal" ? "critical" : level === "error" ? "high" : level === "warning" ? "medium" : "low";

  const envRaw: string = event.environment ?? raw?.data?.environment ?? "production";
  const environment: IncidentEnvironment =
    envRaw === "staging" ? "staging" : envRaw === "development" ? "development" : "production";

  const title: string = issue.title ?? event.title ?? raw?.message ?? "Sentry event";
  const message: string | null = event.message ?? issue.culprit ?? null;
  const externalId: string = String(issue.id ?? event.event_id ?? Date.now());

  return {
    source: "sentry",
    external_id: externalId,
    fingerprint: "",
    signal_type: "error",
    severity,
    service: sentryProjectSlugToService(projectSlug),
    environment,
    title,
    message,
    raw,
    tags: { sentry_level: level, project_slug: projectSlug ?? null },
  };
}
