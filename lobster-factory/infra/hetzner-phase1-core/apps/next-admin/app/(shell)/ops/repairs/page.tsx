import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canApproveCommand, readOpsRole } from "@/lib/ops-role";
import { effectiveOrgId, OrgAccessError } from "@/lib/tenant-guard";
import type { IntegrationBlocker } from "@/lib/repair-os/integration-blockers";
import { loadIntegrationBlockers } from "@/lib/repair-os/integration-blockers-load";
import { REPAIR_SOURCE_POLICIES, policyCatalogForSource, policyForIncident, repairPolicyLabel } from "@/lib/repair-center/policy";
import { collapseStormChildren } from "@/lib/repair-center/correlate";
import type { RepairIncident, RepairRun } from "@/lib/repair-center/types";
import { RepairActions } from "./RepairActions";
import { AutoRefresh } from "@/app/AutoRefresh";

export const dynamic = "force-dynamic";

const ACTIVE_STATES = ["detected", "triage_needed", "approved", "backing_up", "repairing", "pr_ready", "deploy_pending", "deploying"];

interface RepairsSearchParams {
  client_slug?: string;
}

export default async function RepairsPage({ searchParams }: { searchParams?: Promise<RepairsSearchParams> }) {
  const sp = searchParams ? await searchParams : {};
  const clientSlug = sp.client_slug?.trim() || "";
  const h = await headers();
  const reqLike = new Request("http://localhost", { headers: h });
  const role = readOpsRole(reqLike);
  const canAct = canApproveCommand(role);
  const supabase = getSupabaseServerClient();

  // Tenant scoping (2026-07-02): this server component queries with the
  // service-role client, BYPASSING the org filters the API routes gained in
  // S2/S4 — a client login reaching this page would see every org's incidents.
  // Same effectiveOrgId contract as app/api/ops/repairs/route.ts: staff → null
  // (all orgs, today's behavior unchanged); client → own org; client without
  // an org binding → fail closed (no queries).
  let orgFilter: string | null = null;
  let orgAccessDenied = false;
  try {
    orgFilter = effectiveOrgId(reqLike, null);
  } catch (e) {
    if (e instanceof OrgAccessError) orgAccessDenied = true;
    else throw e;
  }

  let incidents: RepairIncident[] = [];
  let runs: RepairRun[] = [];
  let integrationBlockers: IntegrationBlocker[] = [];
  let systemMode = "normal";
  let dbError: string | null = null;

  if (!supabase) {
    dbError = "Supabase client 尚未設定。";
  } else if (orgAccessDenied) {
    dbError = "帳號未綁定組織（org binding missing）— 無法載入資料。";
  } else {
    let incidentQuery = supabase
        .from("ops_incidents")
        .select("*")
        .in("status", ["open", "investigating"])
        .order("last_seen_at", { ascending: false })
        .limit(80);
    if (clientSlug) incidentQuery = incidentQuery.eq("client_slug", clientSlug);
    if (orgFilter) incidentQuery = incidentQuery.eq("organization_id", orgFilter);

    let runQuery = supabase.from("repair_runs").select("*").is("archived_at", null).order("created_at", { ascending: false }).limit(100);
    if (clientSlug) runQuery = runQuery.eq("client_slug", clientSlug);
    if (orgFilter) runQuery = runQuery.eq("organization_id", orgFilter);

    const [incidentRes, runRes, modeRes, blockerRes] = await Promise.all([
      incidentQuery,
      runQuery,
      // Deliberately NOT org-filtered (critic 2026-07-02): system_modes is the
      // platform-global kill switch — a client user seeing the global mode is
      // by design (they must know WHY repair actions are blocked). Only the
      // enum value leaks; no other org's data.
      supabase
        .from("system_modes")
        .select("mode")
        .eq("scope_type", "global")
        .is("scope_id", null)
        .maybeSingle(),
      // only the bindings that can block, and only their organizations' names (every WordPress buyer is an organization)
      loadIntegrationBlockers(supabase, orgFilter),
    ]);
    if (incidentRes.error) dbError = incidentRes.error.message;
    if (runRes.error) dbError = runRes.error.message;
    if (blockerRes.error) dbError = blockerRes.error;
    incidents = ((incidentRes.data ?? []) as RepairIncident[]).filter((i) => i.environment === "production");
    runs = (runRes.data ?? []) as RepairRun[];
    integrationBlockers = blockerRes.blockers;
    systemMode = String((modeRes.data as any)?.mode ?? "normal");
  }

  const activeRuns = runs.filter((r) => ACTIVE_STATES.includes(r.state));
  // P5 fix: an incident leaves the queue only while a run still OWNS it — either in
  // flight (ACTIVE_STATES) or parked in human_only (an operator took it over manually).
  // Terminal resolved / rolled_back runs must NOT keep a still-open incident out of the
  // queue: the operator needs to be able to retry. startRepairFromIncident() already
  // reuses the existing run row (service.ts:99), so re-surfacing here is safe.
  const ownedRunIncidentIds = new Set(
    runs.filter((r) => ACTIVE_STATES.includes(r.state) || r.state === "human_only").map((r) => r.incident_id),
  );
  // Storm collapse (A3): children whose parent incident is also queued fold
  // into the parent row (badge shows the count). A child whose parent is
  // resolved/absent stays visible as its own actionable row.
  const openQueueIncidents = incidents.filter((i) => !ownedRunIncidentIds.has(i.id));
  const { visible: queueIncidents, childCount: stormChildCount } = collapseStormChildren(openQueueIncidents);
  const queue = queueIncidents.map((i) => ({ incident: i, policy: policyForIncident(i.source, i.severity) }));
  const recentRuns = runs.slice(0, 30);
  const blocked = systemMode !== "normal";
  const backupGate = readBackupGate();
  const githubGate = Boolean(process.env.AUTO_REPAIR_GITHUB_TOKEN || process.env.GITHUB_TOKEN);

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <AutoRefresh intervalMs={15000} />
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <nav style={{ marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" }}>
          <Link href="/" style={linkStyle}>儀表板</Link>
          {" / "}
          <span>修復中心</span>
          {clientSlug ? (
            <>
              {" / "}
              <Link href="/ops/repairs" style={linkStyle}>全部客戶</Link>
            </>
          ) : null}
        </nav>

        <header style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 22, alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 750, color: "var(--text-primary)", marginBottom: 6 }}>修復中心</h1>
            {clientSlug ? (
              <div style={{ fontSize: 12, color: "var(--accent-text)", fontWeight: 650, marginBottom: 6 }}>
                client: {clientSlug}
              </div>
            ) : null}
            <p style={{ fontSize: 14, color: "var(--text-secondary)", maxWidth: 820, lineHeight: 1.7 }}>
              Repair Center 是維修主控台：事件、AI 分析、備份、核准、GitHub handoff、手動部署與結案證據都應在這裡收斂。
              Incident intake 是底層引擎，Approvals / System Modes / Build Console 是安全閘門。
            </p>
          </div>
          <div style={{ display: "grid", gap: 8, minWidth: 280 }}>
            <QuickLink
              href="/ops/integrations"
              label={integrationBlockers.length ? `客戶串接：${integrationBlockers.length} 個補件` : "客戶串接：Integrations"}
              tone={integrationBlockers.length ? "danger" : undefined}
            />
            <QuickLink href="/ops/approvals" label="高風險指令：Approvals" />
            <QuickLink href="/ops/system-modes" label={`系統模式：${displaySystemMode(systemMode)}`} tone={blocked ? "danger" : "ok"} />
            <QuickLink href="/build" label="部署維持手動：Build Console" />
          </div>
        </header>

        {dbError && <Alert tone="danger" title="資料庫無法使用" body={dbError} />}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
          <Metric label="待處理佇列" value={queue.length} hint="沒有進行中修復流程的可修復事件（含可重試的已結案事件）" />
          <Metric label="進行中修復" value={activeRuns.length} hint="尚未結案或改人工處理" />
          <Metric label="備份閘門" value={backupGate.ok ? backupGate.mode : "已阻擋"} hint="沒有備份就不建立 Issue" tone={backupGate.ok ? "ok" : "warn"} />
          <Metric label="GitHub 閘門" value={githubGate ? "已串接" : "已阻擋"} hint="建立 Issue 需要 token" tone={githubGate ? "ok" : "warn"} />
        </div>

        {blocked && (
          <Alert
            tone="danger"
            title="修復流程已被 System Modes 阻擋"
            body={`目前模式是 ${displaySystemMode(systemMode)}。請先到 /ops/system-modes 恢復 normal，才能核准修復。`}
          />
        )}

        {integrationBlockers.length > 0 && (
          <Panel title="維修能力補件" subtitle="這些外部串接會影響 Repair Center 的偵測、通知、驗證或客戶交付能力。" style={{ marginBottom: 16, background: "var(--build-risk-medium-bg)", borderColor: "var(--yellow)" }}>
            <div style={{ display: "grid", gap: 10 }}>
              {integrationBlockers.map((item) => (
                <div key={item.key} style={{ ...rowStyle, background: "var(--card-bg)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={warnPillStyle}>{item.clientSlug}</span>
                      <span style={pillStyle}>{providerLabel(item.provider)}</span>
                      <span style={item.status === "pending" ? warnPillStyle : dangerPillStyle}>{item.status}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--build-risk-medium-text)", fontWeight: 700 }}>{item.message}</div>
                    <div style={{ fontSize: 12, color: "var(--severity-high)", marginTop: 4 }}>{item.nextStep}</div>
                  </div>
                  <Link href="/ops/integrations" style={linkButtonStyle}>前往串接</Link>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 16, marginBottom: 16 }}>
          <Panel title="待處理佇列" subtitle="可轉成修復流程的 production 開放事件">
            {queue.length === 0 ? (
              <Empty text="目前沒有等待修復編排的 production 開放事件。" />
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
                        {(stormChildCount.get(incident.id) ?? 0) > 0 ? (
                          <span style={pillStyle}>+{stormChildCount.get(incident.id)} 筆關聯告警</span>
                        ) : null}
                      </div>
                      <Link href={`/ops/inbox/${incident.id}`} style={{ ...linkStyle, fontWeight: 700 }}>
                        {incident.title}
                      </Link>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                        {incident.service ?? "主機層級"} · 最近看到 {new Date(incident.last_seen_at).toLocaleString("zh-TW")}
                      </div>
                    </div>
                    <RepairActions incidentId={incident.id} canAct={canAct && !blocked} mode="start" policy={policy} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="安全閘門" subtitle="保護正式環境的必要檢查">
            <SafetyRow name="系統模式" ok={!blocked} value={displaySystemMode(systemMode)} link="/ops/system-modes" />
            <SafetyRow name="修復健康檢查" ok={backupGate.ok && githubGate} value="GET /api/ops/repairs/health" link="/api/ops/repairs/health" />
            <SafetyRow name="客戶串接補件" ok={integrationBlockers.length === 0} value={integrationBlockers.length ? `${integrationBlockers.length} 個待補` : "已清空"} link="/ops/integrations" />
            <SafetyRow name="備份閘門" ok={backupGate.ok} value={backupGate.value} />
            <SafetyRow name="GitHub Issue 閘門" ok={githubGate} value={githubGate ? "已設定" : "缺少 AUTO_REPAIR_GITHUB_TOKEN"} />
            <SafetyRow name="部署閘門" ok value="僅能透過 sg-deploy.sh / Build Console 手動部署" link="/build" />
            <SafetyRow name="Incident intake 健康檢查" ok value="底層事件引擎 /api/ops/inbox/health" link="/api/ops/inbox/health" />
          </Panel>
        </div>

        <Panel title="修復紀錄" subtitle="狀態流程：已核准 -> 備份 -> GitHub -> PR -> 手動部署" style={{ marginBottom: 16 }}>
          {recentRuns.length === 0 ? (
            <Empty text="目前尚無修復流程紀錄。" />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {recentRuns.map((run) => (
                <div key={run.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                      <State value={run.state} />
                      <span style={pillStyle}>{repairPolicyLabel(run.policy)}</span>
                      <span style={run.backup_status === "passed" ? okPillStyle : run.backup_status === "failed" ? dangerPillStyle : pillStyle}>
                        備份：{displayBackupStatus(run.backup_status)}
                      </span>
                      <span style={pillStyle}>部署：{displayDeployStatus(run.deploy_status)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 650 }}>
                      {run.source} · {run.client_slug ?? "platform"} · {run.id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 5, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link href={`/ops/inbox/${run.incident_id}`} style={linkStyle}>事件</Link>
                      {run.github_issue_url ? <a href={run.github_issue_url} style={linkStyle} target="_blank" rel="noreferrer">Issue #{run.github_issue_number}</a> : <span>尚無 Issue</span>}
                      {run.github_pr_url ? <a href={run.github_pr_url} style={linkStyle} target="_blank" rel="noreferrer">PR #{run.github_pr_number ?? ""}</a> : <span>尚無 PR</span>}
                      {run.backup_ref ? <code>{run.backup_ref}</code> : null}
                    </div>
                    {run.backup_error ? <div style={{ color: "var(--badge-red-text)", fontSize: 12, marginTop: 5 }}>{run.backup_error}</div> : null}
                  </div>
                  <RepairActions
                    runId={run.id}
                    canAct={canAct && !blocked}
                    mode="run"
                    runState={run.state}
                    archivedAt={run.archived_at ?? null}
                    canEscalate={
                      run.policy === "analysis_only" &&
                      policyCatalogForSource(run.source).can_escalate_to_pr
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="來源策略" subtitle="不重複建立 inbox、核准系統、部署引擎或通知中樞">
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
    <section style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: 18, ...style }}>
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
    <Link href={href} style={{ ...quickLinkStyle, ...(tone === "danger" ? { borderColor: "var(--red)", color: "var(--badge-red-text)", background: "var(--badge-red-bg)" } : tone === "ok" ? { borderColor: "var(--green)", color: "var(--badge-green-text)", background: "var(--badge-green-bg)" } : {}) }}>
      {label}
    </Link>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone?: "ok" | "warn" }) {
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 750, color: tone === "warn" ? "var(--build-risk-medium-text)" : tone === "ok" ? "var(--badge-green-text)" : "var(--text-primary)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{hint}</div>
    </div>
  );
}

function Alert({ title, body, tone }: { title: string; body: string; tone: "danger" }) {
  return (
    <div style={{ background: "var(--badge-red-bg)", border: "1px solid var(--red)", color: "var(--badge-red-text)", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
      <strong>{title}</strong>
      <div style={{ marginTop: 4, fontSize: 13 }}>{body}</div>
    </div>
  );
}

function SafetyRow({ name, ok, value, link }: { name: string; ok: boolean; value: string; link?: string }) {
  const content = (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)" }}>{name}</span>
      <span style={{ fontSize: 12, color: ok ? "var(--badge-green-text)" : "var(--build-risk-medium-text)", textAlign: "right" }}>{ok ? "正常" : "已阻擋"} · {value}</span>
    </div>
  );
  return link ? <Link href={link} style={{ textDecoration: "none" }}>{content}</Link> : content;
}

function PolicyCard({ title, label, body }: { title: string; label: string; body: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <strong style={{ color: "var(--text-primary)" }}>{title}</strong>
        <span style={okPillStyle}>{label}</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 18, color: "var(--text-secondary)", fontSize: 13 }}>{text}</div>;
}

function Severity({ value }: { value: string }) {
  const style = value === "critical" ? dangerPillStyle : value === "high" ? warnPillStyle : pillStyle;
  return <span style={style}>{displaySeverity(value)}</span>;
}

function State({ value }: { value: string }) {
  const style = value === "resolved" ? okPillStyle : value === "rolled_back" ? dangerPillStyle : value === "human_only" ? warnPillStyle : pillStyle;
  return <span style={style}>{displayRunState(value)}</span>;
}

function displaySeverity(value: string): string {
  if (value === "critical") return "嚴重";
  if (value === "high") return "高";
  if (value === "medium") return "中";
  if (value === "low") return "低";
  return value;
}

function displayRunState(value: string): string {
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

function displayBackupStatus(value: string): string {
  const labels: Record<string, string> = {
    not_started: "尚未開始",
    running: "執行中",
    passed: "已通過",
    failed: "失敗",
    skipped: "已略過",
  };
  return labels[value] ?? value;
}

function displayDeployStatus(value: string): string {
  const labels: Record<string, string> = {
    not_started: "尚未開始",
    pending_manual: "等待手動部署",
    running: "部署中",
    passed: "已通過",
    failed: "失敗",
    rolled_back: "已回滾",
  };
  return labels[value] ?? value;
}

function displaySystemMode(value: string): string {
  const labels: Record<string, string> = {
    normal: "正常",
    maintenance: "維護中",
    emergency_stop: "緊急停止",
  };
  return labels[value] ?? value;
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    uptime_kuma: "Uptime Kuma",
    posthog: "PostHog",
    github: "GitHub",
    trigger: "Trigger.dev",
    n8n: "n8n",
    sentry: "Sentry",
    grafana: "Grafana",
    netdata: "Netdata",
    slack: "Slack",
    telegram: "Telegram",
    supabase: "Supabase",
    wordpress: "WordPress",
    cloudflare: "Cloudflare",
  };
  return labels[provider] ?? provider;
}

const linkStyle: React.CSSProperties = { color: "var(--accent-text)", textDecoration: "none" };
const linkButtonStyle: React.CSSProperties = { ...linkStyle, border: "1px solid var(--yellow)", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 700, alignSelf: "center", whiteSpace: "nowrap" };
const quickLinkStyle: React.CSSProperties = { display: "block", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card-bg)", color: "var(--text-secondary)", padding: "8px 10px", fontSize: 12, textDecoration: "none" };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", border: "1px solid var(--border)", borderRadius: 8, padding: 14 };
const pillStyle: React.CSSProperties = { fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--badge-gray-bg)", color: "var(--badge-gray-text)", whiteSpace: "nowrap" };
const okPillStyle: React.CSSProperties = { ...pillStyle, background: "var(--badge-green-bg)", color: "var(--badge-green-text)" };
const warnPillStyle: React.CSSProperties = { ...pillStyle, background: "var(--build-risk-medium-bg)", color: "var(--build-risk-medium-text)" };
const dangerPillStyle: React.CSSProperties = { ...pillStyle, background: "var(--badge-red-bg)", color: "var(--badge-red-text)" };

function readBackupGate(): { ok: boolean; mode: string; value: string } {
  if (process.env.AUTO_REPAIR_BACKUP_WEBHOOK_URL) {
    return { ok: true, mode: "webhook", value: "webhook 已設定" };
  }
  const sg =
    Boolean(process.env.AUTO_REPAIR_SG_SSH_HOST) &&
    Boolean(process.env.AUTO_REPAIR_SG_SSH_KEY_B64 || (process.env.AUTO_REPAIR_SG_SSH_KEY_ENV && process.env[process.env.AUTO_REPAIR_SG_SSH_KEY_ENV]));
  const euRequired = process.env.AUTO_REPAIR_REQUIRE_EU_BACKUP?.trim().toLowerCase() !== "false";
  const eu =
    Boolean(process.env.AUTO_REPAIR_EU_SSH_HOST) &&
    Boolean(process.env.AUTO_REPAIR_EU_SSH_KEY_B64 || (process.env.AUTO_REPAIR_EU_SSH_KEY_ENV && process.env[process.env.AUTO_REPAIR_EU_SSH_KEY_ENV]));
  if (sg && (!euRequired || eu)) {
    return { ok: true, mode: "ssh", value: euRequired ? "SG + EU SSH 已設定" : "SG SSH 已設定；EU 已刻意設為可選" };
  }
  if (!sg) return { ok: false, mode: "已阻擋", value: "缺少 SG SSH 或 backup webhook" };
  return { ok: false, mode: "已阻擋", value: "缺少 EU SSH；只有 SG-only drill 才可將 AUTO_REPAIR_REQUIRE_EU_BACKUP 設為 false" };
}
