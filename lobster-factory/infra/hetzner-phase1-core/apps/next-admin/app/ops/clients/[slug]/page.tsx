// /ops/clients/[slug] — Client Detail Page
// Shows: plugin update history, pending license-gated plugins,
//        last 10 workflow runs scoped to this org, quick links.
//
// Phase 2c client management dashboard — 2026-05-08

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { ClientConfig, WpUpdateLatest } from "@/app/api/ops/clients/route";
import { WpUpdateButtons } from "./WpUpdateButtons";
import { DepartmentCoveragePanel } from "./DepartmentCoveragePanel";
import type { DepartmentSummaryPayload } from "@/app/api/ops/clients/[slug]/department-summary/route";
import {
  DEPARTMENT_CATALOG,
  SMB_DEFAULT_CLUSTERS,
  GROUP_LABELS,
  type ClusterId,
} from "@/lib/department-catalog";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function probeHealth(url: string | undefined) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: resp.ok || resp.status < 400, statusCode: resp.status };
  } catch {
    return { ok: false, statusCode: null };
  }
}

function relativeTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const ms = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "剛才";
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return <ErrorBanner message="Supabase not configured." />;
  }

  // Fetch org
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id,slug,name,type,status,metadata,created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (orgError || !org) notFound();

  const cfg = ((org.metadata as Record<string, unknown>)?.client_config as ClientConfig) ?? {};
  const wp = ((org.metadata as Record<string, unknown>)?.wp_update_latest as WpUpdateLatest) ?? null;

  // Parallel: health probe + last 10 workflow runs + initial plugin installs
  const [health, runsResult, installRunsResult] = await Promise.all([
    probeHealth(cfg.site_url),
    supabase
      .from("ops_action_runs")
      .select("id,action_id,status,started_at,ended_at,metadata")
      .eq("organization_id", org.id)
      .order("started_at", { ascending: false })
      .limit(10),
    supabase
      .from("package_install_runs")
      .select("id,status,result_summary,created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  // ── M3: compute department coverage (server-side, no extra fetch) ──────────
  const selectedIds: ClusterId[] = Array.isArray(cfg.department_selection)
    ? (cfg.department_selection as ClusterId[])
    : [];
  const activeSet = new Set(selectedIds);
  const deptSummary: DepartmentSummaryPayload = (() => {
    type EnterpriseTier = "not_configured" | "smb" | "growth" | "enterprise";
    const computeTier = (n: number, ids: ClusterId[]): EnterpriseTier => {
      if (n === 0) return "not_configured";
      const cross = ids.some((id) => ["CLU_TAX_TRADE", "CLU_LEGAL", "CLU_REGIONAL"].includes(id));
      if (n >= 14 || cross) return "enterprise";
      if (n >= 8) return "growth";
      return "smb";
    };
    type GroupKey = (typeof DEPARTMENT_CATALOG)[0]["group"];
    const groupMap = new Map<GroupKey, { groupKey: GroupKey; groupLabel: string; total: number; active: number; clusters: unknown[] }>();
    for (const cluster of DEPARTMENT_CATALOG) {
      const g = cluster.group;
      if (!groupMap.has(g)) groupMap.set(g, { groupKey: g, groupLabel: GROUP_LABELS[g], total: 0, active: 0, clusters: [] });
      const ge = groupMap.get(g)!;
      ge.clusters.push({
        clusterId: cluster.clusterId, label: cluster.label, group: g,
        active: activeSet.has(cluster.clusterId),
        matrixRows: cluster.matrixRows,
        requiredTemplateFiles: cluster.templateFiles.filter((f) => f.mandatoryFields?.length).map((f) => f.path),
        recommendedTemplateFiles: cluster.templateFiles.filter((f) => f.recommendedFields?.length).map((f) => f.path),
      });
      ge.total += 1;
      if (activeSet.has(cluster.clusterId)) ge.active += 1;
    }
    const matrixRowsCovered = Array.from(new Set(DEPARTMENT_CATALOG.filter((c) => activeSet.has(c.clusterId)).flatMap((c) => c.matrixRows)));
    const allRequiredTemplateFiles = Array.from(new Set(DEPARTMENT_CATALOG.filter((c) => activeSet.has(c.clusterId)).flatMap((c) => c.templateFiles.filter((f) => f.mandatoryFields?.length).map((f) => f.path))));
    const isDefaultSelection = selectedIds.length === SMB_DEFAULT_CLUSTERS.length && SMB_DEFAULT_CLUSTERS.every((id) => activeSet.has(id));
    return {
      slug: org.slug, name: org.name,
      activeCount: selectedIds.length, totalCount: 20 as const,
      coveragePercent: Math.round((selectedIds.length / 20) * 100),
      enterpriseTier: computeTier(selectedIds.length, selectedIds),
      activeClusterIds: selectedIds,
      inactiveClusterIds: DEPARTMENT_CATALOG.filter((c) => !activeSet.has(c.clusterId)).map((c) => c.clusterId),
      byGroup: Array.from(groupMap.values()) as DepartmentSummaryPayload["byGroup"],
      matrixRowsCovered, allRequiredTemplateFiles, isDefaultSelection,
      lastReviewedAt: cfg.department_selection_reviewed_at ?? null,
    };
  })();

  const runs = runsResult.data ?? [];

  // Partition initial plugin install results
  type InstallRunSummary = { plugin_slug?: string; status?: string; version?: string | null; error_message?: string | null };
  const installRuns = (installRunsResult.data ?? []) as Array<{ id: string; status: string; result_summary: unknown; created_at: string | null }>;
  const pluginInstalled = installRuns.filter(r => (r.result_summary as InstallRunSummary)?.status === "installed");
  const pluginSkipped   = installRuns.filter(r => (r.result_summary as InstallRunSummary)?.status === "skipped_license");
  const pluginFailed    = installRuns.filter(r => (r.result_summary as InstallRunSummary)?.status === "failed");

  // Partition WP results
  const updated = wp?.results?.filter((r) => r.status === "updated") ?? [];
  const skipped = wp?.results?.filter((r) => r.status === "skipped_license") ?? [];
  const failed = wp?.results?.filter((r) => r.status === "failed") ?? [];

  const healthColor = health?.ok ? "#16a34a" : "#dc2626";

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>

      {/* ── Breadcrumb ────────────────────────────────────────────────── */}
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
        <Link href="/ops/clients" style={{ color: "var(--accent)", textDecoration: "none" }}>
          Clients
        </Link>
        {" / "}
        <span style={{ color: "var(--text-secondary)" }}>{org.name}</span>
      </div>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            {org.name}
          </h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {org.slug} · {org.type} · {org.status}
            </span>
            {cfg.hosting_type && <Chip label={cfg.hosting_type} />}
            {cfg.platform && <Chip label={cfg.platform} accent />}
          </div>
        </div>
        {health && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: health.ok ? "#f0fdf4" : "#fef2f2",
            color: healthColor,
            border: `1px solid ${healthColor}33`,
          }}>
            <span style={{ fontSize: 10 }}>●</span>
            {health.ok ? "上線中" : "離線"}
            {health.statusCode && <span style={{ opacity: 0.7 }}>HTTP {health.statusCode}</span>}
          </div>
        )}
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

        {/* ── Left: WP plugin update status ─────────────────────── */}
        <div>

          {/* One-click update buttons — only when SSH is configured */}
          {cfg.platform === "wordpress" && cfg.ssh_host && (
            <WpUpdateButtons
              slug={org.slug}
              waves={cfg.waves ?? {}}
            />
          )}

          {/* Initial plugin install card */}
          {cfg.platform === "wordpress" && (
            <Section title="初始外掛堆疊安裝" badge={installRuns.length > 0 ? `${installRuns.length} 筆` : "尚無記錄"} style={{ marginBottom: 16 }}>
              {installRuns.length === 0 ? (
                <NoData>尚未執行初始安裝（透過 Onboard Wizard 觸發 Build 後自動安裝）</NoData>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
                    <SummaryMetric label="已安裝" value={pluginInstalled.length} color="#16a34a" />
                    <SummaryMetric label="需手動授權" value={pluginSkipped.length} color="#ca8a04" />
                    <SummaryMetric label="失敗" value={pluginFailed.length} color="#dc2626" />
                  </div>
                  {pluginInstalled.length > 0 && (
                    <>
                      <SubTitle>✅ 已安裝</SubTitle>
                      <PluginInstallTable rows={pluginInstalled.map(r => r.result_summary as InstallRunSummary)} statusColor="#16a34a" />
                    </>
                  )}
                  {pluginSkipped.length > 0 && (
                    <>
                      <SubTitle style={{ marginTop: 12 }}>⚠️ 需手動授權（付費外掛）</SubTitle>
                      <PluginInstallTable rows={pluginSkipped.map(r => r.result_summary as InstallRunSummary)} statusColor="#ca8a04" />
                    </>
                  )}
                  {pluginFailed.length > 0 && (
                    <>
                      <SubTitle style={{ marginTop: 12 }}>❌ 安裝失敗</SubTitle>
                      <PluginInstallTable rows={pluginFailed.map(r => r.result_summary as InstallRunSummary)} statusColor="#dc2626" />
                    </>
                  )}
                </>
              )}
            </Section>
          )}

          {/* Plugin update card */}
          {cfg.platform === "wordpress" ? (
            <Section title="外掛更新狀態" badge={wp ? relativeTime(wp.ran_at) : "尚無記錄"}>
              {!wp ? (
                <NoData>
                  執行 <code>.\scripts\update-client-wp-plugins.ps1 -ClientSlug {cfg.wp_slug ?? slug} -Plugins list</code> 後自動同步
                </NoData>
              ) : (
                <>
                  {/* Summary row */}
                  <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
                    <SummaryMetric label="已更新" value={wp.updated_count ?? 0} color="#16a34a" />
                    <SummaryMetric label="需授權(WP後台)" value={skipped.length} color="#ca8a04" />
                    <SummaryMetric label="失敗" value={failed.length} color="#dc2626" />
                    <SummaryMetric label="健康狀態" value={wp.health_final ?? "—"} color={wp.ok ? "#16a34a" : "#dc2626"} text />
                  </div>

                  {/* License-gated — most actionable, show first */}
                  {skipped.length > 0 && (
                    <>
                      <SubTitle>🔑 需授權更新（WP 管理後台手動）</SubTitle>
                      <PluginTable rows={skipped} statusColor="#ca8a04" />
                    </>
                  )}

                  {/* Failed */}
                  {failed.length > 0 && (
                    <>
                      <SubTitle style={{ marginTop: 16 }}>⚠️ 失敗</SubTitle>
                      <PluginTable rows={failed} statusColor="#dc2626" />
                    </>
                  )}

                  {/* Updated */}
                  {updated.length > 0 && (
                    <>
                      <SubTitle style={{ marginTop: 16 }}>✅ 本次已更新</SubTitle>
                      <PluginTable rows={updated} statusColor="#16a34a" />
                    </>
                  )}
                </>
              )}
            </Section>
          ) : (
            <Section title="平台">
              <NoData>
                此組織為 {cfg.platform ?? "非 WordPress"} 平台，不適用外掛更新管理。
              </NoData>
            </Section>
          )}

          {/* Workflow runs */}
          <Section title="最近工作流程執行" badge={`最近 ${runs.length} 筆`} style={{ marginTop: 16 }}>
            {runs.length === 0 ? (
              <NoData>此組織尚無工作流程執行紀錄</NoData>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      {["Action", "狀態", "開始", "結束"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => {
                      const statusColor = run.status === "completed" || run.status === "success"
                        ? "#16a34a"
                        : run.status === "failed" || run.status === "error"
                          ? "#dc2626"
                          : "#64748b";
                      return (
                        <tr key={run.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "7px 10px", color: "var(--text-primary)", fontFamily: "monospace", fontSize: 11 }}>
                            {run.action_id ?? "—"}
                          </td>
                          <td style={{ padding: "7px 10px" }}>
                            <span style={{ color: statusColor, fontWeight: 600 }}>{run.status}</span>
                          </td>
                          <td style={{ padding: "7px 10px", color: "var(--text-muted)" }}>
                            {relativeTime(run.started_at)}
                          </td>
                          <td style={{ padding: "7px 10px", color: "var(--text-muted)" }}>
                            {relativeTime(run.ended_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* M3: Department coverage panel */}
          <div style={{ marginTop: 16 }}>
            <DepartmentCoveragePanel summary={deptSummary} />
          </div>
        </div>

        {/* ── Right sidebar: links + raw config ─────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Quick links */}
          <Section title="快速連結">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cfg.site_url && (
                <QuickLink href={cfg.site_url} label="🌐 前台網站" />
              )}
              {cfg.site_url && cfg.platform === "wordpress" && (
                <QuickLink href={`${cfg.site_url.replace(/\/$/, "")}/wp-admin`} label="⚙️ WP 管理後台" />
              )}
              {cfg.platform === "saas" && (
                <>
                  <QuickLink href="https://app.supabase.com" label="🗄️ Supabase" />
                  <QuickLink href="https://trigger.aware-wave.com" label="▶ Trigger.dev" />
                  <QuickLink href="https://n8n.aware-wave.com" label="⚙️ n8n" />
                </>
              )}
              <QuickLink href={`/ops/repairs?client_slug=${org.slug}`} label="Repair Center" internal />
              <QuickLink href="/ops/integrations" label="Integrations" internal />
              <QuickLink href="/ops/approvals" label="✓ 待簽核" internal />
            </div>
          </Section>

          {/* CLI commands */}
          {cfg.platform === "wordpress" && cfg.wp_slug && (
            <Section title="CLI 快速指令">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <CliCommand label="列出待更新" cmd={`-ClientSlug ${cfg.wp_slug} -Plugins list`} />
                <CliCommand label="wave1 高風險" cmd={`-ClientSlug ${cfg.wp_slug} -Plugins wave1`} />
                <CliCommand label="wave2 中風險" cmd={`-ClientSlug ${cfg.wp_slug} -Plugins wave2`} />
                <CliCommand label="wave3 低風險" cmd={`-ClientSlug ${cfg.wp_slug} -Plugins wave3`} />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                .\scripts\update-client-wp-plugins.ps1 [args]
              </div>
            </Section>
          )}

          {/* Raw config */}
          <Section title="Config（Supabase metadata）">
            <pre style={{
              fontSize: 10, color: "#374151",
              background: "#f8fafc", borderRadius: 6,
              padding: "10px 12px", overflowX: "auto",
              border: "1px solid #e5e7eb", lineHeight: 1.5, margin: 0,
            }}>
              {JSON.stringify(cfg, null, 2)}
            </pre>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title, badge, children, style,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: 12, padding: "18px 20px",
      ...style,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</h2>
        {badge && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function SubTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6, ...style }}>
      {children}
    </div>
  );
}

function PluginTable({
  rows,
  statusColor,
}: {
  rows: Array<{ plugin: string; from: string; to: string; status: string }>;
  statusColor: string;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["外掛", "舊版", "新版"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "var(--text-muted)", fontWeight: 500 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.plugin} style={{ borderBottom: "1px solid #f8fafc" }}>
              <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 11, color: statusColor, fontWeight: 600 }}>
                {r.plugin}
              </td>
              <td style={{ padding: "5px 8px", color: "var(--text-muted)" }}>{r.from}</td>
              <td style={{ padding: "5px 8px", color: "var(--text-primary)", fontWeight: 500 }}>{r.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryMetric({
  label, value, color, text,
}: {
  label: string;
  value: number | string;
  color: string;
  text?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: text ? 13 : 18, fontWeight: 700, color }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{label}</div>
    </div>
  );
}

function Chip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 20,
      fontSize: 10, fontWeight: 500,
      background: accent ? "#e0e7ff" : "#f1f5f9",
      color: accent ? "#4338ca" : "#64748b",
      border: `1px solid ${accent ? "#c7d2fe" : "#e2e8f0"}`,
    }}>
      {label}
    </span>
  );
}

