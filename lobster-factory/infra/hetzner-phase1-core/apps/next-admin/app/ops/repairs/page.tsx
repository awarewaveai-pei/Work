import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canApproveCommand, readOpsRole } from "@/lib/ops-role";
import { REPAIR_SOURCE_POLICIES, policyForIncident, repairPolicyLabel } from "@/lib/repair-center/policy";
import type { RepairIncident, RepairRun } from "@/lib/repair-center/types";
import { RepairActions } from "./RepairActions";

export const dynamic = "force-dynamic";

const ACTIVE_STATES = ["detected", "triage_needed", "approved", "backing_up", "repairing", "pr_ready", "deploy_pending", "deploying"];

export default async function RepairsPage() {
  const h = await headers();
  const role = readOpsRole(new Request("http://localhost", { headers: h }));
  const canAct = canApproveCommand(role);
  const supabase = getSupabaseServerClient();

  let incidents: RepairIncident[] = [];
  let runs: RepairRun[] = [];
  let systemMode = "normal";
  let dbError: string | null = null;

  if (!supabase) {
    dbError = "Supabase client is not configured.";
  } else {
    const [incidentRes, runRes, modeRes] = await Promise.all([
      supabase
        .from("ops_incidents")
        .select("*")
        .in("status", ["open", "investigating"])
        .order("last_seen_at", { ascending: false })
        .limit(80),
      supabase.from("repair_runs").select("*").order("created_at", { ascending: false }).limit(100),
      supabase
        .from("system_modes")
        .select("mode")
        .eq("scope_type", "global")
        .is("scope_id", null)
        .maybeSingle(),
    ]);
    if (incidentRes.error) dbError = incidentRes.error.message;
    if (runRes.error) dbError = runRes.error.message;
    incidents = ((incidentRes.data ?? []) as RepairIncident[]).filter((i) => i.environment === "production");
    runs = (runRes.data ?? []) as RepairRun[];
    systemMode = String((modeRes.data as any)?.mode ?? "normal");
  }

  const runsByIncident = new Map(runs.map((r) => [r.incident_id, r]));
  const queue = incidents
    .filter((i) => !runsByIncident.has(i.id))
    .map((i) => ({ incident: i, policy: policyForIncident(i.source, i.severity) }));
  const activeRuns = runs.filter((r) => ACTIVE_STATES.includes(r.state));
  const recentRuns = runs.slice(0, 30);
  const blocked = systemMode !== "normal";
  const backupGate = readBackupGate();
  const githubGate = Boolean(process.env.AUTO_REPAIR_GITHUB_TOKEN || process.env.GITHUB_TOKEN);

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <nav style={{ marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" }}>
          <Link href="/" style={linkStyle}>Dashboard</Link>
          {" / "}
          <span>Repair Center</span>
        </nav>

        <header style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 22, alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 750, color: "var(--text-primary)", marginBottom: 6 }}>Repair Center</h1>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 820, lineHeight: 1.7 }}>
              Repair orchestration only: Ops Inbox owns incident intake, Approvals owns high-risk commands,
              System Modes owns the kill switch, and Build Console / sg-deploy owns production release.
            </p>
          </div>
          <div style={{ display: "grid", gap: 8, minWidth: 280 }}>
            <QuickLink href="/ops/inbox" label="Incident source: Ops Inbox" />
            <QuickLink href="/ops/approvals" label="High-risk commands: Approvals" />
            <QuickLink href="/ops/system-modes" label={`System mode: ${systemMode}`} tone={blocked ? "danger" : "ok"} />
            <QuickLink href="/build" label="Deploy stays manual: Build Console" />
          </div>
        </header>

        {dbError && <Alert tone="danger" title="Database unavailable" body={dbError} />}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
          <Metric label="Queue" value={queue.length} hint="repairable incidents without a run" />
          <Metric label="Active Runs" value={activeRuns.length} hint="not resolved / not human-only" />
          <Metric label="Backup Gate" value={backupGate.ok ? backupGate.mode : "blocked"} hint="no backup means no issue" tone={backupGate.ok ? "ok" : "warn"} />
          <Metric label="GitHub Gate" value={githubGate ? "wired" : "blocked"} hint="issue creation requires token" tone={githubGate ? "ok" : "warn"} />
        </div>

        {blocked && (
          <Alert
            tone="danger"
            title="Repair is blocked by System Modes"
            body={`Current mode is ${systemMode}. Repair approval is disabled until /ops/system-modes returns to normal.`}
          />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16, marginBottom: 16 }}>
          <Panel title="Queue" subtitle="Open production incidents that can become repair runs">
            {queue.length === 0 ? (
              <Empty text="No open production incident is waiting for repair orchestration." />
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {queue.map(({ incident, policy }) => (
                  <div key={incident.id} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <Severity value={incident.severity} />
                        <span style={pillStyle}>{incident.source}</span>
                        <span style={policy === "human_only" ? warnPillStyle : okPillStyle}>{repairPolicyLabel(policy)}</span>
                        {incident.client_slug ? <span style={pillStyle}>{incident.client_slug}</span> : null}
                      </div>
                      <Link href={`/ops/inbox/${incident.id}`} style={{ ...linkStyle, fontWeight: 700 }}>
                        {incident.title}
                      </Link>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                        {incident.service ?? "(host-level)"} · seen {new Date(incident.last_seen_at).toLocaleString("zh-TW")}
                      </div>
                    </div>
                    <RepairActions incidentId={incident.id} canAct={canAct && !blocked} mode="start" />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Safety" subtitle="Gates that protect production">
            <SafetyRow name="System Mode" ok={!blocked} value={systemMode} link="/ops/system-modes" />
            <SafetyRow name="Repair Health" ok={backupGate.ok && githubGate} value="GET /api/ops/repairs/health" link="/api/ops/repairs/health" />
            <SafetyRow name="Backup Gate" ok={backupGate.ok} value={backupGate.value} />
            <SafetyRow name="GitHub Issue Gate" ok={githubGate} value={githubGate ? "configured" : "missing AUTO_REPAIR_GITHUB_TOKEN"} />
            <SafetyRow name="Deploy Gate" ok value="manual only via sg-deploy.sh / Build Console" link="/build" />
            <SafetyRow name="Ops Inbox Health" ok value="source of truth remains /api/ops/inbox/health" link="/api/ops/inbox/health" />
          </Panel>
        </div>

        <Panel title="Runs" subtitle="Repair state machine: approved -> backup -> GitHub -> PR -> manual deploy" style={{ marginBottom: 16 }}>
          {recentRuns.length === 0 ? (
            <Empty text="No repair run exists yet." />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {recentRuns.map((run) => (
                <div key={run.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <State value={run.state} />
                      <span style={pillStyle}>{repairPolicyLabel(run.policy)}</span>
                      <span style={run.backup_status === "passed" ? okPillStyle : run.backup_status === "failed" ? dangerPillStyle : pillStyle}>
                        backup: {run.backup_status}
                      </span>
                      <span style={pillStyle}>deploy: {run.deploy_status}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 650 }}>
                      {run.source} · {run.client_slug ?? "platform"} · {run.id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 5, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link href={`/ops/inbox/${run.incident_id}`} style={linkStyle}>Incident</Link>
                      {run.github_issue_url ? <a href={run.github_issue_url} style={linkStyle} target="_blank" rel="noreferrer">Issue #{run.github_issue_number}</a> : <span>No issue</span>}
                      {run.github_pr_url ? <a href={run.github_pr_url} style={linkStyle} target="_blank" rel="noreferrer">PR #{run.github_pr_number ?? ""}</a> : <span>No PR</span>}
                      {run.backup_ref ? <code>{run.backup_ref}</code> : null}
                    </div>
                    {run.backup_error ? <div style={{ color: "#991b1b", fontSize: 12, marginTop: 5 }}>{run.backup_error}</div> : null}
                  </div>
                  <RepairActions runId={run.id} canAct={canAct && !blocked} mode="run" />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Policy" subtitle="No duplicated inbox, approval system, deploy engine, or notification brain">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {REPAIR_SOURCE_POLICIES.map((entry) => (
              <PolicyCard key={entry.source} title={entry.label} label={repairPolicyLabel(entry.policy)} body={entry.rationale} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children, style }: { title: string; subtitle?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 18, ...style }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{title}</h2>
        {subtitle ? <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function QuickLink({ href, label, tone }: { href: string; label: string; tone?: "ok" | "danger" }) {
  return (
    <Link href={href} style={{ ...quickLinkStyle, ...(tone === "danger" ? { borderColor: "#fecaca", color: "#991b1b", background: "#fef2f2" } : tone === "ok" ? { borderColor: "#bbf7d0", color: "#166534", background: "#f0fdf4" } : {}) }}>
      {label}
    </Link>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone?: "ok" | "warn" }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 750, color: tone === "warn" ? "#b45309" : tone === "ok" ? "#166534" : "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{hint}</div>
    </div>
  );
}

function Alert({ title, body, tone }: { title: string; body: string; tone: "danger" }) {
  return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
      <strong>{title}</strong>
      <div style={{ marginTop: 4, fontSize: 13 }}>{body}</div>
    </div>
  );
}

function SafetyRow({ name, ok, value, link }: { name: string; ok: boolean; value: string; link?: string }) {
  const content = (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)" }}>{name}</span>
      <span style={{ fontSize: 12, color: ok ? "#166534" : "#b45309", textAlign: "right" }}>{ok ? "OK" : "BLOCKED"} · {value}</span>
    </div>
  );
  return link ? <Link href={link} style={{ textDecoration: "none" }}>{content}</Link> : content;
}

function PolicyCard({ title, label, body }: { title: string; label: string; body: string }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <strong style={{ color: "var(--text-primary)" }}>{title}</strong>
        <span style={okPillStyle}>{label}</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ border: "1px dashed #cbd5e1", borderRadius: 8, padding: 18, color: "var(--text-secondary)", fontSize: 13 }}>{text}</div>;
}

function Severity({ value }: { value: string }) {
  const style = value === "critical" ? dangerPillStyle : value === "high" ? warnPillStyle : pillStyle;
  return <span style={style}>{value}</span>;
}

function State({ value }: { value: string }) {
  const style = value === "resolved" ? okPillStyle : value === "rolled_back" ? dangerPillStyle : value === "human_only" ? warnPillStyle : pillStyle;
  return <span style={style}>{value}</span>;
}

const linkStyle: React.CSSProperties = { color: "var(--accent)", textDecoration: "none" };
const quickLinkStyle: React.CSSProperties = { display: "block", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "var(--text-secondary)", padding: "8px 10px", fontSize: 12, textDecoration: "none" };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 };
const pillStyle: React.CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#f1f5f9", color: "#475569", whiteSpace: "nowrap" };
const okPillStyle: React.CSSProperties = { ...pillStyle, background: "#dcfce7", color: "#166534" };
const warnPillStyle: React.CSSProperties = { ...pillStyle, background: "#fef3c7", color: "#92400e" };
const dangerPillStyle: React.CSSProperties = { ...pillStyle, background: "#fee2e2", color: "#991b1b" };

function readBackupGate(): { ok: boolean; mode: string; value: string } {
  if (process.env.AUTO_REPAIR_BACKUP_WEBHOOK_URL) {
    return { ok: true, mode: "webhook", value: "webhook configured" };
  }
  const sg =
    Boolean(process.env.AUTO_REPAIR_SG_SSH_HOST) &&
    Boolean(process.env.AUTO_REPAIR_SG_SSH_KEY_B64 || (process.env.AUTO_REPAIR_SG_SSH_KEY_ENV && process.env[process.env.AUTO_REPAIR_SG_SSH_KEY_ENV]));
  const euRequired = process.env.AUTO_REPAIR_REQUIRE_EU_BACKUP?.trim().toLowerCase() !== "false";
  const eu =
    Boolean(process.env.AUTO_REPAIR_EU_SSH_HOST) &&
    Boolean(process.env.AUTO_REPAIR_EU_SSH_KEY_B64 || (process.env.AUTO_REPAIR_EU_SSH_KEY_ENV && process.env[process.env.AUTO_REPAIR_EU_SSH_KEY_ENV]));
  if (sg && (!euRequired || eu)) {
    return { ok: true, mode: "ssh", value: euRequired ? "SG + EU SSH configured" : "SG SSH configured; EU intentionally optional" };
  }
  if (!sg) return { ok: false, mode: "blocked", value: "missing SG SSH or backup webhook" };
  return { ok: false, mode: "blocked", value: "missing EU SSH; set AUTO_REPAIR_REQUIRE_EU_BACKUP=false only for SG-only drill" };
}
