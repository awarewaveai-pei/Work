"use client";

import { useState } from "react";
import Link from "next/link";
import { WpUpdateButtons } from "./WpUpdateButtons";
import type { ClientConfig, WpUpdateLatest } from "@/app/api/ops/clients/route";
import type { DepartmentSummaryPayload } from "@/app/api/ops/clients/[slug]/department-summary/route";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntegrationBinding {
  provider: string;
  status: string;
  last_tested_at: string | null;
  last_error: string | null;
}

export interface WpSiteStub {
  id: string;
  name: string;
  url: string;
  color: string | null;
  active: boolean;
  content_defaults: Record<string, unknown> | null;
}

export interface RunRow {
  id: string;
  action_id: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface InstallRunRow {
  id: string;
  status: string;
  result_summary: unknown;
  created_at: string | null;
}

export interface ClientHubTabsProps {
  org: { id: string; slug: string; name: string; type: string; status: string };
  cfg: ClientConfig;
  health: { ok: boolean; statusCode: number | null } | null;
  wp: WpUpdateLatest | null;
  runs: RunRow[];
  installRuns: InstallRunRow[];
  deptSummary: DepartmentSummaryPayload;
  integrations: IntegrationBinding[];
  wpSites: WpSiteStub[];
}

// ── Provider catalogue ────────────────────────────────────────────────────────

const PROVIDER_GROUPS: Array<{ label: string; providers: Array<{ key: string; name: string }> }> = [
  // Changes to this array automatically update the "未設定" metric below via TOTAL_PROVIDERS
  {
    label: "監控 & 分析",
    providers: [
      { key: "sentry", name: "Sentry" },
      { key: "uptime_kuma", name: "Uptime Kuma" },
      { key: "grafana", name: "Grafana" },
      { key: "netdata", name: "Netdata" },
      { key: "posthog", name: "PostHog" },
    ],
  },
  {
    label: "協作 & 自動化",
    providers: [
      { key: "github", name: "GitHub" },
      { key: "slack", name: "Slack" },
      { key: "telegram", name: "Telegram" },
      { key: "n8n", name: "n8n" },
      { key: "trigger", name: "Trigger.dev" },
    ],
  },
  {
    label: "基礎設施",
    providers: [
      { key: "supabase", name: "Supabase" },
      { key: "wordpress", name: "WordPress" },
      { key: "cloudflare", name: "Cloudflare" },
    ],
  },
];

const TOTAL_PROVIDERS = PROVIDER_GROUPS.reduce((n, g) => n + g.providers.length, 0);

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const ms = Date.now() - new Date(isoStr).getTime();
  if (Number.isNaN(ms)) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "剛才";
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

type InstallSummary = { plugin_slug?: string; status?: string; version?: string | null; error_message?: string | null };

// ── Sub-components ────────────────────────────────────────────────────────────

function Card({ title, badge, children, action }: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
      borderRadius: 12, padding: "16px 18px", marginBottom: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {badge && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{badge}</span>}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function NoData({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>{children}</p>;
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, marginTop: 12 }}>{children}</div>;
}

function PluginRow({ name, from, to, statusColor }: { name: string; from?: string; to?: string; statusColor: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--bg-card)", fontSize: 12 }}>
      <span style={{ flex: 1, fontFamily: "monospace", fontSize: 11, color: statusColor, fontWeight: 600 }}>{name}</span>
      {from && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{from}</span>}
      {to && <><span style={{ color: "var(--text-muted)", fontSize: 10 }}>→</span><span style={{ color: "var(--text-primary)", fontSize: 11 }}>{to}</span></>}
    </div>
  );
}

function MetricGrid({ items }: { items: Array<{ label: string; value: string | number; color?: string }> }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ fontSize: 18, fontWeight: 700, color: item.color ?? "var(--text-primary)" }}>{item.value}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function IntegrationTile({ name, status }: { name: string; status: "active" | "failed" | "pending" | "none" }) {
  const icons: Record<string, string> = { active: "✓", failed: "✗", pending: "…", none: "—" };
  const colors: Record<string, string> = {
    active: "#16a34a", failed: "#dc2626", pending: "#ca8a04", none: "#d1d5db",
  };
  return (
    <div style={{
      background: "var(--bg-canvas)", border: "1px solid var(--card-border)",
      borderRadius: 6, padding: "7px 10px", display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ flex: 1, fontSize: 11, color: "var(--text-primary)" }}>{name}</span>
      <span style={{ color: colors[status], fontWeight: 600, fontSize: 13 }}>{icons[status]}</span>
    </div>
  );
}

