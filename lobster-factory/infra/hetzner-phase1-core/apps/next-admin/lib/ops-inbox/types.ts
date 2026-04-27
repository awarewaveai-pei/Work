export type IncidentSource = "sentry" | "uptime_kuma" | "grafana" | "netdata" | "posthog" | "manual";

export type IncidentSignalType = "error" | "uptime" | "latency" | "resource" | "business" | "deployment";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentStatus = "open" | "investigating" | "resolved" | "ignored";

export type IncidentEnvironment = "development" | "staging" | "production";

export interface AiDiagnosis {
  provider: "gemini" | "chatgpt" | "claude" | "cursor" | "other";
  model?: string;
  role: "auto-classify" | "diagnosis" | "rca" | "manual-paste";
  summary: string;
  tokens?: number;
  cost_usd?: number;
  created_at: string;
  created_by?: string;
}

export type NotificationStatus = "sent" | "failed" | "throttled" | "skipped";

export type NotificationRule =
  | "new_incident_first_occurrence"
  | "severity_escalation"
  | "reopen"
  | "critical_immediate"
  | "notify_skipped";

export interface NotificationLogEntry {
  channel: string;
  rule: NotificationRule;
  status: NotificationStatus;
  ts: string;
  message_ts?: string;
  reason?: string;
  error?: string;
}

export interface Incident {
  id: string;
  source: IncidentSource;
  external_id: string;
  fingerprint: string;
  signal_type: IncidentSignalType;
  severity: IncidentSeverity;
  service: string | null;
  environment: IncidentEnvironment;
  title: string;
  message: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  status: IncidentStatus;
  notes: string | null;
  due_at: string | null;
  reopen_count: number;
  resolved_at: string | null;
  resolved_by: string | null;
  ai_provider_suggested: string | null;
  ai_diagnoses: AiDiagnosis[];
  cursor_deeplink: string | null;
  notification_log: NotificationLogEntry[];
  raw: Record<string, unknown>;
  tags: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type IncidentDraft = Pick<
  Incident,
  "source" | "external_id" | "fingerprint" | "signal_type" | "severity" | "service" | "environment" | "title" | "message" | "raw" | "tags"
>;

export interface IncidentSnapshot {
  id: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  occurrence_count: number;
  reopen_count: number;
}

export type IncidentTransition =
  | { kind: "new" }
  | { kind: "duplicate"; prevSeverity: IncidentSeverity; prevStatus: IncidentStatus }
  | { kind: "severity_escalated"; prevSeverity: IncidentSeverity; newSeverity: IncidentSeverity }
  | { kind: "reopened"; prevStatus: IncidentStatus };
