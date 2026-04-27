import { headers } from "next/headers";
import { getSupabaseReadClient } from "@/lib/supabase-server";
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

  const supabase = getSupabaseReadClient();
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

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "24px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ color: "var(--text-primary)" }}>Ops Inbox</h1>
        <p style={{ color: "var(--text-secondary)" }}>警報收件匣（非監控儀表）· {incidents?.length ?? 0} 筆</p>
      </header>
      <InboxGuidePanel publicBaseUrl={publicBaseUrl} />
      <IncidentFilterBar current={sp} />
      {!incidents || incidents.length === 0 ? (
        <EmptyState rawStatus={rawStatus} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {incidents.map((i) => (
            <IncidentCard key={i.id} incident={i as Incident} canAct={canAct} />
          ))}
        </div>
      )}
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
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        padding: 40,
        textAlign: "center",
        borderRadius: 12,
        maxWidth: 560,
        margin: "0 auto",
      }}
    >
      <h3 style={{ marginBottom: 8 }}>目前沒有符合條件的事件</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{hint}</p>
      <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.55 }}>
        有事件後，點卡片進詳情頁即可使用 <strong>ChatGPT / Claude / Gemini</strong> 與貼回診斷。
      </p>
    </div>
  );
}

function ConnectionError({ message }: { message?: string }) {
  return (
    <div style={{ background: "#fee2e2", color: "#991b1b", padding: 24, borderRadius: 12 }}>
      <strong>無法連線到 Supabase</strong>
      {message && <pre style={{ marginTop: 8, fontSize: 12 }}>{message}</pre>}
    </div>
  );
}