// ── Tab content ───────────────────────────────────────────────────────────────

function ContentTab({ org, cfg, wpSites }: Pick<ClientHubTabsProps, "org" | "cfg" | "wpSites">) {
  const defaults = wpSites[0]?.content_defaults ?? {};
  const siteId = wpSites[0]?.id;

  return (
    <>
      <Card title="WP 連線" action={
        <Link href="/tools/content/sites" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
          管理連線 →
        </Link>
      }>
        {wpSites.length === 0 ? (
          <NoData>
            未找到對應此客戶的 WP 連線。<br />
            <Link href="/tools/content/sites" style={{ color: "var(--accent)", textDecoration: "none" }}>
              + 新增 WP 連線
            </Link>
          </NoData>
        ) : (
          wpSites.map((site) => (
            <div key={site.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: site.color ?? "#94a3b8", flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{site.name}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{site.url.replace(/^https?:\/\//, "")}</span>
              <span style={{
                fontSize: 10, padding: "2px 6px", borderRadius: 4,
                background: site.active ? "#dcfce7" : "#fee2e2",
                color: site.active ? "#15803d" : "#dc2626",
              }}>
                {site.active ? "已連線" : "停用"}
              </span>
            </div>
          ))
        )}
      </Card>

      {wpSites.length > 0 && (
        <Card title="品牌預設 (content_defaults)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
            {[
              ["語言", (defaults as Record<string, unknown>).language as string],
              ["語氣", (defaults as Record<string, unknown>).tone as string],
              ["文章類型", (defaults as Record<string, unknown>).articleType as string],
              ["目標市場", (defaults as Record<string, unknown>).targetCountry as string],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{v || "—"}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Content Studio">
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.7 }}>
          在 Content Studio 中為此客戶生成 SEO 文章，網站連線與品牌設定自動套用。
        </p>
        <Link
          href={siteId ? `/tools/content?siteId=${siteId}` : "/tools/content"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 6,
            background: "var(--accent)", color: "#fff",
            fontSize: 12, fontWeight: 500, textDecoration: "none",
          }}
        >
          ✍ 開啟 Content Studio
        </Link>
        <Link
          href="/tools/content"
          style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none", marginLeft: 12 }}
        >
          完整功能 →
        </Link>
      </Card>
    </>
  );
}

function IntegrationsTab({ integrations }: Pick<ClientHubTabsProps, "integrations">) {
  const byProvider = new Map(integrations.map((i) => [i.provider, i]));

  function getStatus(key: string): "active" | "failed" | "pending" | "none" {
    const b = byProvider.get(key);
    if (!b) return "none";
    if (b.status === "active") return "active";
    if (b.status === "failed") return "failed";
    return "pending";
  }

  const activeCount = integrations.filter((i) => i.status === "active").length;
  const failedCount = integrations.filter((i) => i.status === "failed").length;

  return (
    <>
      <MetricGrid items={[
        { label: "已連線", value: activeCount, color: "#16a34a" },
        { label: "失敗", value: failedCount, color: failedCount > 0 ? "#dc2626" : "var(--text-muted)" },
        { label: "未設定", value: TOTAL_PROVIDERS - integrations.length, color: "var(--text-muted)" },
      ]} />

      {PROVIDER_GROUPS.map((group) => (
        <Card key={group.label} title={group.label}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {group.providers.map((p) => (
              <IntegrationTile key={p.key} name={p.name} status={getStatus(p.key)} />
            ))}
          </div>
          {group.providers.some((p) => getStatus(p.key) === "failed") && (
            <Link
              href="/ops/integrations"
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", display: "block", marginTop: 8 }}
            >
              查看詳細整合設定 →
            </Link>
          )}
        </Card>
      ))}
    </>
  );
}

function ProvisioningTab({ deptSummary, runs, cfg }: Pick<ClientHubTabsProps, "deptSummary" | "runs" | "cfg">) {
  const buildRuns = runs.filter((r) => r.action_id?.includes("build") || r.action_id?.includes("provision"));

  return (
    <>
      <Card title="部門覆蓋率 M3" badge={`${deptSummary.activeCount}/${deptSummary.totalCount} 叢集 · ${deptSummary.enterpriseTier} tier`}>
        {deptSummary.byGroup.map((group) => (
          <div key={group.groupKey} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)", width: 80, flexShrink: 0 }}>{group.groupLabel}</span>
            <div style={{ flex: 1, height: 5, background: "var(--bg-canvas)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3, background: "#a78bfa",
                width: group.total > 0 ? `${Math.round((group.active / group.total) * 100)}%` : "0%",
                transition: "width 0.3s",
              }} />
            </div>
            <span style={{ fontSize: 10, color: "var(--text-muted)", width: 36, textAlign: "right" }}>
              {group.active}/{group.total}
            </span>
          </div>
        ))}
        <Link href={`/ops/clients/${deptSummary.slug}`} style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", display: "block", marginTop: 6 }}>
          設定部門覆蓋 →
        </Link>
      </Card>

      <Card title="佈建步驟">
        {[
          "客戶探索問卷 (Intake)",
          "AI 網站規格生成",
          "Build Console 部署觸發",
          "初始外掛堆疊安裝",
          "整合串接確認",
        ].map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12 }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, flexShrink: 0, fontWeight: 600,
              background: "#dcfce7", color: "#15803d",
            }}>✓</span>
            {step}
          </div>
        ))}
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <Link href="/ops/onboarding" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
            重新 Onboarding →
          </Link>
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>·</span>
          <Link href="/build" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
            Build Console →
          </Link>
        </div>
      </Card>

      {buildRuns.length > 0 && (
        <Card title="佈建執行紀錄" badge={`${buildRuns.length} 筆`}>
          {buildRuns.slice(0, 5).map((run) => (
            <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--bg-canvas)", fontSize: 11 }}>
              <span style={{ fontFamily: "monospace", flex: 1, color: "var(--text-secondary)" }}>{run.action_id ?? "—"}</span>
              <span style={{ color: run.status === "completed" || run.status === "success" ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{run.status}</span>
              <span style={{ color: "var(--text-muted)" }}>{relativeTime(run.started_at)}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function MaintenanceTab({ org, cfg, wp, runs, installRuns }: Pick<ClientHubTabsProps, "org" | "cfg" | "wp" | "runs" | "installRuns">) {
  type PluginResult = { plugin: string; from: string; to: string; status: string };
  const updated = (wp?.results?.filter((r) => r.status === "updated") ?? []) as PluginResult[];
  const skipped = (wp?.results?.filter((r) => r.status === "skipped_license") ?? []) as PluginResult[];
  const failed = (wp?.results?.filter((r) => r.status === "failed") ?? []) as PluginResult[];

  const pluginInstalled = installRuns.filter((r) => (r.result_summary as InstallSummary)?.status === "installed");
  const pluginSkipped = installRuns.filter((r) => (r.result_summary as InstallSummary)?.status === "skipped_license");
  const pluginFailed = installRuns.filter((r) => (r.result_summary as InstallSummary)?.status === "failed");

  return (
    <>
      {cfg.platform === "wordpress" && cfg.ssh_host && (
        <WpUpdateButtons slug={org.slug} waves={cfg.waves ?? {}} />
      )}

      {cfg.platform === "wordpress" && (
        <Card
          title="外掛更新狀態"
          badge={wp ? relativeTime(wp.ran_at) : "尚無記錄"}
        >
          {!wp ? (
            <NoData>執行 update-client-wp-plugins.ps1 後自動同步</NoData>
          ) : (
            <>
              <MetricGrid items={[
                { label: "已更新", value: wp.updated_count ?? 0, color: "#16a34a" },
                { label: "需授權", value: skipped.length, color: skipped.length > 0 ? "#ca8a04" : "var(--text-muted)" },
                { label: "失敗", value: failed.length, color: failed.length > 0 ? "#dc2626" : "var(--text-muted)" },
                { label: "健康狀態", value: wp.health_final ?? "—", color: wp.ok ? "#16a34a" : "#dc2626" },
              ]} />
              {skipped.length > 0 && (
                <>
                  <SubLabel>🔑 需授權（WP 管理後台）</SubLabel>
                  {skipped.map((r) => <PluginRow key={r.plugin} name={r.plugin} from={r.from} to={r.to} statusColor="#ca8a04" />)}
                </>
              )}
              {failed.length > 0 && (
                <>
                  <SubLabel>⚠️ 失敗</SubLabel>
                  {failed.map((r) => <PluginRow key={r.plugin} name={r.plugin} from={r.from} to={r.to} statusColor="#dc2626" />)}
                </>
              )}
              {updated.length > 0 && (
                <>
                  <SubLabel>✅ 已更新</SubLabel>
                  {updated.map((r) => <PluginRow key={r.plugin} name={r.plugin} from={r.from} to={r.to} statusColor="#16a34a" />)}
                </>
              )}
            </>
          )}
        </Card>
      )}

      <Card
        title="初始外掛堆疊安裝"
        badge={installRuns.length > 0 ? `${installRuns.length} 筆` : "尚無記錄"}
      >
        {installRuns.length === 0 ? (
          <NoData>透過 Onboard Wizard 觸發 Build 後自動安裝</NoData>
        ) : (
          <>
            <MetricGrid items={[
              { label: "已安裝", value: pluginInstalled.length, color: "#16a34a" },
              { label: "需手動授權", value: pluginSkipped.length, color: "#ca8a04" },
              { label: "失敗", value: pluginFailed.length, color: "#dc2626" },
            ]} />
            {pluginInstalled.slice(0, 5).map((r) => {
              const s = r.result_summary as InstallSummary;
              return <PluginRow key={r.id} name={s.plugin_slug ?? "—"} to={s.version ?? undefined} statusColor="#16a34a" />;
            })}
          </>
        )}
      </Card>

      <Card title="最近工作流程執行" badge={`最近 ${runs.length} 筆`}>
        {runs.length === 0 ? (
          <NoData>此組織尚無工作流程執行紀錄</NoData>
        ) : (
          runs.slice(0, 8).map((run) => {
            const color =
              run.status === "completed" || run.status === "success"
                ? "#16a34a"
                : run.status === "failed" || run.status === "error"
                  ? "#dc2626"
                  : "#64748b";
            return (
              <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--bg-canvas)", fontSize: 11 }}>
                <span style={{ fontFamily: "monospace", flex: 1, color: "var(--text-secondary)", fontSize: 10 }}>{run.action_id ?? "—"}</span>
                <span style={{ color, fontWeight: 600 }}>{run.status}</span>
                <span style={{ color: "var(--text-muted)" }}>{relativeTime(run.started_at)}</span>
              </div>
            );
          })
        )}
      </Card>

      <div style={{ display: "flex", gap: 10 }}>
        <Link
          href={`/ops/repairs?client_slug=${org.slug}`}
          style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
        >
          → Repair Center
        </Link>
      </div>
    </>
  );
}

function SettingsTab({ org, cfg, wpSites }: Pick<ClientHubTabsProps, "org" | "cfg" | "wpSites">) {
  const configFields: Array<[string, string | undefined]> = [
    ["site_url", cfg.site_url],
    ["platform", cfg.platform],
    ["wp_slug", cfg.wp_slug],
    ["ssh_host", cfg.ssh_host],
    ["hosting_type", cfg.hosting_type],
  ].filter(([, v]) => v) as Array<[string, string]>;

  return (
    <>
      <Card title="Org 設定 (metadata.client_config)">
        {configFields.map(([k, v]) => (
          <div key={k} style={{ display: "flex", padding: "5px 0", borderBottom: "1px solid var(--bg-canvas)", fontSize: 12 }}>
            <span style={{ color: "var(--text-muted)", width: 100, flexShrink: 0, fontFamily: "monospace", fontSize: 11 }}>{k}</span>
            <span style={{ color: "var(--text-primary)", fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <Link href="/ops/integrations" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
            → 整合設定
          </Link>
        </div>
      </Card>

      <Card
        title="WP 網站連線 (wp_sites)"
        action={
          <Link href="/tools/content/sites" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
            完整管理 →
          </Link>
        }
      >
        {wpSites.length === 0 ? (
          <NoData>
            未找到與此客戶 URL 相符的 WP 連線。<br />
            <Link href="/tools/content/sites" style={{ color: "var(--accent)", textDecoration: "none" }}>
              + 新增 WP 連線
            </Link>
          </NoData>
        ) : (
          wpSites.map((site) => (
            <div key={site.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: site.color ?? "#94a3b8", flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{site.name}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{site.url.replace(/^https?:\/\//, "")}</span>
            </div>
          ))
        )}
      </Card>

      {cfg.platform === "wordpress" && cfg.wp_slug && (
        <Card title="CLI 快速指令">
          {[
            { label: "列出待更新", args: `-ClientSlug ${cfg.wp_slug} -Plugins list` },
            { label: "wave1 高風險", args: `-ClientSlug ${cfg.wp_slug} -Plugins wave1` },
            { label: "wave2 中風險", args: `-ClientSlug ${cfg.wp_slug} -Plugins wave2` },
            { label: "wave3 低風險", args: `-ClientSlug ${cfg.wp_slug} -Plugins wave3` },
          ].map((cmd) => (
            <div key={cmd.label} style={{ marginBottom: 8, fontSize: 11 }}>
              <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>{cmd.label}</div>
              <code style={{
                display: "block", padding: "4px 8px",
                background: "#1e293b", color: "#94a3b8",
                borderRadius: 6, fontSize: 10, wordBreak: "break-all",
              }}>
                .\scripts\update-client-wp-plugins.ps1 {cmd.args}
              </code>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = ["內容工具", "整合", "佈建", "維護", "設定"] as const;
type Tab = typeof TABS[number];

export function ClientHubTabs(props: ClientHubTabsProps) {
  const { org, cfg, health, wp, runs, installRuns, deptSummary, integrations, wpSites } = props;
  const [activeTab, setActiveTab] = useState<Tab>("維護");

  const initials = org.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ padding: "16px 24px 0", borderBottom: "1px solid var(--card-border)", background: "var(--bg-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700,
            background: "var(--bg-canvas)", color: "var(--accent)",
            border: "1px solid var(--card-border)",
          }}>
            {initials}
          </div>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{org.name}</h1>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {org.slug} · {org.type} · {org.status}
              {cfg.site_url && <> · <a href={cfg.site_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>{cfg.site_url.replace(/^https?:\/\//, "")}</a></>}
            </div>
          </div>
          {health && (
            <div style={{
              marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: health.ok ? "#f0fdf4" : "#fef2f2",
              color: health.ok ? "#15803d" : "#dc2626",
              border: `1px solid ${health.ok ? "#bbf7d0" : "#fecaca"}`,
            }}>
              <span style={{ fontSize: 9 }}>●</span>
              {health.ok ? "上線中" : "離線"}
              {health.statusCode && <span style={{ opacity: 0.7 }}>HTTP {health.statusCode}</span>}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 16px",
                border: "none", borderBottom: `2px solid ${activeTab === tab ? "var(--accent)" : "transparent"}`,
                background: "transparent", cursor: "pointer",
                fontSize: 12, color: activeTab === tab ? "var(--accent)" : "var(--text-secondary)",
                fontWeight: activeTab === tab ? 600 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px", background: "var(--bg-canvas)" }}>
        {activeTab === "內容工具" && <ContentTab org={org} cfg={cfg} wpSites={wpSites} />}
        {activeTab === "整合" && <IntegrationsTab integrations={integrations} />}
        {activeTab === "佈建" && <ProvisioningTab deptSummary={deptSummary} runs={runs} cfg={cfg} />}
        {activeTab === "維護" && <MaintenanceTab org={org} cfg={cfg} wp={wp} runs={runs} installRuns={installRuns} />}
        {activeTab === "設定" && <SettingsTab org={org} cfg={cfg} wpSites={wpSites} />}
      </div>
    </div>
  );
}
