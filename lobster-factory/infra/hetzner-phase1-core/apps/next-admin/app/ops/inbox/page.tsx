import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { canModifyIncidentStatus, readOpsRole } from "@/lib/ops-role";
import { IncidentCard } from "./components/IncidentCard";
import { IncidentFilterBar } from "./components/IncidentFilterBar";
import { InboxGuidePanel } from "./components/InboxGuidePanel";
import type { Incident, IncidentSeverity, IncidentSource, IncidentStatus } from "@/lib/ops-inbox/types";

interface SearchParams {
  status?: string;
  severity?: string;
  source?: string;
  q?: string;
}

export default async function OpsInboxListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const role = readOpsRole(new Request("http://localhost", { headers: await headers() }));
  const canAct = canModifyIncidentStatus(role);

  const supabase = getSupabaseServerClient();
  if (!supabase) return <ConnectionError />;

  let query = supabase.from("ops_incidents").select("*").order("last_seen_at", { ascending: false }).limit(200);

  const rawStatus = sp.status?.trim();
  if (!rawStatus || rawStatus === "active") {
    query = query.in("status", ["open", "investigating"] as IncidentStatus[]);
  } else if (rawStatus === "all") {
    /* no status filter */
  } else {
    const parts = rawStatus.split(",") as IncidentStatus[];
    query = query.in("status", parts);
  }

  if (sp.severity) query = query.in("severity", sp.severity.split(",") as IncidentSeverity[]);
  if (sp.source) query = query.in("source", sp.source.split(",") as IncidentSource[]);
  if (sp.q) query = query.or(`title.ilike.%${sp.q}%,message.ilike.%${sp.q}%`);

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
      {/* ── Page header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>Ops Inbox</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>警報收件匣（非監控儀表）</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {critical > 0 && (
            <StatPill count={critical} label="critical" color="#dc2626" bg="#fef2f2" />
          )}
          {high > 0 && (
            <StatPill count={high} label="high" color="#ea580c" bg="#fff7ed" />
          )}
          <StatPill count={total} label={rawStatus === "all" ? "total" : "active"} color="#475569" bg="#f1f5f9" />
        </div>
      </div>

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
    !rawStatus || rawStatus === "active"
      ? "目前篩選為「進行中」（open + investigating）。若曾結案，請點「全部」查看歷史。"
      : rawStatus === "all"
        ? "資料庫尚無任何事件紀錄。請確認 Webhook 已設定且帶正確 Bearer。"
        : "此篩選條件下沒有資料。可改點「進行中」或「全部」。";

  return (
    <div
      style={{
        background: "#fff",
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
        background: "#fef2f2",
        border: "1px solid #fecaca",
        color: "#991b1b",
        padding: "20px 24px",
        borderRadius: 10,
        margin: 32,
      }}
    >
      <strong style={{ fontSize: 14 }}>無法連線到 Supabase</strong>
      {message && (
        <pre style={{ marginTop: 8, fontSize: 11, background: "transparent", color: "#b91c1c", padding: 0 }}>
          {message}
        </pre>
      )}
    </div>
  );
}
