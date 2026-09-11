'use client';
import { useCallback, useEffect, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";

interface Lead { id: string; name: string; score: number; priority: string | null; status: string; }
interface Evidence { used_observation: string | null; used_pain_guess: string | null; source_url: string | null; unsupported_claims: string[] }
interface Message {
  id: string;
  body: string;
  ai_model: string | null;
  safety_score: number | null;
  quality_gate_status: string | null;
  evidence_snapshot: Evidence | null;
  status: string;
  created_at: string;
}

const LEADS_API = "/api/outreach/leads";
const MSG_API = "/api/outreach/messages";
const GMAIL_DRAFT_API = "/api/outreach/messages/gmail-draft";

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

  async function generate() {
    if (!leadId) return;
    setBusy(true); setErr(null); setNotice(null);
    try {
      const r = await fetch(MSG_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const j = await r.json();
      if (!j.ok) {
        if (j.blocked) { setErr(`Cold Gate 擋下：${(j.blockers as string[]).join("；")}`); return; }
        throw new Error(j.error || "generate failed");
      }
      setNotice(j.mode === "gemini" ? "已用 Gemini 生成冷信草稿" : "無可用 AI 金鑰 → 已產生 prompt（極省模式，可貼到 ChatGPT/Claude）");
      await loadMessages(leadId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setErr(null);
    try {
      const r = await fetch(MSG_API, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "update failed");
      await loadMessages(leadId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function createGmailDraft(messageId: string) {
    setErr(null); setNotice(null); setBusy(true);
    try {
      const r = await fetch(GMAIL_DRAFT_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "建草稿失敗");
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
          {busy ? "生成中…" : "生成冷信"}
        </button>
        <span className="card-sub">Cold Gate：需有 observation + source_url；AI 用該客戶 BYO Gemini key（無則產 prompt 手動貼）。</span>
      </div>

      {leadId && (
        <div className="card">
          <div className="card-header"><span className="card-label">草稿（{messages.length}）</span></div>
          {messages.length === 0 ? (
            <p className="card-sub">尚無草稿。按「生成冷信」。</p>
          ) : (
            <ul style={{ display: "grid", gap: 12, listStyle: "none", padding: 0 }}>
              {messages.map((m) => (
                <li key={m.id} className="card" style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className={`card-badge ${m.status === "approved" ? "badge-green" : "badge-gray"}`}>{m.status}</span>
                    {m.quality_gate_status && <span className={`card-badge ${gateBadge(m.quality_gate_status)}`}>gate: {m.quality_gate_status}</span>}
                    {m.safety_score != null && <span className="card-sub">safety {m.safety_score}</span>}
                    <span className="card-sub">{m.ai_model ?? "manual_prompt"}</span>
                  </div>
                  <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{m.body}</pre>
                  {m.evidence_snapshot && (
                    <div className="card-sub">
                      依據：obs=「{m.evidence_snapshot.used_observation ?? "—"}」｜source={m.evidence_snapshot.source_url ?? "—"}
                      {m.evidence_snapshot.unsupported_claims?.length ? `｜⚠️ 未支撐：${m.evidence_snapshot.unsupported_claims.join(", ")}` : ""}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn-primary" disabled={m.quality_gate_status === "block"} onClick={() => void setStatus(m.id, "approved")}>Approve</button>
                    {m.status === "approved" && (
                      <button type="button" className="btn-primary" disabled={busy} onClick={() => void createGmailDraft(m.id)}>
                        {busy ? "建立中…" : "建 Gmail 草稿"}
                      </button>
                    )}
                    {m.status === "drafted" && <span className="card-badge badge-green">✅ 已建 Gmail 草稿（未寄出）</span>}
                    <button type="button" className="btn-secondary" onClick={() => void setStatus(m.id, "needs_edit")}>需修改</button>
                    <button type="button" className="btn-secondary" onClick={() => void navigator.clipboard?.writeText(m.body)}>複製</button>
                    <button type="button" className="btn-secondary" onClick={() => void setStatus(m.id, "skipped")}>跳過</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
