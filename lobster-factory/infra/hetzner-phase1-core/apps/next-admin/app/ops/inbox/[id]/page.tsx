import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canModifyIncidentStatus, canApproveCommand, readOpsRole } from "@/lib/ops-role";
import { getService } from "@/lib/ops-inbox/registry/services";
import { RepairActions } from "../../repairs/RepairActions";
import { OpenInCursorButton } from "../components/OpenInCursorButton";
import { OpenRemoteUIButton } from "../components/OpenRemoteUIButton";
import { RawPayloadDetails } from "../components/RawPayloadDetails";
import { StatusActions } from "../components/StatusActions";
import { AskChatGPTButton } from "../components/AskChatGPTButton";
import { AskClaudeButton } from "../components/AskClaudeButton";
import { AskGeminiButton } from "../components/AskGeminiButton";
import { CopyForTerminalButton } from "../components/CopyForTerminalButton";
import { PasteAiResultBox } from "../components/PasteAiResultBox";
import { AiDiagnosisTimeline } from "../components/AiDiagnosisTimeline";
import type { Incident } from "@/lib/ops-inbox/types";

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = readOpsRole(new Request("http://localhost", { headers: await headers() }));
  const canAct = canModifyIncidentStatus(role);
  const canApprove = canApproveCommand(role);

  const supabase = getSupabaseServerClient();
  if (!supabase) return <div>DB unavailable</div>;

  const { data: incident, error } = await supabase.from("ops_incidents").select("*").eq("id", id).single();
  if (error || !incident) return notFound();

  const inc = incident as Incident;
  const svc = getService(inc.service);

  // P12: surface the repair link/start action on the incident detail page (was Inbox → Repair
  // one-way only). repair_runs.incident_id is UNIQUE, so at most one row.
  const { data: repairRunRow } = await supabase
    .from("repair_runs")
    .select("id,state,archived_at")
    .eq("incident_id", id)
    .maybeSingle();
  const repairRun = (repairRunRow as { id: string; state: string; archived_at: string | null } | null) ?? null;

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
          <AutoSummary incident={inc} />

          <section style={{ background: "var(--bg-card)", padding: 16, borderRadius: 12, border: "1px solid var(--border-subtle)" }}>
            <h3>Choose your AI</h3>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <OpenInCursorButton incident={inc} primary />
              {svc?.type === "remote-ui-n8n" && <OpenRemoteUIButton incident={inc} target="n8n" primary />}
              {svc?.type === "remote-ui-supabase" && <OpenRemoteUIButton incident={inc} target="supabase" primary />}
              <AskChatGPTButton incident={inc} />
              <AskClaudeButton incident={inc} />
              <AskGeminiButton incident={inc} />
              <CopyForTerminalButton incident={inc} tool="codex" />
              <CopyForTerminalButton incident={inc} tool="copilot" />
              <CopyForTerminalButton incident={inc} tool="gemini-cli" />
            </div>
          </section>

          <AiDiagnosisTimeline diagnoses={inc.ai_diagnoses} />
          <PasteAiResultBox incidentId={inc.id} />
          <RawPayloadDetails raw={inc.raw} />
        </main>

        <aside>
          <RepairPanel incident={inc} run={repairRun} canApprove={canApprove} />
          <ServicePanel service={inc.service} svc={svc} />
          <OccurrencePanel incident={inc} />
          <NotificationLogPanel log={inc.notification_log} />
        </aside>
      </div>
    </div>
  );
}

// P9 fix: was hardcoded "✨ Gemini auto-summary" even when the auto-classify provider
// was actually Claude (the primary cascade step). Read the real provider off the diagnosis.
function AutoSummary({ incident }: { incident: Incident }) {
  const dx = incident.ai_diagnoses?.find((d) => d.role === "auto-classify");
  const providerLabels: Record<string, string> = {
    gemini: "Gemini",
    claude: "Claude",
    chatgpt: "ChatGPT",
    cursor: "Cursor",
    other: "AI",
  };
  const label = dx ? providerLabels[dx.provider] ?? "AI" : "AI";
  return (
    <section style={{ background: "var(--ai-bg)", color: "var(--ai-text)", padding: 16, borderRadius: 12, marginBottom: 16 }}>
      <strong>✨ {label} auto-summary</strong>
      <p style={{ marginTop: 8 }}>{dx?.summary ?? "（尚未自動分類）"}</p>
    </section>
  );
}

// P12 fix: bidirectional Inbox ⇄ Repair Center navigation. If a repair_run already exists,
// link to it; otherwise (production only) offer to start one via the existing RepairActions.
function RepairPanel({
  incident,
  run,
  canApprove,
}: {
  incident: Incident;
  run: { id: string; state: string; archived_at: string | null } | null;
  canApprove: boolean;
}) {
  const box: React.CSSProperties = {
    background: "var(--bg-card)",
    padding: 16,
    borderRadius: 12,
    border: "1px solid var(--border-subtle)",
    marginBottom: 12,
  };
  if (run) {
    return (
      <div style={box}>
        <h4>修復</h4>
        <div style={{ fontSize: 13, margin: "8px 0" }}>狀態：{runStateLabel(run.state)}</div>
        <Link href="/ops/repairs">前往修復中心 →</Link>
      </div>
    );
  }
  if (incident.environment !== "production") {
    return (
      <div style={box}>
        <h4>修復</h4>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
          非 production 事件，不在修復中心自動修復範圍。
        </div>
      </div>
    );
  }
  return (
    <div style={box}>
      <h4>修復</h4>
      <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 10px" }}>尚未啟動修復流程。</div>
      <RepairActions mode="start" incidentId={incident.id} canAct={canApprove} />
    </div>
  );
}

function runStateLabel(value: string): string {
  const labels: Record<string, string> = {
    detected: "已偵測",
    triage_needed: "需分流",
    approved: "已核准",
    backing_up: "備份中",
    repairing: "修復中",
    pr_ready: "PR 已準備",
    deploy_pending: "待部署",
    deploying: "部署中",
    resolved: "已解決",
    rolled_back: "已回滾",
    human_only: "人工處理",
  };
  return labels[value] ?? value;
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
