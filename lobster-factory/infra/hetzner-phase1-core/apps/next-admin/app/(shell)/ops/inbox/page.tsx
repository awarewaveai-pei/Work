import Link from "next/link";
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canModifyIncidentStatus, readOpsRole } from "@/lib/ops-role";
import { IncidentCard } from "./components/IncidentCard";
import { OpsInboxTelemetry } from "./OpsInboxTelemetry";
import { IncidentFilterBar } from "./components/IncidentFilterBar";
import { InboxGuidePanel } from "./components/InboxGuidePanel";
import { AutoRefresh } from "@/app/AutoRefresh";
import type { Incident, IncidentSeverity, IncidentSource, IncidentStatus } from "@/lib/ops-inbox/types";

interface SearchParams {
  status?: string;
  severity?: string;
  source?: string;
  q?: string;
  client_slug?: string;
}

export default async function OpsInboxListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const role = readOpsRole(new Request("http://localhost", { headers: await headers() }));
  const canAct = canModifyIncidentStatus(role);

  const supabase = getSupabaseServerClient();
  if (!supabase) return <ConnectionError />;

  let query = supabase.from("ops_incidents").select("*").order("last_seen_at", { ascending: false }).limit(200);

  const rawStatus = sp.status?.trim();
  if (!rawStatus || rawStatus === "all") {
    /* 全部：不篩狀態 */
  } else if (rawStatus === "active") {
    /** 進行中：僅 investigating（按過「標記調查中」） */
    query = query.eq("status", "investigating");
  } else {
    const parts = rawStatus.split(",") as IncidentStatus[];
    query = query.in("status", parts);
  }

  if (sp.severity) query = query.in("severity", sp.severity.split(",") as IncidentSeverity[]);
  if (sp.source) query = query.in("source", sp.source.split(",") as IncidentSource[]);
  if (sp.q) query = query.or(`title.ilike.%${sp.q}%,message.ilike.%${sp.q}%`);
  if (sp.client_slug) query = query.eq("client_slug", sp.client_slug);

  const { data: incidents, error } = await query;
  if (error) return <ConnectionError message={error.message} />;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const publicBaseUrl = host ? `${proto}://${host}` : "";

  const critical = incidents?.filter((i) => i.severity === "critical" && i.status !== "resolved" && i.status !== "ignored").length ?? 0;
  const high = incidents?.filter((i) => i.severity === "high" && i.status !== "resolved" && i.status !== "ignored").length ?? 0;
  const total = incidents?.length ?? 0;

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px" }}>
      <OpsInboxTelemetry />
      <AutoRefresh intervalMs={20000} />
      {/* ── Page header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Ops Inbox</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>警報收件匣（非監控儀表）</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {critical > 0 && (
            <StatPill count={critical} label="critical" color="var(--severity-critical)" bg="var(--badge-red-bg)" />
          )}
          {high > 0 && (
            <StatPill count={high} label="high" color="var(--severity-high)" bg="var(--build-risk-medium-bg)" />
          )}
          <StatPill
            count={total}
            label={
              !rawStatus || rawStatus === "all"
                ? "total"
                : rawStatus === "active"
                  ? "進行中"
                  : rawStatus === "resolved"
                    ? "已解決"
                    : rawStatus === "ignored"
                      ? "已忽略"
                      : "total"
            }
            color="var(--text-muted)"
            bg="var(--badge-gray-bg)"
          />
          <Link
            href="/ops/tools"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 12px",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            ⚙️ Tools
          </Link>
        </div>
      </div>

      {/* ── Client filter banner ────────────────────────────────── */}
      {sp.client_slug && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--ai-bg)", border: "1px solid var(--severity-low)", borderRadius: 8,
          padding: "8px 14px", marginBottom: 16, fontSize: 13, color: "var(--ai-text)",
        }}>
          <span>篩選客戶：<strong>{sp.client_slug}</strong></span>
          <Link
            href="/ops/inbox"
            style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", textDecoration: "none" }}
          >
            ✕ 清除篩選
          </Link>
        </div>
      )}

      {/* ── Filter bar ──────────────────────────────────────────── */}
      <IncidentFilterBar current={sp} />

      {/* ── Guide panel ─────────────────────────────────────────── */}
      <InboxGuidePanel publicBaseUrl={publicBaseUrl} />

      {/* ── List ────────────────────────────────────────────────── */}
      {!incidents || incidents.length === 0 ? (
        <EmptyState rawStatus={rawStatus} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {incidents.map((i) => (
            <IncidentCard key={i.id} incident={i as Incident} canAct={canAct} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatPill({ count, label, color, bg }: { count: number; label: string; color: string; bg: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 20,
        background: bg,
        border: `1px solid ${color}22`,
        fontSize: 12,
        fontWeight: 600,
        color,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700 }}>{count}</span>
      <span style={{ fontWeight: 500, opacity: 0.85 }}>{label}</span>
    </div>
  );
}

function EmptyState({ rawStatus }: { rawStatus?: string }) {
  const hint =
    !rawStatus || rawStatus === "all"
      ? "資料庫尚無任何事件紀錄。請確認 Webhook 已設定且帶正確 Bearer。"
      : rawStatus === "active"
        ? "尚無「調查中」事件。新警報在「全部」；點卡片上的「標記調查中」後會出現在「進行中」。"
        : "此篩選條件下沒有資料。可改點「全部」或其他狀態。";

  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: "56px 40px",
        textAlign: "center",
        maxWidth: 520,
        margin: "32px auto 0",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 16 }}>📭</div>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
        目前沒有符合條件的事件
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7, marginBottom: 10 }}>{hint}</p>
      <p style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.6 }}>
        有事件後，點卡片進詳情頁即可使用 <strong>ChatGPT / Claude / Gemini</strong> 貼回診斷。
      </p>
    </div>
  );
}

function ConnectionError({ message }: { message?: string }) {
  return (
    <div
      style={{
        background: "var(--badge-red-bg)",
        border: "1px solid var(--approval-result-err-border)",
        color: "var(--badge-red-text)",
        padding: "20px 24px",
        borderRadius: 10,
        margin: 32,
      }}
    >
      <strong style={{ fontSize: 14 }}>無法連線到 Supabase</strong>
      {message && (
        <pre style={{ marginTop: 8, fontSize: 11, background: "transparent", color: "var(--approval-role-deny)", padding: 0 }}>
          {message}
        </pre>
      )}
    </div>
  );
}
