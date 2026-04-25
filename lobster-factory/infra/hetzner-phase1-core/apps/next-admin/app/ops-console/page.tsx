import type { MediaBoundaryRule, OpsAction, OpsTenant, TenantConfig, WorkflowRun } from "../../lib/ops-contracts";
import AiJobForm from "./AiJobForm";
import TenantConfigForm from "./TenantConfigForm";

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
  const base = (process.env.INTERNAL_ADMIN_BASE_URL ?? "").replace(/\/$/, "");
  return base ? `${base}${path}` : `http://127.0.0.1:3002${path}`;
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

export default async function OpsConsolePage() {
  const data = await fetchSummary();
  const defaultOrgId = data?.tenants?.[0]?.id ?? "";
  const [workflowRuns, defaultTenantConfig] = await Promise.all([
    fetchWorkflowRuns(),
    defaultOrgId ? fetchTenantConfig(defaultOrgId) : Promise.resolve(null),
  ]);

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Ops Console v1</span>
        <span className="topbar-env">
          <span className="dot dot-green" />
          control-plane
        </span>
      </div>

      <div className="page">
        <div className="section-title">Architecture boundary (fixed)</div>
        <div className="card-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-label">AI generated images</span>
              <Badge text="R2" />
            </div>
            <div className="card-sub">Cloudflare R2 is the only storage backend for AI-generated assets.</div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-label">WordPress product/blog images</span>
              <Badge text="wp_uploads + mysql" />
            </div>
            <div className="card-sub">WordPress media library remains the canonical storage path.</div>
          </div>
          <div className="card">
            <div className="card-header">
              <span className="card-label">Control plane</span>
              <Badge text={data?.sourceOfTruth ?? "supabase"} />
            </div>
            <div className="card-sub">Jobs, approvals, audit logs, and run lineage are stored in Supabase.</div>
          </div>
        </div>

        <div className="section-title">Tenants snapshot</div>
        <div className="link-list">
          {(data?.tenants ?? []).map((tenant) => (
            <div className="link-card" key={tenant.id}>
              <span>{tenant.name}</span>
              <span className="link-card-arrow">
                {tenant.status} · run:{tenant.lastRunStatus} · risk:{tenant.riskLevel}
              </span>
            </div>
          ))}
          {!data?.tenants?.length && (
            <div className="link-card">
              <span>No tenant snapshot available</span>
              <span className="link-card-arrow">seed pending</span>
            </div>
          )}
        </div>

        <div className="section-title" style={{ marginTop: 24 }}>Media boundary rules</div>
        <div className="link-list">
          {(data?.mediaRules ?? []).map((rule) => (
            <div className="link-card" key={`${rule.domain}-${rule.backend}`}>
              <span>{rule.domain}</span>
              <span className="link-card-arrow">{rule.backend}</span>
            </div>
          ))}
        </div>

        <div className="section-title" style={{ marginTop: 24 }}>Action allowlist</div>
        <div className="link-list">
          {(data?.actions ?? []).map((action) => (
            <div className="link-card" key={action.id}>
              <span>{action.displayName}</span>
              <span className="link-card-arrow">
                {action.environmentScope} · {action.riskLevel} · approval:{action.requiresApproval ? "yes" : "no"}
              </span>
            </div>
          ))}
        </div>

        <div className="section-title" style={{ marginTop: 24 }}>Workflow runs (read-only)</div>
        <div className="link-list">
          {workflowRuns.map((run) => (
            <div className="link-card" key={run.id}>
              <span>{run.organizationSlug}</span>
              <span className="link-card-arrow">
                {run.status} · approval:{run.approvalStatus} · trace:{run.traceId}
              </span>
            </div>
          ))}
          {!workflowRuns.length && (
            <div className="link-card">
              <span>No workflow runs available</span>
              <span className="link-card-arrow">waiting for first execution</span>
            </div>
          )}
        </div>

        <div className="section-title" style={{ marginTop: 32 }}>Tenant config (controlled patch)</div>
        <p className="form-hint" style={{ marginBottom: 12, maxWidth: 640 }}>
          PATCH allowlist is fixed to <code>status</code>, <code>defaultLocale</code>, and <code>defaultTimezone</code>.
          Only <code>owner/admin</code> role header can mutate.
        </p>
        {defaultTenantConfig ? (
          <TenantConfigForm tenant={defaultTenantConfig} />
        ) : (
          <div className="link-card">
            <span>Tenant config unavailable</span>
            <span className="link-card-arrow">select tenant data source first</span>
          </div>
        )}

        <div className="section-title" style={{ marginTop: 32 }}>Controlled write — AI image job</div>
        <p className="form-hint" style={{ marginBottom: 12, maxWidth: 640 }}>
          Creates a <code>queued</code> row in <code>ai_image_jobs</code> and an audit event. Requires server env
          <code> SUPABASE_URL</code> + <code>SUPABASE_SERVICE_ROLE_KEY</code> (or anon key for dev) and applied migration{" "}
          <code>0011_ops_console_control_plane.sql</code>.
        </p>
        <AiJobForm defaultOrganizationId={defaultOrgId} />
      </div>
    </>
  );
}
