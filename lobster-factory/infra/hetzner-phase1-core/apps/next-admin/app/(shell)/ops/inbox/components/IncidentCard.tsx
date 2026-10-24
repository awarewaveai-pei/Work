import Link from "next/link";
import type { Incident } from "@/lib/ops-inbox/types";
import { OpenInCursorButton } from "./OpenInCursorButton";
import { StatusActions } from "./StatusActions";

const SOURCE_LABEL: Record<string, string> = {
  sentry: "Sentry",
  uptime_kuma: "Uptime Kuma",
  grafana: "Grafana",
  netdata: "Netdata",
  posthog: "PostHog",
  site_watch: "網站巡檢",
  schedule: "排程工作",
  payments: "付款",
};

const SOURCE_COLOR: Record<string, { bg: string; text: string }> = {
  sentry: { bg: "#f3f0ff", text: "#6d28d9" },
  uptime_kuma: { bg: "#e0f2fe", text: "#0369a1" },
  grafana: { bg: "#fff7ed", text: "#c2410c" },
  netdata: { bg: "#fefce8", text: "#a16207" },
  posthog: { bg: "#fdf4ff", text: "#86198f" },
  site_watch: { bg: "#ecfdf5", text: "#047857" },
  schedule: { bg: "#f1f5f9", text: "#334155" },
  payments: { bg: "#fef2f2", text: "#b91c1c" },
};

const SEV_COLOR: Record<string, string> = {
  critical: "var(--severity-critical)",
  high: "var(--severity-high)",
  medium: "var(--severity-medium)",
  low: "var(--severity-low)",
};

const SEV_BG: Record<string, string> = {
  critical: "var(--badge-red-bg)",
  high: "var(--build-risk-medium-bg)",
  medium: "var(--build-risk-medium-bg)",
  low: "var(--ai-bg)",
};

function getSourceUrl(incident: Incident): string | null {
  const r = incident.raw as any;
  switch (incident.source) {
    case "sentry":
      return r?.data?.url ?? r?.url ?? r?.event?.web_url ?? null;
    case "uptime_kuma":
      return "https://uptime.aware-wave.com";
    case "grafana":
      return r?.alerts?.[0]?.generatorURL ?? r?.externalURL ?? "https://grafana.aware-wave.com";
    case "netdata":
      return r?.alarm_url ?? "https://app.netdata.cloud";
    case "posthog":
      return "https://us.posthog.com";
    case "site_watch":
      return incident.client_slug ? `/ops/clients/${incident.client_slug}` : null;
    case "schedule":
      return "/ops/schedules";
    case "payments":
      return "/ops/billing";
    default:
      return null;
  }
}

const SIGNAL_LABEL: Record<string, string> = {
  error: "Error",
  uptime: "Uptime",
  latency: "Latency",
  resource: "Resource",
  business: "Business",
  deployment: "Deploy",
};

const SIGNAL_COLOR: Record<string, { bg: string; text: string }> = {
  error: { bg: "var(--badge-red-bg)", text: "var(--badge-red-text)" },
  uptime: { bg: "var(--badge-green-bg)", text: "var(--badge-green-text)" },
  latency: { bg: "var(--ai-bg)", text: "var(--accent)" },
  resource: { bg: "var(--build-risk-medium-bg)", text: "var(--build-risk-medium-text)" },
  business: { bg: "var(--badge-green-bg)", text: "var(--badge-green-text)" },
  deployment: { bg: "var(--ai-bg)", text: "var(--severity-low)" },
};