function QuickLink({ href, label, internal }: { href: string; label: string; internal?: boolean }) {
  const linkProps = internal ? {} : { target: "_blank", rel: "noreferrer" };
  return (
    <a
      href={href}
      {...linkProps}
      style={{
        display: "block", padding: "7px 10px",
        borderRadius: 8, fontSize: 12, fontWeight: 500,
        color: "var(--text-primary)", textDecoration: "none",
        background: "#f8fafc", border: "1px solid #e2e8f0",
        transition: "background 0.1s",
      }}
    >
      {label} {!internal && <span style={{ opacity: 0.5, fontSize: 10 }}>↗</span>}
    </a>
  );
}

function CliCommand({ label, cmd }: { label: string; cmd: string }) {
  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      <code style={{
        display: "block", padding: "4px 8px",
        background: "#1e293b", color: "#94a3b8",
        borderRadius: 6, fontSize: 10, wordBreak: "break-all",
      }}>
        {cmd}
      </code>
    </div>
  );
}

function NoData({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "12px 0", lineHeight: 1.7 }}>
      {children}
    </div>
  );
}

function PluginInstallTable({
  rows,
  statusColor,
}: {
  rows: Array<{ plugin_slug?: string; version?: string | null; error_message?: string | null }>;
  statusColor: string;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            {["外掛 Slug", "版本 / 說明"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "5px 8px", color: "var(--text-muted)", fontWeight: 500 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.plugin_slug ?? i} style={{ borderBottom: "1px solid #f8fafc" }}>
              <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 11, color: statusColor, fontWeight: 600 }}>
                {r.plugin_slug ?? "—"}
              </td>
              <td style={{ padding: "5px 8px", color: "var(--text-muted)", fontSize: 11 }}>
                {r.version ?? (r.error_message ? r.error_message.slice(0, 80) : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      background: "#fef2f2", border: "1px solid #fecaca",
      color: "#991b1b", padding: "20px 24px",
      borderRadius: 10, margin: 32, fontSize: 13,
    }}>
      <strong>錯誤：</strong> {message}
    </div>
  );
}
