import { createHash } from "node:crypto";
import type { IncidentSource, IncidentSignalType } from "./types";

export function computeFingerprint(args: {
  source: IncidentSource;
  service: string | null;
  signal_type: IncidentSignalType;
  title: string;
  raw: unknown;
}): string {
  const sourceFp = sourceSpecificFingerprint(args);
  if (sourceFp) return sourceFp;

  const normTitle = args.title
    .replace(/\b[0-9a-f]{8,}\b/gi, "<hex>")
    .replace(/\b\d{2,}\b/g, "<n>")
    .replace(/['"`].*?['"`]/g, "<str>")
    .toLowerCase()
    .trim();
  return sha256(`${args.source}|${args.service ?? "_"}|${args.signal_type}|${normTitle}`);
}

function sourceSpecificFingerprint(args: { source: IncidentSource; raw: unknown }): string | null {
  const raw = args.raw as Record<string, any>;
  switch (args.source) {
    case "sentry":
      return raw?.data?.issue?.id ? sha256(`sentry:${raw.data.issue.id}`) : null;
    case "grafana":
      return raw?.alerts?.[0]?.fingerprint ? sha256(`grafana:${raw.alerts[0].fingerprint}`) : null;
    case "uptime_kuma":
      return raw?.monitor?.id ? sha256(`kuma:${raw.monitor.id}:${raw.monitor?.type ?? "http"}`) : null;
    case "netdata": {
      // 2026-05-23: Use `raw.name` (stable metric name, e.g. "system_post_update_reboot_status")
      // as primary key instead of `raw.alarm` (label text containing value, e.g. "... = 1 status").
      // Reason: alarm label changes between WARNING/CLEAR transitions, breaking dedup +
      // preventing auto-resolve. `name` is the netdata internal metric ID — stable across
      // status transitions. Fallback chain: name → alarm_id → alarm (last-resort).
      // Migration: existing rows with old fingerprint stay until backfilled
      // (see WORKLOG 2026-05-23 §B-Minimal residual risk closure).
      const stableKey = raw?.name || raw?.alarm_id || raw?.alarm;
      return raw?.host && stableKey ? sha256(`netdata:${raw.host}:${stableKey}`) : null;
    }
    case "posthog":
      return raw?.alert_id ? sha256(`posthog:${raw.alert_id}`) : null;
    default:
      return null;
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
