// /ops/clients — Unified Client Management Dashboard
// Server component. Renders all client cards with live HTTP health probes.
// Data: organizations.metadata.client_config + wp_update_latest (Supabase)
//       Live health: parallel fetch() with 5s timeout per client
//
// Phase 2c client management dashboard — 2026-05-08

import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { ClientConfig, WpUpdateLatest } from "@/app/api/ops/clients/route";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface HealthResult {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error?: string;
}

// ── Health probe ──────────────────────────────────────────────────────────────

async function probeHealth(url: string | undefined): Promise<HealthResult> {
  if (!url) return { ok: false, statusCode: null, latencyMs: null, error: "no_url" };
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(url, {
      method: "HEAD",
      signal: ctrl.signal,
      // next: { revalidate: 0 } — force-dynamic handles this
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    return { ok: resp.ok || resp.status < 400, statusCode: resp.status, latencyMs };
  } catch (err) {
    return {
      ok: false,
      statusCode: null,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : "fetch_error",
    };
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ClientsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return <ErrorBanner message="Supabase not configured — check environment variables." />;
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("id,slug,name,type,status,metadata,created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return <ErrorBanner message={`Database error: ${error.message}`} />;
  }

  const orgs = (data ?? []) as OrgRow[];

  // Probe health for all clients in parallel
  const healthResults = await Promise.all(
    orgs.map((org) => {
      const cfg = (org.metadata?.client_config as ClientConfig) ?? {};
      return probeHealth(cfg.site_url);
    }),
  );

  const now = new Date();
  const upCount = healthResults.filter((h) => h.ok).length;

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            Clients
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            全客戶管理 — {orgs.length} 個組織，{upCount}/{orgs.length} 上線
            <span style={{ marginLeft: 12, opacity: 0.6, fontSize: 11 }}>
              自動刷新：{now.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <StatusPill count={upCount} label="healthy" color="#16a34a" bg="#f0fdf4" />
          {orgs.length - upCount > 0 && (
            <StatusPill count={orgs.length - upCount} label="down" color="#dc2626" bg="#fef2f2" />
          )}
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      {orgs.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 16,
        }}>
          {orgs.map((org, i) => (
            <ClientCard
              key={org.id}
              org={org}
              health={healthResults[i]}
            />
          ))}
        </div>
      )}

      {/* ── Legend / Help ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <strong>資料來源：</strong>Supabase organizations.metadata（client_config + wp_update_latest）。
        新客戶上線後，在 Supabase 更新 metadata 即可出現在此。
        外掛更新腳本執行後自動同步最新報告。{" "}
        <Link href="/ops/inbox" style={{ color: "var(--accent)" }}>→ Ops Inbox</Link>
      </div>
    </div>
  );
}

// ── ClientCard ────────────────────────────────────────────────────────────────

function ClientCard({ org, health }: { org: OrgRow; health: HealthResult }) {
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

        {/* Row 3: platform + hosting tags */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {platformLabel !== "—" && <Tag label={platformLabel} />}
          {hostingLabel !== "—" && <Tag label={hostingLabel} />}
          {cfg.notes && <Tag label={cfg.notes} muted />}
        </div>

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

// ── Small helpers ─────────────────────────────────────────────────────────────

function Tag({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 500,
      background: muted ? "#f1f5f9" : "#e0e7ff",
      color: muted ? "#64748b" : "#4338ca",
      border: `1px solid ${muted ? "#cbd5e1" : "#c7d2fe"}`,
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

function StatusPill({ count, label, color, bg }: { count: number; label: string; color: string; bg: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 20,
      background: bg, border: `1px solid ${color}22`,
      fontSize: 12, fontWeight: 600, color,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{count}</span>
      <span style={{ fontWeight: 500, opacity: 0.85 }}>{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      background: "#fff", border: "1px solid var(--border-subtle)",
      borderRadius: 12, padding: "56px 40px", textAlign: "center",
      maxWidth: 480, margin: "32px auto 0",
    }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>📋</div>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>尚無客戶資料</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
        在 Supabase 的 organizations 表新增一筆記錄，並填入{" "}
        <code style={{ fontSize: 11, background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>
          metadata.client_config
        </code>{" "}
        欄位即可出現在此。
      </p>
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
