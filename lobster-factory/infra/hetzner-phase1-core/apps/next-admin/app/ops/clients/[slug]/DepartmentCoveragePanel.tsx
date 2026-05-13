// DepartmentCoveragePanel — server component
// Displays M3 20-department capability coverage for one client.
// Receives pre-computed DepartmentSummaryPayload from the parent page (no extra fetch).
//
// M3 Next-Gen alignment — 2026-05-13

import type { DepartmentSummaryPayload, GroupCoverage, ClusterSummary, EnterpriseTier } from "@/app/api/ops/clients/[slug]/department-summary/route";

// ── Tier display helpers ──────────────────────────────────────────────────────

const TIER_META: Record<EnterpriseTier, { label: string; color: string; bg: string; border: string }> = {
  not_configured: { label: "未設定", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
  smb:            { label: "SMB",    color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd" },
  growth:         { label: "Growth", color: "#7c3aed", bg: "#faf5ff", border: "#ddd6fe" },
  enterprise:     { label: "Enterprise", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
};

const GROUP_ORDER: GroupCoverage["groupKey"][] = [
  "core", "revenue", "supply_chain", "platform", "support", "cross_border", "horizontal",
];

// ── Sub-components (server-safe — no event handlers) ─────────────────────────

function TierBadge({ tier }: { tier: EnterpriseTier }) {
  const m = TIER_META[tier];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>
      {m.label}
    </span>
  );
}

function CoverageBar({ percent }: { percent: number }) {
  const color = percent >= 70 ? "#16a34a" : percent >= 40 ? "#7c3aed" : percent > 0 ? "#0369a1" : "#d1d5db";
  return (
    <div style={{ background: "#f1f5f9", borderRadius: 99, height: 6, width: "100%", overflow: "hidden" }}>
      <div style={{
        width: `${percent}%`, height: "100%",
        background: color, borderRadius: 99,
        transition: "width 0.3s ease",
      }} />
    </div>
  );
}

function ClusterChip({ cs }: { cs: ClusterSummary }) {
  return (
    <div
      title={cs.active
        ? `矩陣列：${cs.matrixRows.join(", ")}${cs.requiredTemplateFiles.length > 0 ? `\n必填檔：${cs.requiredTemplateFiles.join(", ")}` : ""}`
        : "未啟用"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 500,
        background: cs.active ? "#f0fdf4" : "#f8fafc",
        color: cs.active ? "#166534" : "#94a3b8",
        border: `1px solid ${cs.active ? "#bbf7d0" : "#e2e8f0"}`,
      }}
    >
      <span style={{ fontSize: 9, lineHeight: 1 }}>{cs.active ? "●" : "○"}</span>
      {cs.label}
    </div>
  );
}

function GroupSection({ g }: { g: GroupCoverage }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", minWidth: 90 }}>
          {g.groupLabel}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {g.active}/{g.total}
        </span>
        <div style={{ flex: 1, maxWidth: 80 }}>
          <CoverageBar percent={Math.round((g.active / g.total) * 100)} />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {g.clusters.map((cs) => (
          <ClusterChip key={cs.clusterId} cs={cs} />
        ))}
      </div>
    </div>
  );
}

function UnconfiguredNotice({ smbDefaults }: { smbDefaults: string[] }) {
  return (
    <div style={{
      background: "#fffbeb", border: "1px solid #fde68a",
      borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#92400e", lineHeight: 1.7,
    }}>
      <strong>⚠ 尚未設定部門選型</strong>
      <div style={{ marginTop: 6 }}>
        請在 Supabase 的 <code style={{ fontSize: 10, background: "#fef3c7", padding: "1px 4px", borderRadius: 3 }}>
          organizations.metadata.client_config.department_selection
        </code> 填入{" "}
        <code style={{ fontSize: 10, background: "#fef3c7", padding: "1px 4px", borderRadius: 3 }}>ClusterId[]</code>。
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#b45309" }}>
        SMB 建議預設值：{smbDefaults.join(", ")}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function DepartmentCoveragePanel({ summary }: { summary: DepartmentSummaryPayload }) {
  const tier = TIER_META[summary.enterpriseTier];
  const notConfigured = summary.activeCount === 0;

  const orderedGroups = GROUP_ORDER
    .map((key) => summary.byGroup.find((g) => g.groupKey === key))
    .filter((g): g is GroupCoverage => g !== undefined);

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: 12, padding: "18px 20px",
    }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            20 部門覆蓋率
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {summary.activeCount} / {summary.totalCount} 啟用
            </span>
            {!notConfigured && (
              <>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>·</span>
                <TierBadge tier={summary.enterpriseTier} />
              </>
            )}
            {summary.isDefaultSelection && !notConfigured && (
              <span style={{
                fontSize: 9, fontWeight: 600, color: "#64748b",
                background: "#f1f5f9", border: "1px solid #e2e8f0",
                padding: "1px 6px", borderRadius: 99,
              }}>
                SMB 預設
              </span>
            )}
          </div>
        </div>

        {!notConfigured && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: tier.color, lineHeight: 1 }}>
              {summary.coveragePercent}%
            </div>
            <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
              覆蓋率
            </div>
          </div>
        )}
      </div>

      {/* ── Coverage bar (overall) ───────────────────────────────── */}
      {!notConfigured && (
        <div style={{ marginBottom: 16 }}>
          <CoverageBar percent={summary.coveragePercent} />
        </div>
      )}

      {/* ── Not configured notice ────────────────────────────────── */}
      {notConfigured ? (
        <UnconfiguredNotice smbDefaults={["CLU_STRATEGY_GOVERN", "CLU_FINANCE", "CLU_SECURITY_IT", "CLU_ENGINEERING", "CLU_ORDER_OPS"]} />
      ) : (
        <>
          {/* ── Group sections ─────────────────────────────────── */}
          {orderedGroups.map((g) => (
            <GroupSection key={g.groupKey} g={g} />
          ))}

          {/* ── Matrix rows covered ─────────────────────────────── */}
          {summary.matrixRowsCovered.length > 0 && (
            <div style={{
              marginTop: 12,
              background: "#f8fafc", borderRadius: 8,
              padding: "10px 12px", border: "1px solid #e2e8f0",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                矩陣列覆蓋（{summary.matrixRowsCovered.length}/15）
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {summary.matrixRowsCovered.map((row) => (
                  <span
                    key={row}
                    style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: "#e0f2fe", color: "#0369a1",
                      border: "1px solid #bae6fd",
                    }}
                  >
                    {row}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Required template files ─────────────────────────── */}
          {summary.allRequiredTemplateFiles.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text-secondary)" }}>必填模板檔（{summary.allRequiredTemplateFiles.length}）：</strong>{" "}
              {summary.allRequiredTemplateFiles.join(" · ")}
            </div>
          )}

          {/* ── Last reviewed ────────────────────────────────────── */}
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--text-muted)" }}>
            最後審閱：{summary.lastReviewedAt ?? "未記錄"}{" "}
            · 更新方法：修改 Supabase{" "}
            <code style={{ fontSize: 9, background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 }}>
              metadata.client_config.department_selection
            </code>
          </div>
        </>
      )}
    </div>
  );
}
