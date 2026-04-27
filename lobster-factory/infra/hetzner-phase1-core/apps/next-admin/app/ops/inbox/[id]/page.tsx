import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseReadClient } from "@/lib/supabase-server";
import { canModifyIncidentStatus, readOpsRole } from "@/lib/ops-role";
import { getService } from "@/lib/ops-inbox/registry/services";
import { OpenInCursorButton } from "../components/OpenInCursorButton";
import { OpenRemoteUIButton } from "../components/OpenRemoteUIButton";
import { RawPayloadDetails } from "../components/RawPayloadDetails";
import { StatusActions } from "../components/StatusActions";
import { AskChatGPTButton } from "../components/AskChatGPTButton";
import { AskClaudeButton } from "../components/AskClaudeButton";
import { AskGeminiButton } from "../components/AskGeminiButton";
import { PasteAiResultBox } from "../components/PasteAiResultBox";
import { AiDiagnosisTimeline } from "../components/AiDiagnosisTimeline";
import type { Incident } from "@/lib/ops-inbox/types";

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = readOpsRole(new Request("http://localhost", { headers: await headers() }));
  const canAct = canModifyIncidentStatus(role);

  const supabase = getSupabaseReadClient();
  if (!supabase) return <div>DB unavailable</div>;

  const { data: incident, error } = await supabase.from("ops_incidents").select("*").eq("id", id).single();
  if (error || !incident) return notFound();

  const inc = incident as Incident;
  const svc = getService(inc.service);

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: 24 }}>
      <nav style={{ marginBottom: 12 }}>
        <Link href="/ops/inbox">← Ops Inbox</Link> / <span>INC-{inc.id.slice(0, 8)}</span>
      </nav>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1>{inc.title}</h1>
          <div style={{ color: "var(--text-secondary)" }}>
            <SeverityChip severity={inc.severity} /> · {inc.source} · {inc.service ?? "(host-level)"} · {inc.environment} · {inc.occurrence_count}×
          </div>
        </div>
        <StatusActions incidentId={inc.id} status={inc.status} canAct={canAct} />
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 24 }}>
        <main>
          <section style={{ background: "var(--ai-bg)", color: "var(--ai-text)", padding: 16, borderRadius: 12, marginBottom: 16 }}>
            <strong>✨ Gemini auto-summary</strong>
            <p style={{ marginTop: 8 }}>
              {inc.ai_diagnoses?.find((d) => d.role === "auto-classify")?.summary ?? "（尚未分類，B-4 上線後會自動填）"}
            </p>
          </section>

          <section style={{ background: "var(--bg-card)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)" }}>
            <h3>Choose your AI</h3>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {svc?.type === "local-repo" && <OpenInCursorButton incident={inc} primary />}
              {svc?.type === "remote-ui-n8n" && <OpenRemoteUIButton incident={inc} target="n8n" primary />}
              {svc?.type === "remote-ui-supabase" && <OpenRemoteUIButton incident={inc} target="supabase" primary />}
              <AskChatGPTButton incident={inc} />
              <AskClaudeButton incident={inc} />
              <AskGeminiButton incident={inc} />
            </div>
          </section>

          <AiDiagnosisTimeline diagnoses={inc.ai_diagnoses} />
          <PasteAiResultBox incidentId={inc.id} />
          <RawPayloadDetails raw={inc.raw} />
        </main>

        <aside>
          <ServicePanel service={inc.service} svc={svc} />
          <OccurrencePanel incident={inc} />
          <NotificationLogPanel log={inc.notification_log} />
        </aside>
      </div>
    </div>
  );
}

function SeverityChip({ severity }: { severity: Incident["severity"] }) {
  const color = `var(--severity-${severity})`;
  return <span style={{ color, fontWeight: 600, textTransform: "uppercase" }}>{severity}</span>;
}

function ServicePanel({ service, svc }: { service: string | null; svc: ReturnType<typeof getService> }) {
  return (
    <div style={{ background: "var(--bg-card)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)", marginBottom: 12 }}>
      <h4>Service</h4>
      <div>{service ?? "(host-level)"}</div>
      {svc && <pre style={{ fontSize: 12, marginTop: 8 }}>{JSON.stringify(svc, null, 2)}</pre>}
    </div>
  );
}

function OccurrencePanel({ incident }: { incident: Incident }) {
  return (
    <div style={{ background: "var(--bg-card)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)", marginBottom: 12 }}>
      <h4>Occurrences</h4>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{incident.occurrence_count}×</div>
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
        First: {new Date(incident.first_seen_at).toLocaleString()}
        <br />
        Last: {new Date(incident.last_seen_at).toLocaleString()}
        <br />
        fp: {incident.fingerprint.slice(0, 8)}
      </div>
    </div>
  );
}

function NotificationLogPanel({ log }: { log: Incident["notification_log"] }) {
  if (!log?.length) return null;
  return (
    <div style={{ background: "var(--bg-card)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)" }}>
      <h4>Notify Log</h4>
      <ul style={{ fontSize: 12 }}>
        {log.map((e, i) => (
          <li key={i}>
            {e.status === "sent" ? "✓" : e.status === "skipped" ? "○" : e.status === "throttled" ? "⊘" : "✗"} {e.channel} · {e.rule}
            {e.reason && <span> ({e.reason})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
