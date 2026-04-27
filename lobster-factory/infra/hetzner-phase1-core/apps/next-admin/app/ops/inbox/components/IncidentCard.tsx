import Link from "next/link";
import type { Incident } from "@/lib/ops-inbox/types";
import { OpenInCursorButton } from "./OpenInCursorButton";

export function IncidentCard({ incident, canAct }: { incident: Incident; canAct: boolean }) {
  const sevColor = `var(--severity-${incident.severity})`;
  const aiSummary = incident.ai_diagnoses?.find((d) => d.role === "auto-classify")?.summary;

  return (
    <article
      style={{
        background: "var(--bg-card)",
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        borderLeft: `4px solid ${sevColor}`,
        padding: 16,
        opacity: incident.status === "resolved" ? 0.5 : incident.status === "ignored" ? 0.3 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: sevColor, fontWeight: 600, textTransform: "uppercase" }}>{incident.severity}</span>
        <span>· {incident.source}</span>
        <span>· {incident.service ?? "(host-level)"}</span>
        <span>· {incident.environment}</span>
        <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>{timeAgo(incident.last_seen_at)}</span>
      </div>
      <Link href={`/ops/inbox/${incident.id}`} style={{ color: "var(--text-primary)", textDecoration: "none" }}>
        <h3 style={{ margin: 0, marginBottom: 8 }}>{incident.title}</h3>
      </Link>
      {aiSummary && (
        <div style={{ background: "var(--ai-bg)", color: "var(--ai-text)", padding: 8, borderRadius: 8, fontSize: 13, marginBottom: 8 }}>✨ {aiSummary}</div>
      )}
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Occurrences: {incident.occurrence_count}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <OpenInCursorButton incident={incident} primary />
        {canAct && (
          <Link href={`/ops/inbox/${incident.id}`} style={{ alignSelf: "center", fontSize: 12 }}>
            Details →
          </Link>
        )}
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
