"use client";
// ClientCard — client component so onMouseEnter/onMouseLeave work in Next.js 15 RSC.
// Receives pre-computed data props (org row + health result) from the server page.
// M3: department count badge added — 2026-05-13

import Link from "next/link";
import type { ClientConfig, WpUpdateLatest } from "@/app/api/ops/clients/route";

// ── Prop types ────────────────────────────────────────────────────────────────

export interface OrgRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface HealthResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error?: string;
}

// ── ClientCard ────────────────────────────────────────────────────────────────

export function ClientCard({ org, health }: { org: OrgRow; health: HealthResult }) {
  const cfg = (org.metadata?.client_config as ClientConfig) ?? {};
  const wp = (org.metadata?.wp_update_latest as WpUpdateLatest) ?? null;

  const platformLabel = cfg.platform === "wordpress" ? "WordPress"
    : cfg.platform === "saas" ? "SaaS"
    : cfg.platform === "static" ? "Static"
    : cfg.platform ?? "—";

  const hostingLabel = cfg.hosting_type ?? "—";

  const pendingLicenseCount = wp?.results?.filter((r) => r.status === "skipped_license").length ?? 0;
  const updatedCount = wp?.updated_count ?? 0;
  const failedCount = wp?.failed_count ?? 0;
  const lastRunAt = wp?.ran_at ? new Date(wp.ran_at) : null;
  const daysSinceRun = lastRunAt
    ? Math.floor((Date.now() - lastRunAt.getTime()) / 86_400_000)
    : null;

  // M3: department coverage count
  const deptCount = Array.isArray(cfg.department_selection) ? cfg.department_selection.length : null;

  const healthColor = health.ok ? "#16a34a" : "#dc2626";
  const healthBg = health.ok ? "#f0fdf4" : "#fef2f2";
  const healthLabel = health.ok
    ? `HTTP ${health.statusCode ?? "200"}`
    : health.error === "no_url"
      ? "no URL"
      : `DOWN${health.statusCode ? ` (${health.statusCode})` : ""}`;

  return (
    <Link
      href={`/ops/clients/${org.slug}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: "20px 22px",
        cursor: "pointer",
        transition: "box-shadow 0.15s, border-color 0.15s",
        boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.06)",
      }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.boxShadow = "0 4px 12px rgb(0 0 0 / 0.10)";
          el.style.borderColor = "var(--accent)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          el.style.boxShadow = "0 1px 3px 0 rgb(0 0 0 / 0.06)";
          el.style.borderColor = "var(--border-subtle)";
        }}
      >
        {/* Row 1: name + health badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{org.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
              {org.slug} · {org.type} · {org.status}
            </div>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600,
            background: healthBg, color: healthColor,
            border: `1px solid ${healthColor}33`,
          }}>
            <span style={{ fontSize: 8 }}>●</span>
            {healthLabel}
            {health.latencyMs != null && <span style={{ opacity: 0.7 }}>{health.latencyMs}ms</span>}
          </div>
        </div>

        {/* Row 2: site URL */}
        {cfg.site_url && (
          <div style={{ fontSize: 12, color: "var(--accent)", marginBottom: 10, wordBreak: "break-all" }}>
            {cfg.site_url}
          </div>
        )}

        {/* Row 3: platform + hosting tags + department count */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {platformLabel !== "—" && <Tag label={platformLabel} />}
          {hostingLabel !== "—" && <Tag label={hostingLabel} />}
          {cfg.notes && <Tag label={cfg.notes} muted />}
          {deptCount !== null
            ? <Tag label={`${deptCount}/20 部門`} dept active={deptCount >= 8} />
            : <Tag label="部門未設定" dept active={false} />}
        </div>

        {/* Row 3b: quick action links */}
        {cfg.platform !== "saas" && (
          <div style={{ marginBottom: 12 }}>
            <Link
              href={`/ops/inbox?client_slug=${org.slug}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                background: "#f1f5f9", color: "#475569",
                border: "1px solid #e2e8f0", textDecoration: "none",
              }}
            >
              ⚑ 查看警報
            </Link>
          </div>
        )}

        {/* Row 4: WP plugin update summary */}
        {cfg.platform === "wordpress" && (
          <div style={{
            background: "#f8fafc",
            borderRadius: 8,
            padding: "10px 12px",
            border: "1px solid #e2e8f0",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
              外掛更新
            </div>
            {wp ? (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Metric label="已更新" value={updatedCount} color="#16a34a" />
                {pendingLicenseCount > 0 && (
                  <Metric label="需授權" value={pendingLicenseCount} color="#ca8a04" />
                )}
                {failedCount > 0 && (
                  <Metric label="失敗" value={failedCount} color="#dc2626" />
                )}
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto", alignSelf: "flex-end" }}>
                  {daysSinceRun === 0 ? "今日" : daysSinceRun === 1 ? "昨日" : `${daysSinceRun}天前`}
                  {" · "}{wp.plugins_group ?? ""}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                尚無更新紀錄 — 執行 update-client-wp-plugins.ps1 後自動同步
              </div>
            )}
          </div>
        )}

        {/* Row 5: AwareWave SaaS — no WP metrics */}
        {cfg.platform === "saas" && (
          <div style={{
            background: "#f0f9ff",
            borderRadius: 8,
            padding: "8px 12px",
            border: "1px solid #bae6fd",
            fontSize: 11,
            color: "#0369a1",
          }}>
            ◈ 平台自身 — 查看 <Link href="/ops/inbox" style={{ color: "#0369a1" }}>Ops Inbox</Link>、
            <Link href="/ops/system-modes" style={{ color: "#0369a1" }}> 系統模式</Link>
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Small helpers (client-side fine too) ─────────────────────────────────────

function Tag({ label, muted, dept, active }: { label: string; muted?: boolean; dept?: boolean; active?: boolean }) {
  let bg = "#e0e7ff", color = "#4338ca", border = "#c7d2fe";
  if (muted)  { bg = "#f1f5f9"; color = "#64748b"; border = "#cbd5e1"; }
  if (dept && active)  { bg = "#f0fdf4"; color = "#166534"; border = "#bbf7d0"; }
  if (dept && !active) { bg = "#fef9c3"; color = "#854d0e"; border = "#fde047"; }
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 500,
      background: bg, color, border: `1px solid ${border}`,
    }}>
      {label}
    </span>
  );
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{label}</div>
    </div>
  );
}
