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
  const clientKind = typeof org.metadata?.client_kind === "string"
    ? org.metadata.client_kind
    : org.slug === "awarewave-ops"
      ? "internal"
      : "external";
  const relationship = typeof org.metadata?.relationship === "string"
    ? org.metadata.relationship
    : org.slug === "awarewave-ops"
      ? "first_party"
      : "customer";

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

  const healthColor = health.ok ? "var(--green)" : "var(--red)";
  const healthBg = health.ok ? "var(--badge-green-bg)" : "var(--badge-red-bg)";
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
              {org.slug} · {clientKind} · {relationship} · {org.status}
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
          <div style={{ fontSize: 12, color: "var(--accent-text)", marginBottom: 10, wordBreak: "break-all" }}>
            {cfg.site_url}
          </div>
        )}

        {/* Row 3: platform + hosting tags + department count */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {platformLabel !== "—" && <Tag label={platformLabel} />}
          {hostingLabel !== "—" && <Tag label={hostingLabel} />}
          <Tag label={clientKind === "internal" ? "Internal client" : "External client"} muted={clientKind !== "internal"} />
          {cfg.notes && <Tag label={cfg.notes} muted />}
          {deptCount !== null
            ? <Tag label={`${deptCount}/20 部門`} dept active={deptCount >= 8} />
            : <Tag label="部門未設定" dept active={false} />}
        </div>

        {/* Row 3b: quick action links */}
        {cfg.platform !== "saas" && (
          <div style={{ marginBottom: 12 }}>
            <Link
              href={`/ops/repairs?client_slug=${org.slug}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                background: "var(--badge-gray-bg)", color: "var(--badge-gray-text)",
                border: "1px solid var(--border)", textDecoration: "none",
              }}
            >
              ⚑ 查看警報
            </Link>
          </div>
        )}

        {/* Row 4: WP plugin update summary */}
        {cfg.platform === "wordpress" && (
          <div style={{
            background: "var(--bg-subtle)",
            borderRadius: 8,
            padding: "10px 12px",
            border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
              外掛更新
            </div>
            {wp ? (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Metric label="已更新" value={updatedCount} color="var(--green)" />
                {pendingLicenseCount > 0 && (
                  <Metric label="需授權" value={pendingLicenseCount} color="var(--severity-medium)" />
                )}
                {failedCount > 0 && (
                  <Metric label="失敗" value={failedCount} color="var(--red)" />
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
            background: "var(--ai-bg)",
            borderRadius: 8,
            padding: "8px 12px",
            border: "1px solid var(--severity-low)",
            fontSize: 11,
            color: "var(--ai-text)",
          }}>
            ◈ 平台自身 — 查看 <Link href="/ops/repairs" style={{ color: "var(--ai-text)" }}>Repair Center</Link>、
            <Link href="/ops/system-modes" style={{ color: "var(--ai-text)" }}> 系統模式</Link>
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Small helpers (client-side fine too) ─────────────────────────────────────

function Tag({ label, muted, dept, active }: { label: string; muted?: boolean; dept?: boolean; active?: boolean }) {
  let bg = "var(--designs-badge-tarot-bg)", color = "var(--accent)", border = "var(--accent-hover)";
  if (muted)  { bg = "var(--badge-gray-bg)"; color = "var(--text-muted)"; border = "var(--border)"; }
  if (dept && active)  { bg = "var(--badge-green-bg)"; color = "var(--badge-green-text)"; border = "var(--green)"; }
  if (dept && !active) { bg = "var(--dept-by-industry-bg)"; color = "var(--dept-by-industry-text)"; border = "var(--yellow)"; }
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
