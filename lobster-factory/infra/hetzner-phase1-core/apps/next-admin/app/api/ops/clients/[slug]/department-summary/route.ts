// GET /api/ops/clients/:slug/department-summary
// Returns M3 department-coverage summary for one client.
// Computes from organizations.metadata.client_config.department_selection + DEPARTMENT_CATALOG.
// Read-only, no approval gate required.
//
// M3 Next-Gen alignment — 2026-05-13

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  DEPARTMENT_CATALOG,
  SMB_DEFAULT_CLUSTERS,
  GROUP_LABELS,
  type ClusterId,
  type DepartmentCluster,
} from "@/lib/department-catalog";
import type { ClientConfig } from "@/app/api/ops/clients/route";

export const dynamic = "force-dynamic";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClusterSummary {
  clusterId: ClusterId;
  label: string;
  group: DepartmentCluster["group"];
  active: boolean;
  matrixRows: string[];
  requiredTemplateFiles: string[];
  recommendedTemplateFiles: string[];
}

export interface GroupCoverage {
  groupKey: DepartmentCluster["group"];
  groupLabel: string;
  total: number;
  active: number;
  clusters: ClusterSummary[];
}

export type EnterpriseTier = "not_configured" | "smb" | "growth" | "enterprise";

export interface DepartmentSummaryPayload {
  slug: string;
  name: string;
  activeCount: number;
  totalCount: 20;
  coveragePercent: number;
  enterpriseTier: EnterpriseTier;
  activeClusterIds: ClusterId[];
  inactiveClusterIds: ClusterId[];
  byGroup: GroupCoverage[];
  matrixRowsCovered: string[];
  allRequiredTemplateFiles: string[];
  lastReviewedAt: string | null;
  isDefaultSelection: boolean;
}

// ── Helper: compute tier from active cluster count ───────────────────────────

function computeTier(activeCount: number, selectedIds: ClusterId[]): EnterpriseTier {
  if (activeCount === 0) return "not_configured";
  const crossBorderActive = selectedIds.some((id) =>
    ["CLU_TAX_TRADE", "CLU_LEGAL", "CLU_REGIONAL"].includes(id)
  );
  if (activeCount >= 14 || crossBorderActive) return "enterprise";
  if (activeCount >= 8) return "growth";
  return "smb";
}

// ── Helper: build summary from a list of selected cluster IDs ────────────────

function buildSummary(
  slug: string,
  name: string,
  selectedIds: ClusterId[],
  reviewedAt: string | null,
): DepartmentSummaryPayload {
  const activeSet = new Set(selectedIds);
  const isDefaultSelection =
    selectedIds.length === SMB_DEFAULT_CLUSTERS.length &&
    SMB_DEFAULT_CLUSTERS.every((id) => activeSet.has(id));

  const summaryMap = new Map<DepartmentCluster["group"], GroupCoverage>();

  for (const cluster of DEPARTMENT_CATALOG) {
    const group = cluster.group;
    if (!summaryMap.has(group)) {
      summaryMap.set(group, {
        groupKey: group,
        groupLabel: GROUP_LABELS[group],
        total: 0,
        active: 0,
        clusters: [],
      });
    }
    const groupEntry = summaryMap.get(group)!;
    const isActive = activeSet.has(cluster.clusterId);
    const cs: ClusterSummary = {
      clusterId: cluster.clusterId,
      label: cluster.label,
      group,
      active: isActive,
      matrixRows: cluster.matrixRows,
      requiredTemplateFiles: cluster.templateFiles
        .filter((f) => f.mandatoryFields && f.mandatoryFields.length > 0)
        .map((f) => f.path),
      recommendedTemplateFiles: cluster.templateFiles
        .filter((f) => f.recommendedFields && f.recommendedFields.length > 0)
        .map((f) => f.path),
    };
    groupEntry.clusters.push(cs);
    groupEntry.total += 1;
    if (isActive) groupEntry.active += 1;
  }

  const byGroup = Array.from(summaryMap.values());

  const matrixRowsCovered = Array.from(
    new Set(
      DEPARTMENT_CATALOG
        .filter((c) => activeSet.has(c.clusterId))
        .flatMap((c) => c.matrixRows),
    )
  );

  const allRequiredTemplateFiles = Array.from(
    new Set(
      DEPARTMENT_CATALOG
        .filter((c) => activeSet.has(c.clusterId))
        .flatMap((c) =>
          c.templateFiles
            .filter((f) => f.mandatoryFields && f.mandatoryFields.length > 0)
            .map((f) => f.path)
        )
    )
  );

  const inactiveClusterIds = DEPARTMENT_CATALOG
    .filter((c) => !activeSet.has(c.clusterId))
    .map((c) => c.clusterId);

  const coveragePercent = Math.round((selectedIds.length / 20) * 100);

  return {
    slug,
    name,
    activeCount: selectedIds.length,
    totalCount: 20,
    coveragePercent,
    enterpriseTier: computeTier(selectedIds.length, selectedIds),
    activeClusterIds: selectedIds,
    inactiveClusterIds,
    byGroup,
    matrixRowsCovered,
    allRequiredTemplateFiles,
    lastReviewedAt: reviewedAt,
    isDefaultSelection,
  };
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 503 },
    );
  }

  const { data: org, error } = await supabase
    .from("organizations")
    .select("id,slug,name,metadata")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: "org_fetch_failed", details: error.message },
      { status: 500 },
    );
  }

  if (!org) {
    return NextResponse.json(
      { ok: false, error: "org_not_found" },
      { status: 404 },
    );
  }

  const cfg = ((org.metadata as Record<string, unknown>)?.client_config as ClientConfig) ?? {};
  const selectedIds: ClusterId[] = Array.isArray(cfg.department_selection)
    ? (cfg.department_selection as ClusterId[])
    : [];
  const reviewedAt = cfg.department_selection_reviewed_at ?? null;

  const summary = buildSummary(org.slug, org.name, selectedIds, reviewedAt);

  return NextResponse.json({ ok: true, summary });
}
