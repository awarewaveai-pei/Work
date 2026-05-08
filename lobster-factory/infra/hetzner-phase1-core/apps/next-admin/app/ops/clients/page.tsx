// /ops/clients — Unified Client Management Dashboard
// Server component. Renders all client cards with live HTTP health probes.
// Data: organizations.metadata.client_config + wp_update_latest (Supabase)
//       Live health: parallel fetch() with 5s timeout per client
//
// Phase 2c client management dashboard — 2026-05-08

import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ClientCard } from "./ClientCard";
import type { OrgRow, HealthResult } from "./ClientCard";
import type { ClientConfig } from "@/app/api/ops/clients/route";

export const dynamic = "force-dynamic";

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

// ── Small helpers (server-side OK — no event handlers) ────────────────────────

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
