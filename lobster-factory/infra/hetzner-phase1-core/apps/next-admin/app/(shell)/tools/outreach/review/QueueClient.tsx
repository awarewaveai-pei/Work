'use client';
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";

// The queue (card C15.2, SPEC D23): everything the pipeline left for a person, one list. a = approve, r = return
// (evidence: reject; email: back to needs_edit), j = next. Each item shows where its facts come from and the notice line
// the email carries. Approving a first email skips the other variant (the messages API does that).
interface Source { id: string; claim: string; source_url: string; source_label: string | null }
interface Evidence { id: string; lead_id: string; claim: string; excerpt: string | null; source_url: string; source_label: string | null; co_leads: { name: string } | null }
interface Message {
  id: string; lead_id: string; variant_label: string | null; subject: string | null; body: string; quality_gate_status: string | null;
  gate_snapshot: { sampled?: boolean; findings?: string[]; required?: { notice?: string | null }; claim_check?: { verdict: string; claims?: string[] } } | null;
  evidence_snapshot: { evidence_ids?: string[] } | null; co_leads: { name: string } | null;
}
type Item = { kind: "evidence"; id: string; row: Evidence } | { kind: "message"; id: string; row: Message };

const QUEUE_API = "/api/outreach/review-queue";

/** Why a person has to look at this email, in the operator's words. */
function reasonOf(m: Message): string {
  const claim = m.gate_snapshot?.claim_check;
  if (claim?.verdict === "unsupported") return `事實核對沒過${claim.claims?.length ? `：${claim.claims.join("；")}` : ""}`;
  if (claim?.verdict === "error") return "事實核對沒做成";
  if (m.quality_gate_status === "warn") return `檢查有警告${m.gate_snapshot?.findings?.length ? `：${m.gate_snapshot.findings.join("；")}` : ""}`;
  if (m.gate_snapshot?.sampled) return "抽樣：每批抽幾封給人看";
  return "手動模式：每封都要人核准";
}

export default function QueueClient() {
  const org = useActiveOrg();
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<Map<string, Source>>(new Map());
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await (await fetch(withOrg(QUEUE_API, org))).json();
      if (!j.ok) { setErr(j.error ?? "讀不到佇列"); return; }
      setEvidence(j.evidence as Evidence[]);
      setMessages(j.messages as Message[]);
      setSources(new Map((j.sources as Source[]).map((s) => [s.id, s])));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [org]);
  useEffect(() => { void load(); }, [load]);

  const items: Item[] = useMemo(() => [
    ...evidence.map((row): Item => ({ kind: "evidence", id: row.id, row })),
    ...messages.map((row): Item => ({ kind: "message", id: row.id, row })),
  ], [evidence, messages]);
  const index = Math.min(at, items.length - 1);
  const current: Item | undefined = items[index];

  const act = useCallback(async (item: Item | undefined, approve: boolean) => {
    if (!item || busy) return;
    setBusy(true); setErr(null);
    try {
      const url = item.kind === "evidence" ? "/api/outreach/evidence" : "/api/outreach/messages";
      const status = item.kind === "evidence" ? (approve ? "approved" : "rejected") : (approve ? "approved" : "needs_edit");
      const j = await (await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, status }) })).json();
      if (!j.ok) setErr(j.error === "gate_blocked" ? "檢查沒過，不能核准：到下方「選 Lead」修改內容" : j.error === "variant_already_approved" ? "這筆名單已經核准了另一版首封" : j.error ?? "失敗");
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [busy, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.tagName === "SELECT" || t?.isContentEditable) return;
      if (e.key === "j") setAt((i) => (items.length ? (i + 1) % items.length : 0));
      else if (e.key === "a") void act(current, true);
      else if (e.key === "r") void act(current, false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, current, act]);

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div className="card">
        <div className="card-header"><span className="card-label">待人工（{items.length}）</span></div>
        <span className="card-sub">鍵盤：a 核准　r 退回　j 下一筆。其餘都已照政策自動處理。</span>
        {err && <div className="card-badge badge-red" role="alert">{err}</div>}
        {items.length === 0 && <p className="card-sub">佇列是空的。</p>}
      </div>
      {current && (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong>{current.row.co_leads?.name ?? current.row.lead_id}</strong>
            <span className="card-badge badge-gray">{current.kind === "evidence" ? "第三方證據" : `首封 ${current.row.variant_label ?? ""} 版`}</span>
            <span className="card-sub">{index + 1} / {items.length}</span>
          </div>
          {current.kind === "evidence" ? (
            <>
              <div>{current.row.claim}</div>
              {current.row.excerpt && <blockquote className="card-sub" style={{ margin: 0 }}>{current.row.excerpt}</blockquote>}
              <div className="card-sub">來源：<a href={current.row.source_url} target="_blank" rel="noreferrer">{current.row.source_label ?? current.row.source_url}</a></div>
            </>
          ) : (
            <>
              <div className="card-sub">為什麼在這裡：{reasonOf(current.row)}</div>
              {current.row.subject && <div><span className="card-sub">主旨：</span><strong>{current.row.subject}</strong></div>}
              <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>{current.row.body}</pre>
              <div className="card-sub">告知行：{current.row.gate_snapshot?.required?.notice ?? "這封不需要（對方自己公開了聯絡方式）"}</div>
              <div className="card-sub">證據來源：{(current.row.evidence_snapshot?.evidence_ids ?? []).map((id) => sources.get(id)).filter((s): s is Source => !!s).map((s) => s.source_label ?? s.source_url).join("；") || "（沒有對應的證據列）"}</div>
            </>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void act(current, true)}>核准（a）</button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void act(current, false)}>退回（r）</button>
            <button type="button" className="btn-secondary" onClick={() => setAt((i) => (i + 1) % items.length)}>下一筆（j）</button>
          </div>
        </div>
      )}
    </div>
  );
}
