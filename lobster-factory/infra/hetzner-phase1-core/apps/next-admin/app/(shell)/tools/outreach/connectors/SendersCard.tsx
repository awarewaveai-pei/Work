'use client';
import { useCallback, useEffect, useState } from "react";
import { withOrg } from "@/lib/outreach/use-active-org";

// The cold mailboxes and their signature (SPEC D12). Every generated email ends with it, word for word.
interface Sender {
  id: string;
  email: string;
  display_name: string | null;
  stream_type: string;
  signature_block: string | null;
  default_signature: string;
}

const API = "/api/outreach/senders";

export default function SendersCard({ org }: { org: string | null }) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(withOrg(API, org));
    const j = await r.json();
    if (!j.ok) { setMsg({ ok: false, text: j.error || "載入失敗" }); return; }
    const list = j.senders as Sender[];
    setSenders(list);
    setDrafts(Object.fromEntries(list.map((s) => [s.id, s.signature_block ?? s.default_signature])));
  }, [org]);

  useEffect(() => { void load(); }, [load]);

  async function save(id: string) {
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(API, { method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, signatureBlock: drafts[id] ?? "" }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "儲存失敗");
      setMsg({ ok: true, text: "署名已儲存" });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <div className="card-header"><span className="card-label">寄件信箱與署名（{senders.length}）</span></div>
      <p className="card-sub">每封信都以這段署名結尾，AI 不會改寫。預設是名稱和組織名；網站那一行請自己補上一次。</p>
      {msg && <div className={`card-badge ${msg.ok ? "badge-green" : "badge-red"}`} role={msg.ok ? undefined : "alert"}>{msg.text}</div>}
      {senders.length === 0 ? (
        <p className="card-sub">還沒有寄件信箱。連接 Gmail 後會自動出現在這裡。</p>
      ) : senders.map((s) => {
        const value = drafts[s.id] ?? "";
        const unsaved = !s.signature_block;
        return (
          <div key={s.id} className="card" style={{ display: "grid", gap: 6 }}>
            <span>
              <strong>{s.email}</strong>
              <span className="card-sub"> · {s.stream_type}</span>
              {unsaved && <span className="card-badge badge-gray" style={{ marginLeft: 8 }}>署名尚未儲存</span>}
            </span>
            <textarea rows={4} value={value} aria-label={`${s.email} 的署名`}
              onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))} />
            <button type="button" className="btn-primary" disabled={busy === s.id || !value.trim()} onClick={() => void save(s.id)}>
              {busy === s.id ? "儲存中…" : "儲存署名"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
