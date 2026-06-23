"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<BuildProfile>("profile_b");
  const [form, setForm] = useState<BuildRunRequest>(PROFILE_DEFAULTS.profile_b);
  const [actorRole, setActorRole] = useState<OpsRole>("operator");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<BuildRunResponse | null>(null);
  const [pollingRunId, setPollingRunId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveRunStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showIntegrations, setShowIntegrations] = useState(true);
  const [showPrerequisites, setShowPrerequisites] = useState(true);

  // Pre-fill from /onboard Step 4 URL params
  useEffect(() => {
    const p = searchParams.get("profile") as BuildProfile | null;
    if (!p || !PROFILE_DEFAULTS[p]) return;
    const base = { ...PROFILE_DEFAULTS[p] };
    const str = (key: string) => searchParams.get(key) ?? undefined;
    base.clientName    = str("clientName")    ?? base.clientName;
    base.environment   = (str("environment") as "staging" | "production") ?? base.environment;
    base.organizationId = str("organizationId") ?? base.organizationId;
    base.workspaceId   = str("workspaceId")   ?? base.workspaceId;
    base.projectId     = str("projectId")     ?? base.projectId;
    base.siteId        = str("siteId")        ?? base.siteId;
    if (p === "profile_b") {
      base.domain      = str("domain")        ?? base.domain;
      base.provider    = (str("provider") as BuildProvider) ?? base.provider;
      base.packageSlug = (str("packageSlug") as BuildPackageSlug) ?? base.packageSlug;
      base.locale      = str("locale")        ?? base.locale;
    }
    if (p === "profile_c") {
      base.siteUrl     = str("siteUrl")       ?? base.siteUrl;
      base.wpAdminUrl  = str("wpAdminUrl")    ?? base.wpAdminUrl;
    }
    // Plugin stack params from OnboardWizard Step 2 (pack-based model)
    const selectedPacksRaw = searchParams.get("selectedPacks");
    if (selectedPacksRaw) base.selectedPacks = selectedPacksRaw.split(",").filter(Boolean) as import("../../lib/build-console/contracts").WpPluginModule[];
    const pluginSlugsRaw = searchParams.get("pluginSlugs");
    if (pluginSlugsRaw) base.pluginSlugs = pluginSlugsRaw.split(",").filter(Boolean);
    const paidCount = Number(searchParams.get("paidPluginCount") ?? "0") || undefined;
    if (paidCount) base.paidPluginCount = paidCount;
    // SSH target params (operator-supplied via Wizard Step 1) — required for tasks.trigger(wp-install-plugins)
    const sshHostRaw = searchParams.get("sshHost");
    if (sshHostRaw) base.sshHost = sshHostRaw;
    const wpPathRaw = searchParams.get("wpPath");
    if (wpPathRaw) base.wpPath = wpPathRaw;
    const sshRefRaw = searchParams.get("sshCredentialsRef");
    if (sshRefRaw) base.sshCredentialsRef = sshRefRaw;
    setProfile(p);
    setForm({ ...base, executionMode: "enqueue" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {/* ── Onboard hint banner ──────────────────────────────────────────── */}
      {searchParams.get("profile") ? (
        <div className="build-alert build-alert-ok" style={{ marginBottom: 16 }}>
          ✓ 已從 New Client Onboarding 帶入客戶資料 — 確認欄位後選擇 <code>enqueue</code> 模式執行。
        </div>
      ) : (
        <div className="build-alert build-alert-warning" style={{ marginBottom: 16 }}>
          新客戶請先完成{" "}
          <a href="/onboard" style={{ color: "inherit", fontWeight: 600 }}>New Client Onboarding</a>
          {" "}流程（部門選型 + 服務開通），再從該頁啟動 Build Console。
        </div>
      )}

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

          <div className="build-prerequisites">
            <button
              type="button"
              className="build-prerequisites-toggle-btn"
              onClick={() => setShowPrerequisites((v) => !v)}
            >
              <span>{showPrerequisites ? "▼" : "▶"}</span>
              前置：帳號／專案（填 Integrations API 之前）
            </button>
            {showPrerequisites ? (
              <div className="build-prerequisites-body">
                <p>
                  沒有任何一家提供「從本頁一鍵代你在六個平台建立帳號」的聯合 API；請在各家網站註冊／登入（雲端服務通常可選
                  <strong>以 Google 繼續</strong>
                  ）。下列為 Aware Wave 現網入口與常用雲端註冊連結；取得 Token／API Key 後再展開 Integrations。
                </p>
                <ul className="build-prerequisites-list">
                  <li>
                    <a href="https://sentry.io/signup/" target="_blank" rel="noopener noreferrer">
                      Sentry（雲端註冊）
                    </a>
                    — 建立 org／team，稍後在 Settings 建立 Auth Token。
                  </li>
                  <li>
                    <a href="https://app.posthog.com/signup" target="_blank" rel="noopener noreferrer">
                      PostHog Cloud（註冊）
                    </a>
                    — 若用 EU 請改登入你選的區域；之後取 Project API Key。
                  </li>
                  <li>
                    <a href="https://studio.aware-wave.com" target="_blank" rel="noopener noreferrer">
                      Supabase Studio（自架 EU）
                    </a>
                    — 現網專案／Service Role 金鑰由既有部署治理；非 supabase.com 新開雲端專案流程。
                  </li>
                  <li>
                    <a href="https://uptime.aware-wave.com" target="_blank" rel="noopener noreferrer">
                      Uptime Kuma（自架）
                    </a>
                    — 首次開站建立管理員，再到 Settings → API Keys。
                  </li>
                  <li>
                    <a href="https://n8n.aware-wave.com" target="_blank" rel="noopener noreferrer">
                      n8n（自架）
                    </a>
                    — 建立可登入使用者後設定 webhook／認證。
                  </li>
                  <li>
                    <a href="https://trigger.aware-wave.com" target="_blank" rel="noopener noreferrer">
                      Trigger.dev（自架 web）
                    </a>
                    — 建立／登入組織與專案（與 CLI／worker 部署見 infra/trigger README）。
                  </li>
                </ul>
              </div>
            ) : null}
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

          {/* ── WP Plugin Stack Summary ──────────────────────────────────── */}
          {form.pluginSlugs && form.pluginSlugs.length > 0 && (
            <div className="build-plugin-stack-summary" style={{ margin: "12px 0", padding: "12px 16px", background: "var(--badge-green-bg)", border: "1px solid var(--badge-green-bg)", borderRadius: 8 }}>
              <div className="section-title" style={{ marginBottom: 8 }}>📦 WordPress 外掛堆疊（OnboardWizard Step 2 帶入）</div>
              <div className="build-kv-grid">
                <div>
                  <span>外掛包</span>
                  <strong>
                    {form.selectedPacks && form.selectedPacks.length > 0
                      ? `基礎包 + ${form.selectedPacks.map((p) => ({ ecommerce: "電商包", tourism: "旅遊包", brand: "形象包" } as Record<string,string>)[p] ?? p).join(" + ")}`
                      : "基礎包"}
                  </strong>
                </div>
                <div>
                  <span>🟢 自動安裝（WP.org）</span>
                  <strong style={{ color: "var(--badge-green-text)" }}>{form.pluginSlugs.length} 個</strong>
                </div>
                {form.paidPluginCount ? (
                  <div>
                    <span>🟡 需手動上傳（付費）</span>
                    <strong style={{ color: "var(--build-risk-medium-text)" }}>{form.paidPluginCount} 個</strong>
                  </div>
                ) : null}
                <div>
                  <span>SSH host（一鍵安裝必要）</span>
                  <strong style={{ color: form.sshHost ? "var(--badge-green-text)" : "var(--build-risk-medium-text)", fontFamily: form.sshHost ? "monospace" : undefined, fontSize: 11 }}>
                    {form.sshHost ?? "未提供 — 安裝會跳過（Wizard Step 1 可補）"}
                  </strong>
                </div>
                {form.wpPath && (
                  <div>
                    <span>WP 路徑</span>
                    <strong style={{ fontFamily: "monospace", fontSize: 11 }}>{form.wpPath}</strong>
                  </div>
                )}
              </div>
              <p className="form-hint" style={{ marginTop: 8, fontSize: 11, marginBottom: 0 }}>
                Enqueue 後 Trigger.dev 自動觸發 wp-install-plugins task；SSH 執行需在 EU 機器設定{" "}
                <code>LOBSTER_EXECUTE_MANIFEST_STEPS=true</code> 才會真的安裝（否則 dry-run）。
              </p>
            </div>
          )}

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
            <div className="build-alert build-alert-ok">
              Run completed successfully.{" "}
              <Link href="/ops/clients" style={{ color: "inherit", fontWeight: 600 }}>
                → 查看客戶狀態
              </Link>
            </div>
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
