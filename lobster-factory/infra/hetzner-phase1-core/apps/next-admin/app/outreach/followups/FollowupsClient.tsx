'use client';
import { useCallback, useEffect, useMemo, useState } from "react";

interface Lead {
  id: string;
  name: string;
  priority: string | null;
  status: string;
  next_followup_date: string | null;
}

const LEADS_API = "/api/outreach/leads";
const FU_API = "/api/outreach/followups";

function todayStr(): string {
  // Match the server's Asia/Taipei business-day anchor (followups/route.ts) so buckets don't drift.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

export default function FollowupsClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [schedLead, setSchedLead] = useState("");
  const [schedDate, setSchedDate] = useState(todayStr());

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(LEADS_API);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      setLeads(j.leads as Lead[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(leadId: string, action: string, extra: Record<string, unknown> = {}) {
    setErr(null);
    try {
      const r = await fetch(FU_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId, action, ...extra }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "action failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const { overdue, due, upcoming, schedulable } = useMemo(() => {
    const t = todayStr();
    const dated = leads.filter((l) => l.next_followup_date);
    return {
      overdue: dated.filter((l) => (l.next_followup_date as string) < t),
      due: dated.filter((l) => l.next_followup_date === t),
      upcoming: dated.filter((l) => (l.next_followup_date as string) > t),
      schedulable: leads.filter((l) => !l.next_followup_date && l.status !== "do_not_contact"),
    };
  }, [leads]);

  const Row = ({ l }: { l: Lead }) => (
    <li className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <span>
        <strong>{l.name}</strong>
        <span className="card-sub"> · {l.priority ?? "—"} · {l.status}</span>
        <span className="card-sub"> · 跟進 {l.next_followup_date}</span>
      </span>
      <span style={{ display: "flex", gap: 6 }}>
        <button type="button" className="btn-secondary" onClick={() => void act(l.id, "snooze", { days: 3 })}>+3天</button>
        <button type="button" className="btn-secondary" onClick={() => void act(l.id, "snooze", { days: 7 })}>+7天</button>
        <button type="button" className="btn-primary" onClick={() => void act(l.id, "complete")}>完成</button>
        <button type="button" className="btn-secondary" onClick={() => void act(l.id, "stop")}>停止聯絡</button>
      </span>
    </li>
  );

  const Bucket = ({ title, items, badge }: { title: string; items: Lead[]; badge: string }) => (
    <div className="card">
      <div className="card-header">
        <span className="card-label">{title}</span>
        <span className={`card-badge ${badge}`}>{items.length}</span>
      </div>
      {items.length === 0 ? <p className="card-sub">無</p> : (
        <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>{items.map((l) => <Row key={l.id} l={l} />)}</ul>
      )}
    </div>
  );

  if (loading) return <div style={{ padding: 16 }} className="card-sub">載入中…</div>;

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {err && <div className="card-badge badge-red" role="alert">{err}</div>}

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="card-label">排跟進：</span>
        <select value={schedLead} onChange={(e) => setSchedLead(e.target.value)} style={{ minWidth: 240 }}>
          <option value="">— 選 lead —</option>
          {schedulable.map((l) => <option key={l.id} value={l.id}>{l.name}（{l.status}）</option>)}
        </select>
        <input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
        <button type="button" className="btn-primary" disabled={!schedLead} onClick={() => { if (schedLead) void act(schedLead, "set", { date: schedDate }); setSchedLead(""); }}>
          設定跟進日
        </button>
      </div>

      <Bucket title="逾期" items={overdue} badge="badge-red" />
      <Bucket title="今天到期" items={due} badge="badge-green" />
      <Bucket title="即將" items={upcoming} badge="badge-gray" />
    </div>
  );
}