export function IncidentCard({ incident, canAct }: { incident: Incident; canAct: boolean }) {
  const sevColor = SEV_COLOR[incident.severity] ?? "var(--text-muted)";
  const sevBg = SEV_BG[incident.severity] ?? "var(--bg-subtle)";
  const src = SOURCE_COLOR[incident.source] ?? { bg: "var(--badge-gray-bg)", text: "var(--badge-gray-text)" };
  const sig = SIGNAL_COLOR[incident.signal_type] ?? { bg: "var(--badge-gray-bg)", text: "var(--badge-gray-text)" };
  const aiSummary = incident.ai_diagnoses?.find((d) => d.role === "auto-classify")?.summary;
  const isResolved = incident.status === "resolved";
  const isIgnored = incident.status === "ignored";
  const sourceUrl = getSourceUrl(incident);
  const msgPreview = incident.message?.slice(0, 120);

  return (
    <article
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${sevColor}`,
        borderRadius: 10,
        padding: "14px 18px",
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        opacity: isIgnored ? 0.4 : isResolved ? 0.65 : 1,
        transition: "box-shadow 0.15s",
        boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.04)",
      }}
    >
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Meta row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
          {/* Severity badge */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 7px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: sevBg,
              color: sevColor,
              border: `1px solid ${sevColor}33`,
            }}
          >
            {incident.severity}
          </span>

          {/* Signal type badge */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 7px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              background: sig.bg,
              color: sig.text,
            }}
          >
            {SIGNAL_LABEL[incident.signal_type] ?? incident.signal_type}
          </span>

          {/* Source badge — clickable if we have a URL */}
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 7px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                background: src.bg,
                color: src.text,
                textDecoration: "none",
                gap: 3,
              }}
            >
              {SOURCE_LABEL[incident.source] ?? incident.source}
              <span style={{ opacity: 0.6, fontSize: 9 }}>↗</span>
            </a>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 7px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                background: src.bg,
                color: src.text,
              }}
            >
              {SOURCE_LABEL[incident.source] ?? incident.source}
            </span>
          )}

          {/* Service or host context */}
          {incident.service ? (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{incident.service}</span>
          ) : incident.source === "netdata" && (incident.tags as any)?.host ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--build-risk-medium-text)",
                background: "var(--build-risk-medium-bg)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              {(incident.tags as any).host === "sg" ? "SG Server" : "EU Server"}
            </span>
          ) : incident.source === "uptime_kuma" && (incident.tags as any)?.hostname ? (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace" }}>
              {String((incident.tags as any).hostname).replace(/^https?:\/\//, "").split("/")[0]}
            </span>
          ) : null}

          {/* Environment */}
          {incident.environment !== "production" && (
            <span
              style={{
                fontSize: 11,
                color: "var(--ai-text)",
                background: "var(--ai-bg)",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              {incident.environment}
            </span>
          )}

          {/* Status (non-open) */}
          {isResolved && (
            <span style={{ fontSize: 11, color: "var(--status-resolved)", background: "var(--badge-green-bg)", padding: "1px 6px", borderRadius: 4 }}>
              已解決
            </span>
          )}
          {isIgnored && (
            <span style={{ fontSize: 11, color: "var(--status-ignored)", background: "var(--badge-gray-bg)", padding: "1px 6px", borderRadius: 4 }}>
              已忽略
            </span>
          )}

          {/* Time */}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {timeAgo(incident.last_seen_at)}
          </span>
        </div>

        {/* Title */}
        <Link
          href={`/ops/inbox/${incident.id}`}
          style={{ color: "var(--text-primary)", textDecoration: "none", display: "block", marginBottom: aiSummary ? 8 : 6 }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.4,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {incident.title}
          </h3>
        </Link>

        {/* Message preview */}
        {!aiSummary && msgPreview && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              lineHeight: 1.5,
              marginBottom: 8,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            } as React.CSSProperties}
          >
            {msgPreview}{incident.message && incident.message.length > 120 ? "…" : ""}
          </div>
        )}

        {/* AI summary */}
        {aiSummary && (
          <div
            style={{
              background: "var(--ai-bg)",
              border: "1px solid var(--severity-low)",
              color: "var(--ai-text)",
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 12,
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            ✨ {aiSummary}
          </div>
        )}

        {/* Footer meta */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {incident.occurrence_count} occurrence{incident.occurrence_count !== 1 ? "s" : ""}
          </span>
          <OpenInCursorButton incident={incident} primary={false} />
          <Link
            href={`/ops/inbox/${incident.id}`}
            style={{ fontSize: 12, color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}
          >
            詳情 →
          </Link>
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--bg-subtle)", width: "100%" }}>
          <StatusActions incidentId={incident.id} status={incident.status} canAct={canAct} />
        </div>
      </div>
    </article>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
