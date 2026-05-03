"use client";

import { useMemo, useState } from "react";
import {
  buildConsolePlan,
  type BuildExecutionMode,
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

export default function BuildConsole() {
  const [profile, setProfile] = useState<BuildProfile>("profile_b");
  const [form, setForm] = useState<BuildRunRequest>(PROFILE_DEFAULTS.profile_b);
  const [actorRole, setActorRole] = useState<OpsRole>("operator");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<BuildRunResponse | null>(null);

  const plan = useMemo(() => buildConsolePlan(form), [form]);

  const selectProfile = (nextProfile: BuildProfile) => {
    setProfile(nextProfile);
    setForm(PROFILE_DEFAULTS[nextProfile]);
    setResponse(null);
  };

  const update = <K extends keyof BuildRunRequest>(key: K, value: BuildRunRequest[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch("/api/build/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader(actorRole) },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as BuildRunResponse;
      setResponse(json);
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
    </div>
  );
}
