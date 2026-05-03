"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildConsolePlan,
  type BuildExecutionMode,
  type BuildIntegrations,
  type BuildPackageSlug,
  type BuildProfile,
  type BuildProvider,
  type BuildRunRequest,
  type BuildRunResponse,
} from "../../lib/build-console/contracts";
import type { OpsRole } from "../../lib/ops-contracts";
import { roleHeader } from "../../lib/ops-role";

const PROFILE_DEFAULTS: Record<BuildProfile, BuildRunRequest> = {
  profile_a: {
    profile: "profile_a",
    executionMode: "plan_only",
    environment: "staging",
    clientName: "AwareWave Ops",
    domain: "aware-wave.com",
    provider: "awarewave-internal",
    locale: "en_US",
  },
  profile_b: {
    profile: "profile_b",
    executionMode: "plan_only",
    environment: "staging",
    clientName: "Mongolia Travel",
    domain: "scenerytravelmongolia.com",
    provider: "hostinger",
    packageSlug: "wp-basic",
    locale: "en_US",
  },
  profile_c: {
    profile: "profile_c",
    executionMode: "plan_only",
    environment: "staging",
    clientName: "Soulful Expression",
    siteUrl: "https://soulfulexpression.com/",
    wpAdminUrl: "https://soulfulexpression.com/wp-admin",
    provider: "generic-wordpress",
    packageSlug: "wp-basic",
    locale: "zh_TW",
    backupConfirmed: false,
  },
};

const PROFILE_LABELS: Record<BuildProfile, string> = {
  profile_a: "Profile A",
  profile_b: "Profile B",
  profile_c: "Profile C",
};

const PROFILE_SUBTITLES: Record<BuildProfile, string> = {
  profile_a: "AO-agent / aware-wave.com",
  profile_b: "New customer / full cloud",
  profile_c: "Existing WordPress / adopt delta",
};

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="form-row">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

function SelectInput<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="form-row">
      <label className="form-label">{label}</label>
      <select className="form-select" value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type LiveRunStatus = {
  id: string;
  status: string;
  trigger_run_id?: string | null;
  error_summary?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "dispatch_failed", "cancelled", "blocked"]);

