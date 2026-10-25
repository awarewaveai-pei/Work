"use client";

import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AssetRow, IntegrationRow } from "@/app/api/ops/integrations/route";

interface OrganizationOption {
  id: string;
  slug: string;
  name: string;
}

const DEFAULT_PROVIDERS = [
  "sentry",
  "uptime_kuma",
  "grafana",
  "netdata",
  "posthog",
  "github",
  "slack",
  "telegram",
  "n8n",
  "trigger",
  "supabase",
  "wordpress",
  "cloudflare",
];

/** Adds a connection to `organization`, the client picked on the page (?org=). */
export function IntegrationCreatePanel({
  organization,
  assets,
  providers = DEFAULT_PROVIDERS,
}: {
  organization: OrganizationOption;
  assets: AssetRow[];
  providers?: string[];
}) {
  const router = useRouter();
  const organizationId = organization.id;
  const [assetId, setAssetId] = useState("");
  const [provider, setProvider] = useState(providers[0] ?? "sentry");
  const [secretRef, setSecretRef] = useState("");
  const [externalHint, setExternalHint] = useState("");
  const [status, setStatus] = useState("pending");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const availableAssets = useMemo(
    () => assets.filter((asset) => asset.organization_id === organizationId),
    [assets, organizationId],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const response = await fetch("/api/ops/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: organizationId,
        asset_id: assetId || null,
        provider,
        secret_ref: secretRef || null,
        external_hint: externalHint || null,
        status,
        provisioning_source: "manual",
        api_metadata: {
          setup_surface: "ops_integrations",
        },
      }),
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; details?: string } | null;
    setBusy(false);

    if (!response.ok || !result?.ok) {
      setMessage(result?.details ?? result?.error ?? "Integration save failed.");
      return;
    }

    setMessage("Integration saved.");
    setSecretRef("");
    setExternalHint("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} style={panelStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(160px, 0.8fr) minmax(160px, 0.8fr)", gap: 10 }}>
        <Field label="Client">
          <div style={{ ...inputStyle, display: "flex", alignItems: "center" }}>{organization.name} ({organization.slug})</div>
        </Field>

        <Field label="Asset">
          <select value={assetId} onChange={(event) => setAssetId(event.target.value)} style={inputStyle}>
            <option value="">Client-level</option>
            {availableAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Provider">
          <select value={provider} onChange={(event) => setProvider(event.target.value)} style={inputStyle}>
            {providers.map((item) => (
              <option key={item} value={item}>{providerLabel(item)}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(180px, 1fr) 140px", gap: 10, marginTop: 10 }}>
        <Field label="Secret reference">
          <input
            value={secretRef}
            onChange={(event) => setSecretRef(event.target.value)}
            placeholder="vault:sentry/customer-x"
            style={inputStyle}
          />
        </Field>

        <Field label="External hint">
          <input
            value={externalHint}
            onChange={(event) => setExternalHint(event.target.value)}
            placeholder="project, channel, monitor, repo"
            style={inputStyle}
          />
        </Field>

        <Field label="Status">
          <select value={status} onChange={(event) => setStatus(event.target.value)} style={inputStyle}>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="failed">Failed</option>
            <option value="revoked">Revoked</option>
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 12 }}>
        <div style={{ fontSize: 11, color: message?.includes("failed") ? "var(--badge-red-text)" : "var(--text-muted)" }}>
          {message ?? "Secrets are referenced by name only. Raw tokens do not belong in Repair OS records."}
        </div>
        <button type="submit" disabled={busy || !organizationId || !provider} style={primaryButtonStyle}>
          {busy ? "Saving..." : "Save integration"}
        </button>
      </div>
    </form>
  );
}

export function IntegrationRowActions({ integration }: { integration: IntegrationRow }) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: string) {
    setBusyAction(action);
    setMessage(null);
    const response = await fetch("/api/ops/integrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: integration.id, action }),
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; details?: string } | null;
    setBusyAction(null);

    if (!response.ok || !result?.ok) {
      setMessage(result?.details ?? result?.error ?? "Action failed.");
      return;
    }

    setMessage(action === "validate" ? "Validated." : "Updated.");
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button type="button" onClick={() => run("validate")} disabled={!!busyAction} style={smallButtonStyle}>
          {busyAction === "validate" ? "..." : "Validate"}
        </button>
        {integration.status !== "active" && (
          <button type="button" onClick={() => run("activate")} disabled={!!busyAction} style={smallButtonStyle}>
            Active
          </button>
        )}
        {integration.status !== "revoked" && (
          <button type="button" onClick={() => run("revoke")} disabled={!!busyAction} style={dangerButtonStyle}>
            Revoke
          </button>
        )}
      </div>
      {message ? <div style={{ fontSize: 11, color: message.includes("failed") ? "var(--badge-red-text)" : "var(--text-muted)" }}>{message}</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 650, color: "var(--text-secondary)" }}>
      <span>{label}</span>
      {children}
    </label>
  );
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

const panelStyle: CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
  padding: 14,
  marginBottom: 16,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
  color: "var(--text-primary)",
  background: "var(--card-bg)",
};

const primaryButtonStyle: CSSProperties = {
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--btn-primary-text)",
  borderRadius: 6,
  padding: "7px 11px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const smallButtonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--card-bg)",
  color: "var(--text-primary)",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 650,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  borderColor: "var(--red)",
  color: "var(--badge-red-text)",
  background: "var(--badge-red-bg)",
};
