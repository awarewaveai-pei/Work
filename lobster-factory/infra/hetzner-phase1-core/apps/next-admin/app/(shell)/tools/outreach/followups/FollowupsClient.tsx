'use client';
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";

interface Lead {
  id: string;
  name: string;
  priority: string | null;
  status: string;
  next_followup_date: string | null;
}

// A lead that was mailed, whose next follow-up date is today or past, and its next step (C5.1, C5.4).
interface DueStep { id: string; version: number; channel: string; status: string; subject: string | null; body: string; followup_delay_days: number | null }
interface DueItem { lead: { id: string; name: string | null; email: string | null; next_followup_date: string | null }; step: DueStep | null }

const LEADS_API = "/api/outreach/leads";
const FU_API = "/api/outreach/followups";
const GMAIL_DRAFT_API = "/api/outreach/messages/gmail-draft";
const CHANNEL_LABEL: Record<string, string> = { ig_dm: "Instagram 私訊", linkedin: "LinkedIn 訊息", phone: "電話" };

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
  const [dueItems, setDueItems] = useState<DueItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const org = useActiveOrg();

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(withOrg(LEADS_API, org));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      setLeads(j.leads as Lead[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [org]);

  const loadDue = useCallback(async () => {
    try {
      const r = await fetch(withOrg(`${FU_API}?due=1`, org));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      setDueItems(j.due as DueItem[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [org]);

  useEffect(() => {
    void load();
    void loadDue();
  }, [load, loadDue]);

  // C5.2: the draft joins the Gmail thread of the lead's last sent mail (the route reads its Message-ID).
  async function draftInThread(item: DueItem) {
    if (!item.step) return;
    setErr(null); setNotice(null); setBusyId(item.step.id);
    try {
      const r = await fetch(GMAIL_DRAFT_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: item.step.id }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.blocked ? `不能聯絡：${j.reason}` : j.detail || j.error || "建草稿失敗");
      setNotice(j.warning ? `⚠️ ${j.warning}` : `已在原本那一串建 Gmail 草稿（寄件：${j.senderEmail}）— 草稿未寄出`);
      await loadDue();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

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
      await Promise.all([load(), loadDue()]);
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

  const emailSteps = dueItems.filter((d) => !d.step || d.step.channel === "email");
  const manualSteps = dueItems.filter((d) => d.step && d.step.channel !== "email");

  const emailRow = (d: DueItem) => {
    const st = d.step;
    return (
      <li key={d.lead.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span>
          <strong>{d.lead.name ?? d.lead.email}</strong>
          <span className="card-sub"> · 到期 {d.lead.next_followup_date}</span>
          <span className="card-sub"> · {st ? `第 ${st.version} 封追蹤信（${st.status}）` : "沒有待寄的追蹤信"}</span>
        </span>
        {st?.status === "approved" && (
          <button type="button" className="btn-primary" disabled={busyId === st.id} onClick={() => void draftInThread(d)}>建草稿（回同一串）</button>
        )}
        {st?.status === "drafted" && <span className="card-sub">草稿已建，等寄出</span>}
        {st && (st.status === "draft" || st.status === "needs_edit") && <span className="card-sub">先到審核頁核准這封</span>}
      </li>
    );
  };

  const manualRow = (d: DueItem) => {
    const st = d.step!;
    return (
      <li key={st.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span>
          <strong>{d.lead.name ?? d.lead.email}</strong>
          <span className="card-sub"> · 到期 {d.lead.next_followup_date}</span>
          <span className="card-sub"> · 第 {st.version} 步：{CHANNEL_LABEL[st.channel] ?? st.channel}</span>
          <div className="card-sub">{st.body}</div>
        </span>
        <button type="button" className="btn-primary" onClick={() => void act(d.lead.id, "step_done", { messageId: st.id })}>完成</button>
      </li>
    );
  };

  if (loading) return <div style={{ padding: 16 }} className="card-sub">載入中…</div>;

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {err && <div className="card-badge badge-red" role="alert">{err}</div>}
      {notice && <div className="card-badge badge-green" role="status">{notice}</div>}

      <div className="card">
        <div className="card-header">
          <span className="card-label">該追的信（已寄出，跟進日到了）</span>
          <span className={`card-badge ${emailSteps.length ? "badge-green" : "badge-gray"}`}>{emailSteps.length}</span>
        </div>
        {emailSteps.length === 0 ? <p className="card-sub">無</p> : <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>{emailSteps.map(emailRow)}</ul>}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-label">人工步驟（私訊／電話，做完按完成）</span>
          <span className={`card-badge ${manualSteps.length ? "badge-green" : "badge-gray"}`}>{manualSteps.length}</span>
        </div>
        {manualSteps.length === 0 ? <p className="card-sub">無</p> : <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>{manualSteps.map(manualRow)}</ul>}
      </div>

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
