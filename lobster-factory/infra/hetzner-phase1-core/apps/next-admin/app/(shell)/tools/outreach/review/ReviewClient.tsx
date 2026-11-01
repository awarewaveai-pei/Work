'use client';
import { useCallback, useEffect, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";

// Review (SPEC §5.4): the two first-email variants side by side, approve one (the other is skipped by the API), then the
// follow-ups. Approving needs the gate not to block; an edit is gated again by the API.
interface Lead { id: string; name: string; score: number; priority: string | null; status: string; }
interface Message {
  id: string;
  output_type: string;
  variant_label: string | null;
  version: number;
  subject: string | null;
  body: string;
  ai_model: string | null;
  safety_score: number | null;
  quality_gate_status: string | null;
  gate_snapshot: { findings?: string[]; auto?: boolean; claim_check?: { verdict: string; claims?: string[] } } | null;
  evidence_snapshot: { evidence_ids?: string[] } | null;
  followup_delay_days: number | null;
  status: string;
  created_at: string;
  prompt_snapshot: { mode?: string } | null;
}

const LEADS_API = "/api/outreach/leads";
const MSG_API = "/api/outreach/messages";
const GMAIL_DRAFT_API = "/api/outreach/messages/gmail-draft";

const ERRORS: Record<string, string> = {
  variant_already_approved: "這筆名單已經核准了另一版首封",
  first_email_exists: "這筆名單已經有核准或寄出的首封，不再產新的",
  gate_blocked: "檢查沒過，不能核准：先修改內容",
  already_drafted: "已經建成 Gmail 草稿，不能再改",
  already_sent: "已經寄出，不能再改",
};

function gateBadge(s: string | null): string {
  if (s === "pass") return "badge-green";
  if (s === "block") return "badge-red";
  return "badge-gray";
}

export default function ReviewClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadId, setLeadId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; subject: string; body: string } | null>(null);
  const [pasted, setPasted] = useState("");

  const org = useActiveOrg();

  const loadLeads = useCallback(async () => {
    try {
      const r = await fetch(withOrg(LEADS_API, org));
      const j = await r.json();
      if (j.ok) setLeads(j.leads as Lead[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [org]);

  const loadMessages = useCallback(async (id: string) => {
    if (!id) { setMessages([]); return; }
    try {
      const r = await fetch(`${MSG_API}?leadId=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (j.ok) setMessages(j.messages as Message[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void loadLeads(); }, [loadLeads]);
  useEffect(() => { void loadMessages(leadId); }, [leadId, loadMessages]);

  const fail = (j: { error?: string; blockers?: string[] }) =>
    j.blockers?.length ? `擋下：${j.blockers.join("；")}` : ERRORS[j.error ?? ""] ?? j.error ?? "失敗";

  // pastedReply: the reply ChatGPT/Claude gave for the manual prompt, run through the same guard as an AI reply.
  async function generate(pastedReply?: string) {
    if (!leadId) return;
    setBusy(true); setErr(null); setNotice(null);
    try {
      const r = await fetch(MSG_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId, pastedReply }) });
      const j = await r.json();
      if (!j.ok) { setErr(j.error === "pasted_unparseable" ? `貼回的內容格式不對：${j.detail}` : fail(j)); return; }
      if (pastedReply) setPasted("");
      setNotice(j.mode === "manual_prompt"
        ? "沒有可用的 AI 金鑰（或 AI 回覆格式不對）→ 已產生提示詞：複製到 ChatGPT／Claude，把它的回覆整段貼回下方"
        : `已用 ${j.mode === "manual_paste" ? "貼回的回覆" : j.mode} 產生 A／B 兩版首封與追蹤信`);
      await loadMessages(leadId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, fields: Record<string, unknown>) {
    setErr(null);
    try {
      const r = await fetch(MSG_API, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...fields }) });
      const j = await r.json();
      if (!j.ok) { setErr(fail(j)); return false; }
      if (j.warning) setErr(`⚠️ ${j.warning}`);
      await loadMessages(leadId);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const ok = await patch(editing.id, { status: "draft", subject: editing.subject, body: editing.body });
    if (ok) setEditing(null);
  }

  // confirmedNoDraft: the person looked in Gmail and found no draft for a row stuck as drafted (the server redrafts
  // only then, and only for a take older than 10 minutes with no draft event).
  async function createGmailDraft(messageId: string, confirmedNoDraft = false) {
    setErr(null); setNotice(null); setBusy(true);
    try {
      const r = await fetch(GMAIL_DRAFT_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId, confirmedNoDraft }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.blocked ? `不能聯絡：${j.reason}` : j.detail || ERRORS[j.error] || j.error || "建草稿失敗");
      if (j.warning) { setErr(`⚠️ ${j.warning}`); } else {
        setNotice(`已建 Gmail 草稿（寄件：${j.senderEmail}）— 草稿未寄出，請自行到 Gmail 確認並手動寄送`);
      }
      await loadMessages(leadId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const firsts = messages.filter((m) => m.output_type === "cold_email" && m.status !== "skipped")
    .sort((a, b) => (a.variant_label ?? "").localeCompare(b.variant_label ?? ""));
  const skipped = messages.filter((m) => m.output_type === "cold_email" && m.status === "skipped").length;
  const followups = messages.filter((m) => m.output_type === "followup").sort((a, b) => a.version - b.version);

  const card = (m: Message) => {
    const isEditing = editing?.id === m.id;
    const locked = m.status === "drafted" || m.status === "sent";
    const findings = m.gate_snapshot?.findings ?? [];
    const claim = m.gate_snapshot?.claim_check;
    const isPrompt = m.prompt_snapshot?.mode === "manual_prompt";
    return (
      <li key={m.id} className="card" style={{ display: "grid", gap: 8, alignContent: "start" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>{m.output_type === "cold_email" ? `${m.variant_label ?? "首封"} 版` : `第 ${m.version} 封（${m.followup_delay_days ?? "?"} 天後）`}</strong>
          <span className={`card-badge ${m.status === "approved" ? "badge-green" : "badge-gray"}`}>{m.status}</span>
          {m.quality_gate_status && <span className={`card-badge ${gateBadge(m.quality_gate_status)}`}>檢查：{m.quality_gate_status}</span>}
          {m.gate_snapshot?.auto && <span className="card-badge badge-green">自動核准</span>}
          <span className="card-sub">{m.ai_model ?? "manual_prompt"}</span>
        </div>
        {isEditing ? (
          <>
            {m.output_type === "cold_email" && (
              <input value={editing.subject} aria-label="主旨" placeholder="主旨（25 字以內）"
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
            )}
            <textarea rows={12} value={editing.body} aria-label="內文" onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-primary" onClick={() => void saveEdit()}>儲存修改</button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>取消</button>
            </div>
          </>
        ) : (
          <>
            {m.subject && <div><span className="card-sub">主旨：</span><strong>{m.subject}</strong></div>}
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{m.body}</pre>
          </>
        )}
        {findings.length > 0 && <div className="card-sub">檢查結果：{findings.join("；")}</div>}
        {claim && claim.verdict !== "supported" && (
          <div className="card-sub">事實核對：{claim.verdict}{claim.claims?.length ? `（沒有證據：${claim.claims.join("；")}）` : ""}</div>
        )}
        {m.evidence_snapshot?.evidence_ids?.length ? <div className="card-sub">依據證據：{m.evidence_snapshot.evidence_ids.join(", ")}</div> : null}
        {isPrompt && (
          <div style={{ display: "grid", gap: 6 }}>
            <button type="button" className="btn-secondary" onClick={() => void navigator.clipboard?.writeText(m.body)}>複製提示詞</button>
            <span className="card-sub">把提示詞貼到 ChatGPT／Claude，再把它的回覆整段貼在這裡：</span>
            <textarea rows={6} value={pasted} aria-label="貼回 AI 回覆" onChange={(e) => setPasted(e.target.value)} />
            <button type="button" className="btn-primary" disabled={busy || !pasted.trim()} onClick={() => void generate(pasted)}>用貼回的回覆產生信件</button>
          </div>
        )}
        {!isEditing && !isPrompt && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!locked && m.status !== "approved" && (
              <button type="button" className="btn-primary" disabled={m.quality_gate_status === "block"} onClick={() => void patch(m.id, { status: "approved" })}>
                {m.output_type === "cold_email" ? "核准這版" : "核准"}
              </button>
            )}
            {m.status === "approved" && m.output_type === "cold_email" && (
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void createGmailDraft(m.id)}>
                {busy ? "建立中…" : "建 Gmail 草稿"}
              </button>
            )}
            {m.status === "drafted" && <span className="card-badge badge-green">✅ 已建 Gmail 草稿（未寄出）</span>}
            {m.status === "drafted" && m.output_type === "cold_email" && (
              <button type="button" className="btn-secondary" disabled={busy}
                onClick={() => { if (window.confirm("你已經打開 Gmail 的草稿匣，確定裡面沒有這封信？按確定會再建一次。")) void createGmailDraft(m.id, true); }}>
                Gmail 裡沒有？再建一次
              </button>
            )}
            {!locked && (
              <>
                <button type="button" className="btn-secondary" onClick={() => setEditing({ id: m.id, subject: m.subject ?? "", body: m.body })}>編輯</button>
                <button type="button" className="btn-secondary" onClick={() => void patch(m.id, { status: "needs_edit" })}>需修改</button>
                <button type="button" className="btn-secondary" onClick={() => void patch(m.id, { status: "skipped" })}>跳過</button>
              </>
            )}
            <button type="button" className="btn-secondary" onClick={() => void navigator.clipboard?.writeText(m.body)}>複製</button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {err && <div className="card-badge badge-red" role="alert">{err}</div>}
      {notice && <div className="card-badge badge-green">{notice}</div>}

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="card-label">選 Lead：</span>
        <select value={leadId} onChange={(e) => setLeadId(e.target.value)} style={{ minWidth: 280 }}>
          <option value="">— 選擇 —</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>{l.name}（{l.priority ?? "—"} · {l.score} · {l.status}）</option>
          ))}
        </select>
        <button type="button" className="btn-primary" disabled={!leadId || busy} onClick={() => void generate()}>
          {busy ? "產生中…" : "產生冷信（A／B 兩版＋追蹤信）"}
        </button>
        <span className="card-sub">需要：觀察與來源、寄件信箱的署名；名單不是對方自己公開的聯絡方式時，還要服務設定的隱私說明頁。</span>
      </div>

      {leadId && (
        <>
          <div className="card">
            <div className="card-header"><span className="card-label">首封（{firsts.length}{skipped ? `，另 ${skipped} 版已跳過` : ""}）</span></div>
            {firsts.length === 0 ? (
              <p className="card-sub">尚無首封。按「產生冷信」。</p>
            ) : (
              <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, listStyle: "none", padding: 0 }}>
                {firsts.map(card)}
              </ul>
            )}
          </div>
          {followups.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-label">追蹤信（{followups.length}）</span></div>
              <ul style={{ display: "grid", gap: 12, listStyle: "none", padding: 0 }}>{followups.map(card)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
