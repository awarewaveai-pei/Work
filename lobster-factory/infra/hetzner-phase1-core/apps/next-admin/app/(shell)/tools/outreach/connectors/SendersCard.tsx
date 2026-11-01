'use client';
import { useCallback, useEffect, useState } from "react";
import { withOrg } from "@/lib/outreach/use-active-org";
import { stageCap } from "@/lib/outreach/sender";

// The cold mailboxes and their signature (SPEC D12). Every generated email ends with it, word for word.
interface Sender {
  id: string;
  email: string;
  display_name: string | null;
  stream_type: string;
  signature_block: string | null;
  default_signature: string;
  send_mode: string;
  daily_limit: number;
  warmup_stage: string;
  health_status: string;
  dns_status: { spf: boolean; dkim: boolean; dmarc: boolean } | null;
  dns_checked_at: string | null;
}

const HEALTH: Record<string, { label: string; badge: string }> = {
  healthy: { label: "正常", badge: "badge-green" },
  warning: { label: "警告", badge: "badge-yellow" },
  paused: { label: "已暫停", badge: "badge-red" },
  blocked: { label: "已封鎖", badge: "badge-red" },
};

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

  async function recheck(id: string) {
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "recheck", id }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "檢查失敗");
      setMsg(j.healthy ? { ok: true, text: "檢查通過，已恢復自動寄出" } : { ok: false, text: `還不能恢復：${(j.reasons as string[]).join("；")}` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

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
            {s.send_mode === "auto" && (
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span className="card-badge badge-green">寄件池・自動寄出</span>
                <span className="card-sub">暖機 {s.warmup_stage}・每日上限 {stageCap(s.warmup_stage, s.daily_limit)}</span>
                <span className={`card-badge ${(HEALTH[s.health_status] ?? HEALTH.blocked).badge}`}>{(HEALTH[s.health_status] ?? HEALTH.blocked).label}</span>
                {(["spf", "dkim", "dmarc"] as const).map((k) => (
                  <span key={k} className={`card-badge ${!s.dns_status ? "badge-gray" : s.dns_status[k] ? "badge-green" : "badge-red"}`}>
                    {k.toUpperCase()} {!s.dns_status ? "未檢查" : s.dns_status[k] ? "✓" : "缺"}
                  </span>
                ))}
                <button type="button" className="btn-secondary" disabled={busy === s.id} onClick={() => void recheck(s.id)}>
                  {busy === s.id ? "檢查中…" : "重新檢查並恢復"}
                </button>
              </span>
            )}
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
