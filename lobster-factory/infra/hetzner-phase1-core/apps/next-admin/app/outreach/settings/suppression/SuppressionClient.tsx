'use client';
import { useCallback, useEffect, useState } from "react";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";

interface Entry {
  id: string;
  email: string | null;
  domain: string | null;
  company_name: string | null;
  reason: string;
  scope: string;
  applies_to: string;
  created_at: string;
}

interface FormState {
  email: string;
  domain: string;
  reason: string;
  appliesTo: string;
}

const EMPTY: FormState = { email: "", domain: "", reason: "user_manual", appliesTo: "all" };
const API = "/api/outreach/suppression";

const REASONS = ["user_manual", "manual_opt_out", "unsubscribe", "complaint", "spam_report", "hard_bounce", "invalid_email", "legal_request", "domain_block"];

export default function SuppressionClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(API);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      setEntries(j.entries as Entry[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email.trim() && !form.domain.trim()) {
      setErr("至少填 email 或 domain");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "add failed");
      setForm(EMPTY);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("移除這筆 suppression？此 email/domain 將「重新可被聯絡」，請確認。")) return;
    setErr(null);
    try {
      const r = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "remove failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {err && <div className="card-badge badge-red" role="alert">{err}</div>}

      <form className="card" onSubmit={add} style={{ display: "grid", gap: 8 }}>
        <div className="card-header"><span className="card-label">新增 Suppression（寄送前必查）</span></div>
        <input placeholder="Email（精確封鎖）" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <input placeholder="Domain（整個網域封鎖，如 example.com）" value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} />
        <div style={{ display: "flex", gap: 8 }}>
          <select value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={form.appliesTo} onChange={(e) => setForm((f) => ({ ...f, appliesTo: e.target.value }))}>
            <option value="all">all</option>
            <option value="cold">cold</option>
            <option value="marketing">marketing</option>
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "處理中…" : "加入 Suppression"}</button>
      </form>

      <div className="card">
        <div className="card-header"><span className="card-label">Suppression List（{entries.length}）</span></div>
        {loading ? (
          <p className="card-sub">載入中…</p>
        ) : entries.length === 0 ? (
          <p className="card-sub">清單為空。退訂 / 投訴 / 退信 / 手動拒收都會進這裡，匯入名單時自動比對擋掉。</p>
        ) : (
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>
            {entries.map((it) => (
              <li key={it.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span>
                  <strong>{it.email ?? it.domain ?? it.company_name}</strong>
                  <span className="card-sub"> · {it.scope} · {it.reason} · {it.applies_to}</span>
                </span>
                <button type="button" className="btn-secondary" onClick={() => void remove(it.id)}>移除</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
