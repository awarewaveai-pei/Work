import { createHash, createHmac } from "node:crypto";
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

// M4 (auto-repair audit 2026-05-23 §M4): fingerprint forgery hardening.
//
// computeFingerprint() above derives entirely from attacker-controllable fields
// (issue.id / monitor.id / alert_id), so an attacker who has a (per-source) token
// can pre-compute a fingerprint and seed a fake incident — a later real alert then
// dedups into the seeded row and is silently downgraded to "duplicate".
//
// computeFingerprintV2 salts the existing fingerprint with a server-only secret:
//   v2 = sha256(salt + ":" + v1)
// The attacker still knows v1 (it is derived from the payload) but cannot predict v2
// without the salt, so cross-fingerprint collision-seeding becomes infeasible.
//
// computeFingerprint() is intentionally LEFT UNCHANGED — it remains the live dedup
// key (the ops_incidents (fingerprint, environment) unique + RPC ON CONFLICT target).
// v2 is written to a parallel column (migration 0036) and only becomes the dedup key
// in a later migration, so adding this function changes no live behaviour. When the
// salt is unset, v2 === v1 (harmless: the new column simply mirrors the old one).
export function computeFingerprintV2(args: {
  source: IncidentSource;
  service: string | null;
  signal_type: IncidentSignalType;
  title: string;
  raw: unknown;
}): string {
  const v1 = computeFingerprint(args);
  const salt = process.env.OPS_INBOX_FINGERPRINT_SALT?.trim();
  if (!salt) return v1;
  // HMAC-SHA256 (RFC 2104) — NOT sha256(salt + v1). The latter is a secret-prefix MAC,
  // the length-extension-prone construction HMAC exists to replace. v2 is destined to
  // become the dedup key (later migration); once it is, an attacker who can submit
  // incidents and observe dedup behaviour gains a distinguishing oracle on v2. Use the
  // correct keyed-hash primitive now — switching later would force a full re-key backfill.
  return createHmac("sha256", salt).update(v1).digest("hex");
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
