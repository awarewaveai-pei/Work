// /ops/clients/[slug] — Unified Client Hub
// Tabbed per-client workspace: Content / Integrations / Provisioning / Maintenance / Settings
// Data: organizations + ops_action_runs + package_install_runs + tenant_integration_bindings + wp_sites

import { notFound } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { ClientConfig, WpUpdateLatest } from "@/app/api/ops/clients/route";
import type { DepartmentSummaryPayload } from "@/app/api/ops/clients/[slug]/department-summary/route";
import {
  DEPARTMENT_CATALOG,
  SMB_DEFAULT_CLUSTERS,
  GROUP_LABELS,
  type ClusterId,
} from "@/lib/department-catalog";
import { ClientHubTabs } from "./ClientHubTabs";

export const dynamic = "force-dynamic";

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

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return (
      <div style={{ background: "var(--badge-red-bg)", border: "1px solid var(--red)", color: "var(--badge-red-text)", padding: "20px 24px", borderRadius: 10, margin: 32, fontSize: 13 }}>
        <strong>錯誤：</strong> Supabase not configured.
      </div>
    );
  }

  // ── Fetch org ───────────────────────────────────────────────────────────────
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id,slug,name,type,status,metadata,created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (orgError || !org) notFound();

  const cfg = ((org.metadata as Record<string, unknown>)?.client_config as ClientConfig) ?? {};
  const wp = ((org.metadata as Record<string, unknown>)?.wp_update_latest as WpUpdateLatest) ?? null;

  // ── Hostname for wp_sites URL matching ─────────────────────────────────────
  let siteHostname: string | null = null;
  if (cfg.site_url) {
    try { siteHostname = new URL(cfg.site_url).hostname; } catch { /* ignore */ }
  }

  // ── Parallel fetches ────────────────────────────────────────────────────────
  const [health, runsResult, installRunsResult, integrationsResult, wpSitesResult] = await Promise.all([
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
    supabase
      .from("tenant_integration_bindings")
      .select("provider,status,last_tested_at,last_error")
      .eq("organization_id", org.id),
    siteHostname
      ? supabase
          .from("wp_sites")
          .select("id,name,url,color,active,content_defaults")
          .ilike("url", `%${siteHostname}%`)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // ── M3 department coverage (server-side) ────────────────────────────────────
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

  return (
    <ClientHubTabs
      org={{ id: org.id, slug: org.slug, name: org.name, type: org.type, status: org.status }}
      cfg={cfg}
      health={health}
      wp={wp}
      runs={(runsResult.data ?? []) as Parameters<typeof ClientHubTabs>[0]["runs"]}
      installRuns={(installRunsResult.data ?? []) as Parameters<typeof ClientHubTabs>[0]["installRuns"]}
      deptSummary={deptSummary}
      integrations={(integrationsResult.data ?? []) as Parameters<typeof ClientHubTabs>[0]["integrations"]}
      wpSites={(wpSitesResult.data ?? []) as Parameters<typeof ClientHubTabs>[0]["wpSites"]}
    />
  );
}
