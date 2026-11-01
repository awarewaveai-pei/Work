'use client';
import { useCallback, useEffect, useState } from "react";

// One profile's privacy page and review policy (SPEC D20, D23). The server re-checks everything shown here:
// the page answers 200, every list item ticked, sampled only after enough emails a person approved.
const API = "/api/outreach/service-profiles";

// SPEC D20: what the privacy page must say. The system does not read the page; the operator confirms each item.
const PRIVACY_ITEMS = [
  "蒐集者名稱與聯絡方式",
  "蒐集目的",
  "個人資料的類別",
  "利用的期間、地區、對象與方式",
  "當事人的權利與行使方式（含拒絕再收到信）",
  "資料來源的類別",
];

interface Policy { privacy_url: string | null; review_mode: "manual" | "sampled"; review_sample_pct: number }

// The three presets are the two dials (review_mode, review_sample_pct), not a third setting. Sending itself is a
// mailbox property (pool mailboxes send, the test Gmail only drafts): a manual profile never approves, so never sends.
const PRESETS = [
  { label: "手動", mode: "manual" as const, pct: 0 },
  { label: "半自動", mode: "sampled" as const, pct: 10 },
  { label: "全自動", mode: "sampled" as const, pct: 2 },
];

export default function ProfilePolicy({ id }: { id: string }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [approved, setApproved] = useState(0);
  const [needs, setNeeds] = useState(50);
  const [url, setUrl] = useState("");
  const [ticks, setTicks] = useState<boolean[]>(PRIVACY_ITEMS.map(() => false));
  const [pct, setPct] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`${API}?id=${encodeURIComponent(id)}`);
    const j = await r.json();
    if (!j.ok) { setMsg({ ok: false, text: j.error || "載入失敗" }); return; }
    const p = j.profile as Policy;
    setPolicy(p);
    setApproved(j.humanApproved ?? 0);
    setNeeds(j.sampledNeeds ?? 50);
    setUrl(p.privacy_url ?? "");
    setPct(String(p.review_sample_pct ?? 10));
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function patch(fields: Record<string, unknown>, done: string) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(API, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...fields }) });
      const j = await r.json();
      if (!j.ok) {
        const text = j.error === "privacy_url_unreachable" ? "這個網址打不開（需要 https 而且回應正常）"
          : j.error === "privacy_checklist_required" ? "清單每一項都要勾"
          : j.error === "sampled_locked" ? `人工核准滿 ${j.needed} 封才能改抽查（目前 ${j.approved}）` : j.error || "儲存失敗";
        throw new Error(text);
      }
      setMsg({ ok: true, text: done });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!policy) return msg ? <div className="card-badge badge-red" role="alert">{msg.text}</div> : <p className="card-sub">載入中…</p>;
  const allTicked = ticks.every(Boolean);
  const pctNum = Number(pct);
  const pctValid = Number.isInteger(pctNum) && pctNum >= 1 && pctNum <= 100;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {msg && <div className={`card-badge ${msg.ok ? "badge-green" : "badge-red"}`} role={msg.ok ? undefined : "alert"}>{msg.text}</div>}

      <div style={{ display: "grid", gap: 6 }}>
        <span className="card-label">隱私說明頁</span>
        <span className="card-sub">名單不是對方自己公開的聯絡方式時，信尾會附這個網址。儲存時系統會打開一次確認網址正常。</span>
        <input type="url" placeholder="https://…/privacy" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="隱私說明頁網址" />
        <span className="card-sub">頁面上有寫這些嗎？每一項都勾了才能存：</span>
        {PRIVACY_ITEMS.map((item, i) => (
          <label key={item} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={ticks[i]} onChange={(e) => setTicks((t) => t.map((v, j) => (j === i ? e.target.checked : v)))} />
            {item}
          </label>
        ))}
        <button type="button" className="btn-primary" disabled={busy || !url.trim() || !allTicked}
          onClick={() => void patch({ privacyUrl: url.trim(), privacyChecklistConfirmed: true }, "隱私說明頁已儲存")}>
          儲存隱私說明頁
        </button>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <span className="card-label">審核方式</span>
        <span className="card-sub">
          手動：每封信由人選 A 或 B 版，自己建草稿、自己寄。半自動：系統替每筆名單選一版，檢查和事實核對都過就自動核准，一成交給人看。
          全自動：同半自動，只留 2% 給人看。含禁用詞的信、事實核對沒過的信，不管哪種都會交給人。
          人工已核准 {approved} 封；滿 {needs} 封才能離開手動。
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PRESETS.map((p) => {
            const active = p.mode === policy.review_mode && (p.mode === "manual" || p.pct === policy.review_sample_pct);
            return (
              <button key={p.label} type="button" className={active ? "btn-primary" : "btn-secondary"} aria-pressed={active}
                disabled={busy || active || (p.mode === "sampled" && approved < needs)}
                onClick={() => void patch(p.mode === "manual" ? { reviewMode: "manual" } : { reviewMode: "sampled", reviewSamplePct: p.pct }, `已改成${p.label}`)}>
                {p.label}
              </button>
            );
          })}
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          進階：抽查時交給人看的比例（%，至少 1）
          <input type="number" min={1} max={100} step={1} value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 80 }} />
          <button type="button" className="btn-secondary" disabled={busy || !pctValid || pctNum === policy.review_sample_pct}
            onClick={() => void patch({ reviewSamplePct: pctNum }, "比例已儲存")}>儲存比例</button>
        </label>
      </div>
    </div>
  );
}
