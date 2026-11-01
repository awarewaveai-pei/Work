'use client';
import { useCallback, useEffect, useState } from "react";
import { TEXT_FEATURES, TWD_RATE } from "@/lib/ai/cost-model";
import { featureUnitCostUsd } from "@/lib/ai/cost-calculator";

// One lead's research and evidence (SPEC §5.1, §5.2). The button shows the ceiling cost before it is pressed; the run
// happens in the background and is polled. Evidence from the lead's own website arrives approved; anything else waits
// here for approve / reject. Cold email generation reads approved evidence only.
interface Evidence { id: string; claim: string; excerpt: string | null; source_url: string; status: "pending" | "approved" | "rejected" | "stale" }
interface Outcome { status: "done" | "insufficient" | "no_website" | "platform_website" | "failed"; written: number; approved: number; evidence: number;
  pending: number; emailFound: string | null; error?: string }

const RESEARCH_API = "/api/outreach/leads/research";
const EVIDENCE_API = "/api/outreach/evidence";
const profile = TEXT_FEATURES.find((f) => f.key === "outreach-research");
const CEILING_TWD = profile ? Math.max(1, Math.ceil(featureUnitCostUsd(profile) * TWD_RATE)) : null;

const OUTCOME: Record<Outcome["status"], string> = {
  done: "研究完成",
  insufficient: "網站上找不到可用的事實",
  no_website: "這筆名單沒有網站",
  platform_website: "網站欄是社群或平台頁，不是對方自己的網站：改成對方的官網再研究",
  failed: "研究失敗",
};

export default function LeadResearch({ leadId, hasWebsite, onDone }: { leadId: string; hasWebsite: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState<Evidence[]>([]);

  const load = useCallback(async () => {
    const all: Evidence[] = [];
    for (const status of ["pending", "approved", "stale"]) {
      const r = await fetch(`${EVIDENCE_API}?leadId=${encodeURIComponent(leadId)}&status=${status}`);
      const j = await r.json();
      if (j.ok) all.push(...(j.evidence as Evidence[]));
    }
    setRows(all);
  }, [leadId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  async function research() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(RESEARCH_API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error === "not_cold_contactable" ? "這筆名單不寄冷信（不可聯絡、已回覆或已轉暖）" : j.error || "研究沒有開始");
      for (let i = 0; i < 60; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        const p = await (await fetch(`${RESEARCH_API}?runKey=${encodeURIComponent(j.runKey)}`)).json();
        if (!p.ok) throw new Error(p.error || "查不到研究進度");
        if (p.status === "running") continue;
        if (p.status === "error") throw new Error(p.error || "研究失敗");
        const o = (p.outcomes as Outcome[])[0];
        const parts = [OUTCOME[o.status], o.written ? `新證據 ${o.written} 條（自動核准 ${o.approved} 條）` : "",
          o.pending ? `${o.pending} 條等你核准` : "", o.emailFound ? `找到 email：${o.emailFound}` : "", o.error ?? ""];
        setMsg({ ok: o.status === "done", text: parts.filter(Boolean).join("；") });
        setOpen(true);
        await load();
        onDone();
        return;
      }
      throw new Error("研究超過 3 分鐘還沒結束，晚點再打開看");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, status: "approved" | "rejected") {
    const r = await fetch(EVIDENCE_API, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    const j = await r.json();
    if (!j.ok) { setMsg({ ok: false, text: j.error || "更新失敗" }); return; }
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="btn-secondary" disabled={busy || !hasWebsite} title={hasWebsite ? "" : "這筆名單沒有網站"} onClick={() => void research()}>
          {busy ? "研究中…" : `研究這家${CEILING_TWD ? `（最多約 NT$${CEILING_TWD}）` : ""}`}
        </button>
        <button type="button" className="btn-secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "收起證據" : "證據"}</button>
      </span>
      {msg && <span className={`card-badge ${msg.ok ? "badge-green" : "badge-red"}`}>{msg.text}</span>}
      {open && (rows.length === 0 ? <span className="card-sub">還沒有證據。</span> : (
        <ul style={{ display: "grid", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((e) => (
            <li key={e.id} className="card" style={{ display: "grid", gap: 4 }}>
              <span><span className={`card-badge ${e.status === "approved" ? "badge-green" : "badge-gray"}`}>
                {e.status === "approved" ? "已核准" : e.status === "stale" ? "已失效（網站上已沒有這句原文）" : "待審"}</span> {e.claim}</span>
              {e.excerpt && <span className="card-sub">原文：「{e.excerpt}」</span>}
              <a className="card-sub" href={e.source_url} target="_blank" rel="noopener noreferrer">{e.source_url}</a>
              {e.status === "pending" && (
                <span style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn-primary" onClick={() => void decide(e.id, "approved")}>核准</button>
                  <button type="button" className="btn-secondary" onClick={() => void decide(e.id, "rejected")}>退回</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
