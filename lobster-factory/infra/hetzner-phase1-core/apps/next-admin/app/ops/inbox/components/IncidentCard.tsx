import Link from "next/link";
import type { Incident } from "@/lib/ops-inbox/types";
import { OpenInCursorButton } from "./OpenInCursorButton";

const SOURCE_LABEL: Record<string, string> = {
  sentry: "Sentry",
  uptime_kuma: "Uptime",
  grafana: "Grafana",
  netdata: "Netdata",
  posthog: "PostHog",
};

const SOURCE_COLOR: Record<string, { bg: string; text: string }> = {
  sentry: { bg: "#f3f0ff", text: "#6d28d9" },
  uptime_kuma: { bg: "#e0f2fe", text: "#0369a1" },
  grafana: { bg: "#fff7ed", text: "#c2410c" },
  netdata: { bg: "#fefce8", text: "#a16207" },
  posthog: { bg: "#fdf4ff", text: "#86198f" },
};

const SEV_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#0284c7",
};

const SEV_BG: Record<string, string> = {
  critical: "#fef2f2",
  high: "#fff7ed",
  medium: "#fefce8",
  low: "#f0f9ff",
};

export function IncidentCard({ incident, canAct }: { incident: Incident; canAct: boolean }) {
  const sevColor = SEV_COLOR[incident.severity] ?? "#64748b";
  const sevBg = SEV_BG[incident.severity] ?? "#f8fafc";
  const src = SOURCE_COLOR[incident.source] ?? { bg: "#f1f5f9", text: "#475569" };
  const aiSummary = incident.ai_diagnoses?.find((d) => d.role === "auto-classify")?.summary;
  const isResolved = incident.status === "resolved";
  const isIgnored = incident.status === "ignored";

  return (
    <article
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
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

          {/* Source badge */}
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

          {/* Service */}
          {incident.service && (
            <span style={{ fontSize: 12, color: "#64748b" }}>{incident.service}</span>
          )}

          {/* Environment */}
          {incident.environment !== "production" && (
            <span
              style={{
                fontSize: 11,
                color: "#6366f1",
                background: "#eef2ff",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              {incident.environment}
            </span>
          )}

          {/* Status (non-open) */}
          {isResolved && (
            <span style={{ fontSize: 11, color: "#16a34a", background: "#dcfce7", padding: "1px 6px", borderRadius: 4 }}>
              resolved
            </span>
          )}
          {isIgnored && (
            <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>
              ignored
            </span>
          )}

          {/* Time */}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
            {timeAgo(incident.last_seen_at)}
          </span>
        </div>

        {/* Title */}
        <Link
          href={`/ops/inbox/${incident.id}`}
          style={{ color: "#0f172a", textDecoration: "none", display: "block", marginBottom: aiSummary ? 8 : 6 }}
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

        {/* AI summary */}
        {aiSummary && (
          <div
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              color: "#0369a1",
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            {incident.occurrence_count} occurrence{incident.occurrence_count !== 1 ? "s" : ""}
          </span>
          <OpenInCursorButton incident={incident} primary={false} />
          {canAct && (
            <Link
              href={`/ops/inbox/${incident.id}`}
              style={{ fontSize: 12, color: "#6366f1", textDecoration: "none", fontWeight: 500 }}
            >
              Details →
            </Link>
          )}
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
