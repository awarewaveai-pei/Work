import type { MediaBoundaryRule, OpsAction, OpsTenant, TenantConfig, WorkflowRun } from "@/lib/ops-contracts";
import AiJobForm from "./AiJobForm";
import TenantConfigForm from "./TenantConfigForm";
import { OpsConsoleTelemetry } from "./OpsConsoleTelemetry";
import DepartmentSelector from "./DepartmentSelector";

interface OpsSummary {
  generatedAt: string;
  sourceOfTruth: string;
  tenants: OpsTenant[];
  mediaRules: MediaBoundaryRule[];
  actions: OpsAction[];
}

interface WorkflowRunsResponse {
  ok: boolean;
  runs: WorkflowRun[];
}

interface TenantConfigResponse {
  ok: boolean;
  tenant: TenantConfig;
}

function apiEndpoint(path: string): string {
  const internalBase = (process.env.INTERNAL_ADMIN_BASE_URL ?? "").replace(/\/$/, "");
  if (internalBase) return `${internalBase}${path}`;

  if (process.env.NODE_ENV !== "production") {
    return `http://127.0.0.1:3000${path}`;
  }

  const publicBase = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return publicBase ? `${publicBase}${path}` : `http://127.0.0.1:3000${path}`;
}

async function fetchSummary(): Promise<OpsSummary | null> {
  const endpoint = apiEndpoint("/api/ops/summary");
  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as OpsSummary;
  } catch {
    return null;
  }
}

async function fetchWorkflowRuns(): Promise<WorkflowRun[]> {
  const endpoint = apiEndpoint("/api/ops/workflow-runs?limit=10");
  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) return [];
    const payload = (await res.json()) as WorkflowRunsResponse;
    return payload.ok ? payload.runs : [];
  } catch {
    return [];
  }
}

async function fetchTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  const endpoint = apiEndpoint(`/api/ops/tenants/${tenantId}/config`);
  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) return null;
    const payload = (await res.json()) as TenantConfigResponse;
    return payload.ok ? payload.tenant : null;
  } catch {
    return null;
  }
}

function Badge({ text }: { text: string }) {
  return <span className="card-badge badge-gray">{text}</span>;
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="ops-row">
      <div className="ops-row-key" style={{ color: "var(--text-muted)", fontWeight: 500 }}>—</div>
      <div className="ops-row-val">{label}</div>
    </div>
  );
}