export default function BuildConsole() {
  const [profile, setProfile] = useState<BuildProfile>("profile_b");
  const [form, setForm] = useState<BuildRunRequest>(PROFILE_DEFAULTS.profile_b);
  const [actorRole, setActorRole] = useState<OpsRole>("operator");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<BuildRunResponse | null>(null);
  const [pollingRunId, setPollingRunId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveRunStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showIntegrations, setShowIntegrations] = useState(false);

  const plan = useMemo(() => buildConsolePlan(form), [form]);

  // Start/stop polling based on pollingRunId
  useEffect(() => {
    if (!pollingRunId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/build/runs/${pollingRunId}`);
        if (!res.ok) return;
        const json = (await res.json()) as { ok: boolean; run?: LiveRunStatus };
        if (json.ok && json.run) {
          setLiveStatus(json.run);
          if (TERMINAL_STATUSES.has(json.run.status)) {
            // Stop polling once we reach a terminal state
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch {
        // ignore transient network errors during polling
      }
    };

    poll(); // immediate first poll
    pollRef.current = setInterval(poll, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollingRunId]);

  const selectProfile = (nextProfile: BuildProfile) => {
    setProfile(nextProfile);
    setForm(PROFILE_DEFAULTS[nextProfile]);
    setResponse(null);
    setPollingRunId(null);
    setLiveStatus(null);
  };

  const update = <K extends keyof BuildRunRequest>(key: K, value: BuildRunRequest[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  // Deep-merge a partial value into form.integrations[service][field]
  const updateIntegration = <
    S extends keyof BuildIntegrations,
    F extends keyof NonNullable<BuildIntegrations[S]>,
  >(
    service: S,
    field: F,
    value: NonNullable<BuildIntegrations[S]>[F]
  ) => {
    setForm((current) => ({
      ...current,
      integrations: {
        ...current.integrations,
        [service]: {
          ...(current.integrations?.[service] as object | undefined),
          [field]: value,
        },
      },
    }));
  };

  const submit = async () => {
    setLoading(true);
    setResponse(null);
    setPollingRunId(null);
    setLiveStatus(null);
    try {
      const res = await fetch("/api/build/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader(actorRole) },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as BuildRunResponse;
      setResponse(json);
      // Start polling if a run was enqueued in Supabase
      if (json.ok && json.run?.supabaseRunId) {
        setPollingRunId(json.run.supabaseRunId);
      }
    } catch (error) {
      setResponse({ ok: false, error: error instanceof Error ? error.message : "request_failed" });
    } finally {
      setLoading(false);
    }
  };

  const canEnqueue = form.executionMode === "enqueue";

  return (
    <div className="build-console">
      <div className="build-profile-grid">
        {(["profile_a", "profile_b", "profile_c"] as BuildProfile[]).map((item) => (
          <button
            type="button"
            key={item}
            className={`build-profile-card ${profile === item ? "selected" : ""}`}
            onClick={() => selectProfile(item)}
          >
            <span className="build-profile-title">{PROFILE_LABELS[item]}</span>
            <span className="build-profile-subtitle">{PROFILE_SUBTITLES[item]}</span>
          </button>
        ))}
      </div>

      <div className="build-layout">
        <div className="build-panel">
          <div className="build-panel-head">
            <div>
              <div className="section-title">Run setup</div>
              <h2>{plan.label}</h2>
            </div>
            <span className={`build-risk build-risk-${plan.riskLevel}`}>{plan.riskLevel}</span>
          </div>

          <div className="build-form-grid">
            <SelectInput
              label="executionMode"
              value={(form.executionMode ?? "plan_only") as BuildExecutionMode}
              options={[
                { value: "plan_only", label: "plan_only" },
                { value: "enqueue", label: "enqueue" },
              ]}
              onChange={(value) => update("executionMode", value)}
            />
            <SelectInput
              label="environment"
              value={(form.environment ?? "staging") as "staging" | "production"}
              options={[
                { value: "staging", label: "staging" },
                { value: "production", label: "production" },
              ]}
              onChange={(value) => update("environment", value)}
            />
            <SelectInput
              label="simulated role"
              value={actorRole}
              options={[
                { value: "owner", label: "owner" },
                { value: "admin", label: "admin" },
                { value: "operator", label: "operator" },
                { value: "viewer", label: "viewer" },
              ]}
              onChange={(value) => setActorRole(value)}
            />
            <TextInput label="clientName" value={form.clientName} onChange={(value) => update("clientName", value)} />
          </div>

          {canEnqueue ? (
            <div className="build-form-grid">
              <TextInput
                label="organizationId"
                value={form.organizationId}
                onChange={(value) => update("organizationId", value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
              <TextInput label="workspaceId" value={form.workspaceId} onChange={(value) => update("workspaceId", value)} />
              <TextInput label="projectId" value={form.projectId} onChange={(value) => update("projectId", value)} />
              <TextInput label="siteId" value={form.siteId} onChange={(value) => update("siteId", value)} />
            </div>
          ) : null}

          {profile === "profile_a" ? (
            <div className="build-form-grid">
              <TextInput label="domain" value={form.domain} onChange={(value) => update("domain", value)} />
            </div>
          ) : null}

          {profile === "profile_b" ? (
            <div className="build-form-grid">
              <TextInput label="domain" value={form.domain} onChange={(value) => update("domain", value)} />
              <SelectInput
                label="provider"
                value={(form.provider ?? "hostinger") as BuildProvider}
                options={[
                  { value: "hostinger", label: "hostinger" },
                  { value: "cloudways", label: "cloudways" },
                  { value: "generic-wordpress", label: "generic-wordpress" },
                  { value: "manual", label: "manual" },
                ]}
                onChange={(value) => update("provider", value)}
              />
              <SelectInput
                label="packageSlug"
                value={(form.packageSlug ?? "wp-basic") as BuildPackageSlug}
                options={[
                  { value: "wp-basic", label: "wp-basic" },
                  { value: "wp-business", label: "wp-business" },
                  { value: "wc-core", label: "wc-core" },
                ]}
                onChange={(value) => update("packageSlug", value)}
              />
              <TextInput label="locale" value={form.locale} onChange={(value) => update("locale", value)} />
            </div>
          ) : null}

          {profile === "profile_c" ? (
            <>
              <div className="build-form-grid">
                <TextInput label="siteUrl" value={form.siteUrl} onChange={(value) => update("siteUrl", value)} />
                <TextInput label="wpAdminUrl" value={form.wpAdminUrl} onChange={(value) => update("wpAdminUrl", value)} />
                <SelectInput
                  label="provider"
                  value={(form.provider ?? "generic-wordpress") as BuildProvider}
                  options={[
                    { value: "generic-wordpress", label: "generic-wordpress" },
                    { value: "hostinger", label: "hostinger" },
                    { value: "cloudways", label: "cloudways" },
                    { value: "manual", label: "manual" },
                  ]}
                  onChange={(value) => update("provider", value)}
                />
                <SelectInput
                  label="packageSlug"
                  value={(form.packageSlug ?? "wp-basic") as BuildPackageSlug}
                  options={[
                    { value: "wp-basic", label: "wp-basic" },
                    { value: "wp-business", label: "wp-business" },
                    { value: "wc-core", label: "wc-core" },
                  ]}
                  onChange={(value) => update("packageSlug", value)}
                />
                <TextInput
                  label="credentialsRef"
                  value={form.credentialsRef}
                  onChange={(value) => update("credentialsRef", value)}
                  placeholder="vault://wordpress/soulful-expression"
                />
                <TextInput
                  label="backupRef"
                  value={form.backupRef}
                  onChange={(value) => update("backupRef", value)}
                  placeholder="hostinger-backup-YYYYMMDD"
                />
              </div>
              <label className="build-checkbox">
                <input
                  type="checkbox"
                  checked={!!form.backupConfirmed}
                  onChange={(event) => update("backupConfirmed", event.target.checked)}
                />
                <span>backupConfirmed</span>
              </label>
            </>
          ) : null}

          {/* ── Integrations ──────────────────────────────────────────────── */}
          <div className="build-integrations-toggle">
            <button
              type="button"
              className="build-integrations-toggle-btn"
              onClick={() => setShowIntegrations((v) => !v)}
            >
              <span>{showIntegrations ? "▼" : "▶"}</span>
              Integrations
              <span className="build-integrations-hint">
                {[
                  form.integrations?.uptimeKuma?.url       ? "Uptime Kuma" : null,
                  form.integrations?.sentry?.org           ? "Sentry" : null,
                  form.integrations?.postHog?.projectApiKey ? "PostHog" : null,
                  form.integrations?.n8n?.onboardingWebhookUrl ? "n8n" : null,
                  form.integrations?.mainWp?.dashboardUrl  ? "MainWP" : null,
                ].filter(Boolean).join(" · ") || "none configured"}
              </span>
            </button>
          </div>

          {showIntegrations ? (
            <div className="build-integrations-body">

              {/* Uptime Kuma */}
              <div className="build-integration-group">
                <div className="build-integration-label">Uptime Kuma</div>
                <div className="build-form-grid">
                  <TextInput
                    label="URL"
                    value={form.integrations?.uptimeKuma?.url}
                    onChange={(v) => updateIntegration("uptimeKuma", "url", v)}
                    placeholder="https://uptime.aware-wave.com"
                  />
                  <TextInput
                    label="API Key"
                    value={form.integrations?.uptimeKuma?.apiKey}
                    onChange={(v) => updateIntegration("uptimeKuma", "apiKey", v)}
                    placeholder="uk1_xxxxxxxxxxxx"
                  />
                  <TextInput
                    label="Group (optional)"
                    value={form.integrations?.uptimeKuma?.groupName}
                    onChange={(v) => updateIntegration("uptimeKuma", "groupName", v)}
                    placeholder="Clients"
                  />
                </div>
              </div>

              {/* Sentry */}
              <div className="build-integration-group">
                <div className="build-integration-label">Sentry</div>
                <div className="build-form-grid">
                  <TextInput
                    label="Org slug"
                    value={form.integrations?.sentry?.org}
                    onChange={(v) => updateIntegration("sentry", "org", v)}
                    placeholder="aware-wave"
                  />
                  <TextInput
                    label="Auth Token"
                    value={form.integrations?.sentry?.authToken}
                    onChange={(v) => updateIntegration("sentry", "authToken", v)}
                    placeholder="sntrys_xxxxxxxxxxxx"
                  />
                  <TextInput
                    label="Team (optional)"
                    value={form.integrations?.sentry?.team}
                    onChange={(v) => updateIntegration("sentry", "team", v)}
                    placeholder="client-sites"
                  />
                </div>
              </div>

              {/* PostHog */}
              <div className="build-integration-group">
                <div className="build-integration-label">PostHog</div>
                <div className="build-form-grid">
                  <TextInput
                    label="Project API Key"
                    value={form.integrations?.postHog?.projectApiKey}
                    onChange={(v) => updateIntegration("postHog", "projectApiKey", v)}
                    placeholder="phc_xxxxxxxxxxxx"
                  />
                  <TextInput
                    label="Host (optional)"
                    value={form.integrations?.postHog?.host}
                    onChange={(v) => updateIntegration("postHog", "host", v)}
                    placeholder="https://app.posthog.com"
                  />
                </div>
              </div>

              {/* n8n */}
              <div className="build-integration-group">
                <div className="build-integration-label">n8n — Client Onboarding Webhook</div>
                <div className="build-form-grid">
                  <TextInput
                    label="Webhook URL"
                    value={form.integrations?.n8n?.onboardingWebhookUrl}
                    onChange={(v) => updateIntegration("n8n", "onboardingWebhookUrl", v)}
                    placeholder="https://n8n.aware-wave.com/webhook/client-onboarding"
                  />
                  <TextInput
                    label="Bearer Token (optional)"
                    value={form.integrations?.n8n?.bearerToken}
                    onChange={(v) => updateIntegration("n8n", "bearerToken", v)}
                    placeholder="webhook_secret"
                  />
                </div>
              </div>

              {/* MainWP */}
              <div className="build-integration-group">
                <div className="build-integration-label">MainWP Dashboard</div>
                <div className="build-form-grid">
                  <TextInput
                    label="Dashboard URL"
                    value={form.integrations?.mainWp?.dashboardUrl}
                    onChange={(v) => updateIntegration("mainWp", "dashboardUrl", v)}
                    placeholder="https://mainwp.aware-wave.com"
                  />
                  <TextInput
                    label="Consumer Key"
                    value={form.integrations?.mainWp?.consumerKey}
                    onChange={(v) => updateIntegration("mainWp", "consumerKey", v)}
                    placeholder="ck_xxxxxxxxxxxx"
                  />
                  <TextInput
                    label="Consumer Secret"
                    value={form.integrations?.mainWp?.consumerSecret}
                    onChange={(v) => updateIntegration("mainWp", "consumerSecret", v)}
                    placeholder="cs_xxxxxxxxxxxx"
                  />
                </div>
              </div>

            </div>
          ) : null}

          <div className="form-row">
            <label className="form-label">notes</label>
            <textarea className="form-textarea" value={form.notes ?? ""} onChange={(event) => update("notes", event.target.value)} />
          </div>

          <button type="button" className="btn-primary build-submit" disabled={loading} onClick={submit}>
            <span aria-hidden="true">{canEnqueue ? ">" : "+"}</span>
            {loading ? "Submitting..." : canEnqueue ? "Queue guarded run" : "Create run plan"}
          </button>
        </div>

        <div className="build-panel">
          <div className="build-panel-head">
            <div>
              <div className="section-title">Profile gates</div>
              <h2>{plan.workflowId}</h2>
            </div>
            <span className="card-badge badge-gray">{plan.applyMode}</span>
          </div>

          {plan.blockers.length ? (
            <div className="build-alert build-alert-blocked">
              {plan.blockers.map((blocker) => (
                <div key={blocker}>{blocker}</div>
              ))}
            </div>
          ) : (
            <div className="build-alert build-alert-ok">ready for {form.executionMode ?? "plan_only"}</div>
          )}

          {plan.warnings.length ? (
            <div className="build-alert build-alert-warning">
              {plan.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}

          <div className="build-kv-grid">
            <div><span>actionKey</span><strong>{plan.actionKey}</strong></div>
            <div><span>provider</span><strong>{plan.provider}</strong></div>
            <div><span>smokeProfile</span><strong>{plan.smokeProfile}</strong></div>
            <div><span>approval</span><strong>{plan.approvalRequired ? "required" : "not required"}</strong></div>
          </div>

          <div className="build-list-block">
            <div className="section-title">Stages</div>
            <ol className="build-stage-list">
              {plan.stages.map((stage) => (
                <li key={stage.id}>
                  <strong>{stage.label}</strong>
                  <span>{stage.gate}</span>
                  <em>{stage.automation}</em>
                </li>
              ))}
            </ol>
          </div>

          <div className="build-list-block">
            <div className="section-title">Smoke tests</div>
            <div className="build-chip-list">
              {plan.smokeTests.map((test) => (
                <span className="build-chip" key={test}>{test}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {response ? (
        <div className="build-panel build-output">
          <div className="build-panel-head">
            <div>
              <div className="section-title">Execution output</div>
              <h2>{response.ok ? response.run?.status : response.error}</h2>
            </div>
            <span className={`card-badge ${response.ok ? "badge-green" : "badge-red"}`}>
              {response.ok ? "OK" : "Error"}
            </span>
          </div>
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </div>
      ) : null}

      {pollingRunId ? (
        <div className="build-panel build-output">
          <div className="build-panel-head">
            <div>
              <div className="section-title">Live run status</div>
              <h2>{liveStatus?.status ?? "polling…"}</h2>
            </div>
            <span
              className={`card-badge ${
                !liveStatus ? "badge-gray"
                : liveStatus.status === "completed" ? "badge-green"
                : liveStatus.status === "failed" || liveStatus.status === "dispatch_failed" ? "badge-red"
                : liveStatus.status === "dispatched" || liveStatus.status === "running" ? "badge-yellow"
                : "badge-gray"
              }`}
            >
              {liveStatus ? liveStatus.status : "…"}
            </span>
          </div>

          <div className="build-kv-grid">
            <div><span>run id</span><strong>{pollingRunId}</strong></div>
            {liveStatus?.trigger_run_id ? (
              <div><span>trigger run</span><strong>{liveStatus.trigger_run_id}</strong></div>
            ) : null}
            {liveStatus?.started_at ? (
              <div><span>started</span><strong>{new Date(liveStatus.started_at).toLocaleTimeString()}</strong></div>
            ) : null}
            {liveStatus?.ended_at ? (
              <div><span>ended</span><strong>{new Date(liveStatus.ended_at).toLocaleTimeString()}</strong></div>
            ) : null}
            {liveStatus?.error_summary ? (
              <div><span>error</span><strong className="text-red-500">{liveStatus.error_summary}</strong></div>
            ) : null}
          </div>

          {!liveStatus || !TERMINAL_STATUSES.has(liveStatus.status) ? (
            <div className="build-alert build-alert-ok">
              Polling every 3 s — waiting for dispatcher to pick up run…
            </div>
          ) : liveStatus.status === "completed" ? (
            <div className="build-alert build-alert-ok">Run completed successfully.</div>
          ) : liveStatus.status === "dispatched" ? (
            <div className="build-alert build-alert-ok">
              Dispatched to Trigger.dev. Workflow is now running.
            </div>
          ) : (
            <div className="build-alert build-alert-blocked">
              Run ended with status: {liveStatus.status}
              {liveStatus.error_summary ? ` — ${liveStatus.error_summary}` : ""}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
