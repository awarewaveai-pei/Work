'use client';
import { useCallback, useEffect, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";

// The Replies page (SPEC §5.6, card C4.6): every reply, unsubscribe and bounce the sync matched to a lead, with what the
// model read in it and the person's next step. A row the sync could not process is red with 重試.
interface Reply {
  id: string;
  kind: "reply" | "bounce";
  from_email: string;
  subject: string | null;
  reply_text: string;
  received_at: string;
  reply_type: string | null;
  ai_interpretation: string | null;
  suggested_response: string | null;
  next_action: string | null;
  processed_at: string | null;
  process_attempts: number;
  last_error: string | null;
  lead: { id: string; name: string; email: string | null; status: string; do_not_contact: boolean } | null;
}

const TYPE: Record<string, { label: string; badge: string }> = {
  interested: { label: "有興趣", badge: "badge-green" },
  pricing: { label: "問價格", badge: "badge-green" },
  more_info: { label: "要更多資料", badge: "badge-green" },
  case_study: { label: "要看案例", badge: "badge-green" },
  wrong_contact: { label: "找錯人", badge: "badge-yellow" },
  has_vendor: { label: "已有廠商", badge: "badge-gray" },
  no_need: { label: "目前不需要", badge: "badge-gray" },
  reject: { label: "拒絕", badge: "badge-red" },
  unsubscribe: { label: "退訂", badge: "badge-red" },
  bounce: { label: "退信", badge: "badge-red" },
  unprocessed: { label: "處理失敗", badge: "badge-red" },
};
const LEAD_STATUS: Record<string, string> = { replied: "已回覆", meeting_booked: "約到會議", customer: "成交", lost: "失去", unsubscribed: "已退訂", do_not_contact: "不再聯絡" };
const API = "/api/outreach/replies";
const when = (iso: string) => new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });

export default function RepliesClient() {
  const org = useActiveOrg();
  const [rows, setRows] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [proposal, setProposal] = useState<Record<string, { subject: string | null; body: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(withOrg(API, org));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "載入失敗");
      setRows(j.replies as Reply[]);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: string, done: string) {
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || j.code || "操作失敗");
      if (j.proposal) setProposal((p) => ({ ...p, [id]: j.proposal }));
      setMsg({ ok: true, text: done });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const SYNC_ERR: Record<string, string> = {
    no_bridge: "這個客戶沒有連上 WordPress 站，無法同步",
    not_eligible: "這個名單還不能同步（要先有回信或同意，且沒被拒收）",
    sync_failed: "FluentCRM 同步失敗，稍後再試",
  };
  async function syncCrm(id: string, leadId: string) {
    setBusy(id); setMsg(null);
    try {
      const r = await fetch("/api/outreach/leads/sync-fluentcrm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId }) });
      const j = await r.json();
      if (!j.ok) throw new Error(SYNC_ERR[j.error] ?? j.error ?? "同步失敗");
      setMsg({ ok: true, text: "已同步到 FluentCRM" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  if (loading && rows.length === 0) return <div style={{ padding: 16 }} className="card-sub">載入中…</div>;

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <p className="card-sub">系統每 10 分鐘讀一次連上的 Gmail。名單寄來的回信、退訂與退信都會出現在這裡；有人回信後，後面的追蹤信會自動停掉。</p>
      {msg && <div className={`card-badge ${msg.ok ? "badge-green" : "badge-red"}`} role={msg.ok ? undefined : "alert"}>{msg.text}</div>}
      {rows.length === 0 ? <div className="card"><p className="card-sub">還沒有回信。</p></div> : rows.map((r) => {
        const t = TYPE[r.reply_type ?? ""] ?? null;
        const failed = r.reply_type === "unprocessed";
        const off = busy === r.id;
        return (
          <div key={r.id} className="card" style={{ display: "grid", gap: 8, borderColor: failed ? "var(--badge-red-text, #b91c1c)" : undefined }}>
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong>{r.lead?.name ?? "（名單已刪除）"}</strong>
              <span className="card-sub">{r.from_email} · {when(r.received_at)}</span>
              {t ? <span className={`card-badge ${t.badge}`}>{t.label}</span> : <span className="card-badge badge-gray">分類中</span>}
              {r.lead && LEAD_STATUS[r.lead.status] && <span className="card-badge badge-gray">名單：{LEAD_STATUS[r.lead.status]}</span>}
              {r.next_action === "ask_contact" && <span className="card-badge badge-yellow">要問正確窗口</span>}
            </span>
            {r.subject && <span className="card-sub">主旨：{r.subject}</span>}
            <div style={{ whiteSpace: "pre-wrap" }}>{r.reply_text.length > 600 ? `${r.reply_text.slice(0, 600)}…` : r.reply_text}</div>
            {r.ai_interpretation && <span className="card-sub">對方要的：{r.ai_interpretation}</span>}
            {r.suggested_response && <span className="card-sub">建議回覆：{r.suggested_response}</span>}
            {failed && <span className="card-sub" role="alert">處理失敗 {r.process_attempts} 次：{r.last_error ?? "原因不明"}</span>}
            {proposal[r.id] && (
              <div className="card" style={{ whiteSpace: "pre-wrap" }}>
                <strong>報價摘要草稿{proposal[r.id].subject ? `：${proposal[r.id].subject}` : ""}</strong>
                <div>{proposal[r.id].body}</div>
                <span className="card-sub">已存成草稿，不會自動寄出。複製到 Gmail 回信即可。</span>
              </div>
            )}
            {r.kind === "reply" && (
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {failed && <button type="button" className="btn-primary" disabled={off} onClick={() => void act(r.id, "retry", "已排入重試，10 分鐘內重新分類")}>重試</button>}
                <button type="button" className="btn-secondary" disabled={off} onClick={() => void act(r.id, "proposal", "報價摘要草稿已產生")}>產報價摘要（用 AI 額度）</button>
                <button type="button" className="btn-secondary" disabled={off} onClick={() => void act(r.id, "ask_contact", "已記下：要問正確窗口")}>問正確窗口</button>
                <button type="button" className="btn-secondary" disabled={off} onClick={() => void act(r.id, "meeting", "名單改為約到會議")}>約到會議</button>
                <button type="button" className="btn-secondary" disabled={off} onClick={() => void act(r.id, "won", "名單改為成交")}>成交</button>
                <button type="button" className="btn-secondary" disabled={off} onClick={() => void act(r.id, "lost", "名單改為失去")}>失去</button>
                <button type="button" className="btn-secondary" disabled={off || !!r.lead?.do_not_contact}
                  onClick={() => { if (window.confirm("加入拒收後，這個地址不會再收到任何信。確定？")) void act(r.id, "suppress", "已加入拒收名單"); }}>加入拒收</button>
                <button type="button" className="btn-secondary" disabled={off || !r.lead} onClick={() => void syncCrm(r.id, r.lead!.id)}>同步 FluentCRM</button>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