export default async function OpsConsolePage() {
  const data = await fetchSummary();
  const defaultOrgId = data?.tenants?.[0]?.id ?? "";
  const [workflowRuns, defaultTenantConfig] = await Promise.all([
    fetchWorkflowRuns(),
    defaultOrgId ? fetchTenantConfig(defaultOrgId) : Promise.resolve(null),
  ]);
  const workflowSourceCounts = workflowRuns.reduce<Record<string, number>>((acc, run) => {
    const key = run.runSource || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const workflowSourceSummary = Object.entries(workflowSourceCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, count]) => `${source}: ${count}`)
    .join(" · ");

  return (
    <>
      <OpsConsoleTelemetry />
      <div className="topbar">
        <span className="topbar-title">Ops Console</span>
        <span className="topbar-env">
          <span className="dot dot-green" />
          control-plane
        </span>
      </div>

      <div className="page">

        {/* P11: orientation banner — this is a legacy/diagnostic view; its data overlaps
            dedicated pages. Kept for the architecture reference + department selector. */}
        <div
          style={{
            background: "var(--build-risk-medium-bg)",
            border: "1px solid var(--yellow)",
            color: "var(--build-risk-medium-text)",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 24,
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <strong>診斷 / 參考頁</strong> — 此頁是架構邊界參考 + 部門選型。日常操作請用正式頁：
          租戶健康看 <a href="/ops/clients" style={{ color: "var(--build-risk-medium-text)", fontWeight: 600 }}>Clients</a>、
          建站執行看 <a href="/build" style={{ color: "var(--build-risk-medium-text)", fontWeight: 600 }}>Build Console</a>。
          下方「Tenant Config」「AI Image Job」為實驗性（AI Image Job 尚未接 Trigger.dev 處理，建立後會停在 queued）。
        </div>

        {/* ── Architecture Boundary ───────────────────── */}
        <div className="section-title">Architecture Boundary</div>
        <div className="card-grid" style={{ marginBottom: 28 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-label">AI Generated Images</span>
              <Badge text="R2" />
            </div>
            <div className="card-sub">Cloudflare R2 is the only storage backend for AI-generated assets.</div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-label">WP Product / Blog Images</span>
              <Badge text="wp_uploads + mysql" />
            </div>
            <div className="card-sub">WordPress media library remains the canonical storage path.</div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-label">Control Plane</span>
              <Badge text={data?.sourceOfTruth ?? "supabase"} />
            </div>
            <div className="card-sub">Jobs, approvals, audit logs, and run lineage are stored in Supabase.</div>
          </div>
        </div>

        {/* ── Tenants Snapshot ────────────────────────── */}
        <div className="section-title">Tenants Snapshot</div>
        <div className="ops-table" style={{ marginBottom: 28 }}>
          {(data?.tenants ?? []).map((tenant) => (
            <div className="ops-row" key={tenant.id}>
              <div className="ops-row-key">{tenant.name}</div>
              <div className="ops-row-val">
                <span className="ops-row-badge">status: {tenant.status}</span>
                <span className="ops-row-badge">run: {tenant.lastRunStatus}</span>
                <span className="ops-row-badge">risk: {tenant.riskLevel}</span>
              </div>
            </div>
          ))}
          {!data?.tenants?.length && <EmptyRow label="No tenant snapshot available — seed pending" />}
        </div>

        {/* ── Media Boundary Rules ─────────────────────── */}
        <div className="section-title">Media Boundary Rules</div>
        <div className="ops-table" style={{ marginBottom: 28 }}>
          {(data?.mediaRules ?? []).map((rule) => (
            <div className="ops-row" key={`${rule.domain}-${rule.backend}`}>
              <div className="ops-row-key">{rule.domain}</div>
              <div className="ops-row-val">{rule.backend}</div>
            </div>
          ))}
          {!data?.mediaRules?.length && <EmptyRow label="No media boundary rules configured" />}
        </div>

        {/* ── Action Allowlist ─────────────────────────── */}
        <div className="section-title">Action Allowlist</div>
        <div className="ops-table" style={{ marginBottom: 28 }}>
          {(data?.actions ?? []).map((action) => (
            <div className="ops-row" key={action.id}>
              <div className="ops-row-key">{action.displayName}</div>
              <div className="ops-row-val">
                <span className="ops-row-badge">{action.environmentScope}</span>
                <span className="ops-row-badge">risk: {action.riskLevel}</span>
                <span className="ops-row-badge">approval: {action.requiresApproval ? "required" : "not required"}</span>
              </div>
            </div>
          ))}
          {!data?.actions?.length && <EmptyRow label="No actions in allowlist" />}
        </div>

        {/* ── Workflow Runs ────────────────────────────── */}
        <div className="section-title">Workflow Runs (read-only)</div>
        <p className="form-hint" style={{ marginBottom: 12, maxWidth: 640 }}>
          Source summary: <code>{workflowSourceSummary || "none"}</code>
        </p>
        <div className="ops-table" style={{ marginBottom: 28 }}>
          {workflowRuns.map((run) => (
            <div className="ops-row" key={run.id}>
              <div className="ops-row-key">{run.organizationSlug}</div>
              <div className="ops-row-val">
                <span className="ops-row-badge">{run.status}</span>
                <span className="ops-row-badge">source: {run.runSource}</span>
                <span className="ops-row-badge">approval: {run.approvalStatus}</span>
                <span className="ops-row-badge" style={{ fontFamily: "monospace", fontSize: 10 }}>trace: {run.traceId}</span>
              </div>
            </div>
          ))}
          {!workflowRuns.length && <EmptyRow label="No workflow runs — waiting for first execution" />}
        </div>

        {/* ── Tenant Config ────────────────────────────── */}
        <div className="section-title">Tenant Config (controlled patch)</div>
        <p className="form-hint" style={{ marginBottom: 12, maxWidth: 640 }}>
          PATCH allowlist is fixed to <code>status</code>, <code>defaultLocale</code>, and <code>defaultTimezone</code>.
          Only <code>owner/admin</code> role header can mutate.
        </p>
        {defaultTenantConfig ? (
          <TenantConfigForm tenant={defaultTenantConfig} />
        ) : (
          <EmptyRow label="Tenant config unavailable — select tenant data source first" />
        )}

        {/* ── M3 Department Selector ───────────────────── */}
        <div className="section-title" style={{ marginTop: 32 }}>M3 — 部門選型（20 部門）</div>
        <p className="form-hint" style={{ marginBottom: 12, maxWidth: 640 }}>
          勾選客戶啟用的部門能力模組。右側即時顯示需填寫的模板檔案與必填欄位。
          按「複製 JSON」可貼入 <code>core/DEPARTMENT_SELECTION.json</code>。
          對照表：<code>DEPARTMENT_CLUSTER_CATALOG.md</code> → <code>DEPARTMENT_COVERAGE_MATRIX.md</code>。
        </p>
        <DepartmentSelector tenantSlug={data?.tenants?.[0]?.id ?? ""} />

        {/* ── AI Job Form ──────────────────────────────── */}
        <div className="section-title" style={{ marginTop: 32 }}>Controlled Write — AI Image Job</div>
        <p className="form-hint" style={{ marginBottom: 12, maxWidth: 640 }}>
          Creates a <code>queued</code> row in <code>ai_image_jobs</code> and an audit event. Requires server env{" "}
          <code>SUPABASE_URL</code> + <code>SUPABASE_SERVICE_ROLE_KEY</code> (or anon key for dev) and applied migration{" "}
          <code>0011_ops_console_control_plane.sql</code>.
        </p>
        <AiJobForm defaultOrganizationId={defaultOrgId} />

      </div>
    </>
  );
}
