import Link from "next/link";
import type { CSSProperties } from "react";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { AssetRow, IntegrationRow } from "@/app/api/ops/integrations/route";

export const dynamic = "force-dynamic";

const PROVIDERS = [
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

interface OrganizationRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

export default async function IntegrationsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return <ErrorPanel message="Supabase not configured." />;

  const orgRes = await supabase
    .from("organizations")
    .select("id,slug,name,type,status,metadata")
    .order("created_at", { ascending: true });

  if (orgRes.error) return <ErrorPanel message={orgRes.error.message} />;

  const [assetRes, integrationRes] = await Promise.all([
    supabase
      .from("assets")
      .select("id,organization_id,slug,name,asset_type,environment,primary_url,provider,status")
      .order("created_at", { ascending: true }),
    supabase
      .from("tenant_integration_bindings")
      .select("id,organization_id,asset_id,provider,secret_ref,external_hint,api_metadata,provisioning_source,status,last_error,last_tested_at,last_seen_at,created_at")
      .order("created_at", { ascending: true }),
  ]);

  const organizations = (orgRes.data ?? []) as OrganizationRow[];
  const assets = (assetRes.data ?? []) as AssetRow[];
  const integrations = (integrationRes.data ?? []) as IntegrationRow[];
  const assetsReady = !assetRes.error;
  const integrationsReady = !integrationRes.error;

  const assetById = new Map(assets.map((a) => [a.id, a]));
  const assetsByOrg = groupBy(assets, (a) => a.organization_id);
  const integrationsByOrg = groupBy(integrations, (i) => i.organization_id);

  const activeCount = integrations.filter((i) => i.status === "active").length;
  const failedCount = integrations.filter((i) => i.status === "failed").length;
  const pendingCount = integrations.filter((i) => i.status === "pending").length;

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 750, color: "var(--text-primary)", marginBottom: 4 }}>Integrations</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 760 }}>
            Client connection center. Every monitoring, AI, notification, repository, automation, and hosting connection should be visible here before it powers Repair Center.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Metric label="active" value={activeCount} tone="ok" />
          <Metric label="pending" value={pendingCount} tone="warn" />
          <Metric label="failed" value={failedCount} tone={failedCount ? "danger" : "muted"} />
        </div>
      </header>

      {(!assetsReady || !integrationsReady) && (
        <div style={{ marginBottom: 16 }}>
          <ReadinessBanner
            assetsReady={assetsReady}
            integrationsReady={integrationsReady}
            assetsError={assetRes.error?.message ?? null}
            integrationsError={integrationRes.error?.message ?? null}
          />
        </div>
      )}

      <section style={{ display: "grid", gap: 14 }}>
        {organizations.map((org) => {
          const orgAssets = assetsByOrg.get(org.id) ?? [];
          const orgIntegrations = integrationsByOrg.get(org.id) ?? [];
          const configuredProviders = new Set(orgIntegrations.map((i) => i.provider));
          const missing = PROVIDERS.filter((p) => !configuredProviders.has(p));

          return (
            <article key={org.id} style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 750, color: "var(--text-primary)", margin: 0 }}>{org.name}</h2>
                    <Pill text={org.type} />
                    <Pill text={org.status} tone={org.status === "active" ? "ok" : "muted"} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{org.slug}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/ops/clients/${org.slug}`} style={linkButtonStyle}>Client</Link>
                  <Link href={`/ops/repairs?client_slug=${org.slug}`} style={linkButtonStyle}>Repairs</Link>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)", gap: 14 }}>
                <div>
                  <h3 style={sectionTitleStyle}>Assets</h3>
                  {orgAssets.length ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {orgAssets.map((asset) => (
                        <div key={asset.id} style={smallRowStyle}>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ display: "block", fontSize: 12, color: "var(--text-primary)" }}>{asset.name}</strong>
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {asset.asset_type} · {asset.environment}{asset.provider ? ` · ${asset.provider}` : ""}
                            </span>
                          </div>
                          <Pill text={asset.status} tone={asset.status === "active" ? "ok" : "muted"} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty text={assetsReady ? "No assets registered yet." : "Apply asset migration to enable this section."} />
                  )}
                </div>

                <div>
                  <h3 style={sectionTitleStyle}>Connections</h3>
                  {orgIntegrations.length ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {orgIntegrations.map((integration) => {
                        const asset = integration.asset_id ? assetById.get(integration.asset_id) : null;
                        return (
                          <div key={integration.id} style={smallRowStyle}>
                            <div style={{ minWidth: 0 }}>
                              <strong style={{ display: "block", fontSize: 12, color: "var(--text-primary)" }}>{providerLabel(integration.provider)}</strong>
                              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                {asset ? asset.name : "client-level"} · {integration.provisioning_source}
                                {integration.external_hint ? ` · ${integration.external_hint}` : ""}
                              </span>
                              {integration.last_error ? (
                                <div style={{ fontSize: 11, color: "#991b1b", marginTop: 3 }}>{integration.last_error}</div>
                              ) : null}
                            </div>
                            <Pill text={integration.status} tone={statusTone(integration.status)} />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty text={integrationsReady ? "No integrations registered yet." : "Apply integration registry migration to enable this section."} />
                  )}

                  {missing.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
                      Missing provider records: {missing.map(providerLabel).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
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

function statusTone(status: string): "ok" | "warn" | "danger" | "muted" {
  if (status === "active") return "ok";
  if (status === "pending") return "warn";
  if (status === "failed" || status === "revoked") return "danger";
  return "muted";
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "danger" | "muted" }) {
  return (
    <div style={{ ...metricStyle, ...toneStyle(tone) }}>
      <strong style={{ fontSize: 18 }}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Pill({ text, tone = "muted" }: { text: string; tone?: "ok" | "warn" | "danger" | "muted" }) {
  return <span style={{ ...pillStyle, ...toneStyle(tone) }}>{text}</span>;
}

function Empty({ text }: { text: string }) {
  return <div style={{ border: "1px dashed #cbd5e1", borderRadius: 8, padding: 12, fontSize: 12, color: "var(--text-muted)" }}>{text}</div>;
}

function ReadinessBanner({
  assetsReady,
  integrationsReady,
  assetsError,
  integrationsError,
}: {
  assetsReady: boolean;
  integrationsReady: boolean;
  assetsError: string | null;
  integrationsError: string | null;
}) {
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.6 }}>
      <strong>Data foundation migration required.</strong>
      <div>
        assets: {assetsReady ? "ready" : assetsError ?? "not ready"} · integrations: {integrationsReady ? "ready" : integrationsError ?? "not ready"}
      </div>
      <div>Apply migration <code>0028_repair_os_client_asset_scope.sql</code> before treating this page as production-ready.</div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div style={{ margin: 32, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, padding: 18 }}>
      <strong>Integrations unavailable</strong>
      <div style={{ marginTop: 6, fontSize: 13 }}>{message}</div>
    </div>
  );
}

function toneStyle(tone: "ok" | "warn" | "danger" | "muted"): CSSProperties {
  if (tone === "ok") return { background: "#f0fdf4", color: "#166534", borderColor: "#bbf7d0" };
  if (tone === "warn") return { background: "#fffbeb", color: "#92400e", borderColor: "#fde68a" };
  if (tone === "danger") return { background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" };
  return { background: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" };
}

const panelStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid var(--border-subtle)",
  borderRadius: 8,
  padding: 16,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 750,
  color: "var(--text-secondary)",
  marginBottom: 8,
};

const smallRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "9px 10px",
};

const linkButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "6px 10px",
  color: "var(--accent)",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 650,
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 650,
  whiteSpace: "nowrap",
};

const metricStyle: CSSProperties = {
  display: "grid",
  gap: 1,
  minWidth: 78,
  border: "1px solid",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 11,
  textAlign: "right",
};
