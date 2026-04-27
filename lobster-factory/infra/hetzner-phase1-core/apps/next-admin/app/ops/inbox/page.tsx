import { headers } from "next/headers";
import { getSupabaseReadClient } from "@/lib/supabase-server";
import { canModifyIncidentStatus, readOpsRole } from "@/lib/ops-role";
import { IncidentCard } from "./components/IncidentCard";
import { IncidentFilterBar } from "./components/IncidentFilterBar";
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

  const statusFilter = sp.status?.split(",") ?? ["open", "investigating"];
  if (statusFilter[0] !== "all") query = query.in("status", statusFilter as IncidentStatus[]);

  if (sp.severity) query = query.in("severity", sp.severity.split(",") as IncidentSeverity[]);
  if (sp.source) query = query.in("source", sp.source.split(",") as IncidentSource[]);
  if (sp.q) query = query.or(`title.ilike.%${sp.q}%,message.ilike.%${sp.q}%`);

  const { data: incidents, error } = await query;
  if (error) return <ConnectionError message={error.message} />;

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "24px" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ color: "var(--text-primary)" }}>Ops Inbox</h1>
        <p style={{ color: "var(--text-secondary)" }}>Unified incident inbox · {incidents?.length ?? 0} matches</p>
      </header>
      <IncidentFilterBar current={sp} />
      {!incidents || incidents.length === 0 ? (
        <EmptyState />
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

function EmptyState() {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", padding: 48, textAlign: "center", borderRadius: 12 }}>
      <h3>All clear</h3>
      <p style={{ color: "var(--text-secondary)" }}>過去沒有未處理事件</p>
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
