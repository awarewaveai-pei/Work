'use client';
import { useCallback, useEffect, useState } from "react";
import { LADDERS } from "@/lib/outreach/connectors/router";
import type { ConnectorNeed } from "@/lib/outreach/connectors/types";

interface Connector {
  id: string;
  connector_name: string;
  connector_type: string;
  is_enabled: boolean;
  credentials_ref: string | null;
  created_at: string;
}

interface FormState {
  connectorName: string;
  connectorType: string;
  credentialsRef: string;
}

// Phase-1 selectable connectors (PART H). connector_type aligns with the router ladders.
const KNOWN: { name: string; type: string; label: string }[] = [
  { name: "gemini",     type: "ai_generation",      label: "Gemini（AI 生成 · 客戶 BYO）" },
  { name: "hunter",     type: "email_verification", label: "Hunter（Email 驗證 · 客戶 BYO）" },
  { name: "gmail",      type: "email_send",         label: "Gmail（冷信草稿 · 客戶 OAuth）" },
  { name: "fluentsmtp", type: "email_send",         label: "FluentSMTP（暖信 · 客戶自有）" },
  { name: "brevo",      type: "email_send",         label: "Brevo（暖信 fallback free 300/日）" },
  { name: "apify",      type: "lead_scraping",      label: "Apify（抓資料 · 客戶 BYO · Phase 3）" },
  { name: "snov",       type: "email_verification", label: "Snov（Email 查找 · Phase 3）" },
];

const EMPTY: FormState = { connectorName: "gemini", connectorType: "ai_generation", credentialsRef: "" };
const API = "/api/outreach/connectors";
const NEEDS: ConnectorNeed[] = ["ai_generation", "email_verification", "lead_scraping", "email_sending"];
const NEED_LABEL: Record<ConnectorNeed, string> = {
  ai_generation: "AI 生成",
  email_verification: "Email 驗證",
  lead_scraping: "抓名單",
  email_sending: "寄送",
};

export default function ConnectorsClient() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(API);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      setConnectors(j.connectors as Connector[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onPickName(e: React.ChangeEvent<HTMLSelectElement>) {
    const k = KNOWN.find((x) => x.name === e.target.value);
    setForm((f) => ({ ...f, connectorName: e.target.value, connectorType: k?.type ?? f.connectorType }));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, isEnabled: true }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "save failed");
      setForm(EMPTY);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: Connector) {
    setErr(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: c.id,
          connectorName: c.connector_name,
          connectorType: c.connector_type,
          credentialsRef: c.credentials_ref ?? "",
          isEnabled: !c.is_enabled,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "toggle failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string) {
    if (!window.confirm("移除這個 connector？")) return;
    setErr(null);
    try {
      const r = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "delete failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {err && <div className="card-badge badge-red" role="alert">{err}</div>}

      <form className="card" onSubmit={add} style={{ display: "grid", gap: 8 }}>
        <div className="card-header">
          <span className="card-label">新增 Connector（客戶 BYO free key）</span>
        </div>
        <select value={form.connectorName} onChange={onPickName}>
          {KNOWN.map((k) => (
            <option key={k.name} value={k.name}>{k.label}</option>
          ))}
        </select>
        <input
          placeholder="credentials_ref：vault 金鑰「名稱」（非密鑰值！例：gemini_acme_co）"
          value={form.credentialsRef}
          onChange={(e) => setForm((f) => ({ ...f, credentialsRef: e.target.value }))}
        />
        <p className="card-sub">
          ⚠️ 只填 vault 金鑰「名稱」，<strong>絕不要貼真實 API key</strong>。密鑰本體存在 runtime 密鑰庫（Supabase Vault，另案）。
        </p>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "儲存中…" : "新增 Connector"}
        </button>
      </form>

      <div className="card">
        <div className="card-header">
          <span className="card-label">已連接（{connectors.length}）</span>
        </div>
        {loading ? (
          <p className="card-sub">載入中…</p>
        ) : connectors.length === 0 ? (
          <p className="card-sub">尚無 connector。先為此客戶加 Gemini / Hunter 的 BYO free key 名稱。</p>
        ) : (
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>
            {connectors.map((c) => (
              <li key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span>
                  <strong>{c.connector_name}</strong>
                  <span className="card-sub"> · {c.connector_type}</span>
                  <span className={`card-badge ${c.is_enabled ? "badge-green" : "badge-gray"}`} style={{ marginLeft: 8 }}>
                    {c.is_enabled ? "enabled" : "disabled"}
                  </span>
                  {c.credentials_ref ? <span className="card-sub"> · ref: {c.credentials_ref}</span> : <span className="card-sub"> · 無 ref</span>}
                </span>
                <span style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn-secondary" onClick={() => void toggle(c)}>
                    {c.is_enabled ? "停用" : "啟用"}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => void remove(c.id)}>
                    移除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-label">Free-Plan Router — fallback ladders</span>
        </div>
        <p className="card-sub">成本優先：每個需求由上往下選第一個「可用」的步驟；free / manual 永遠墊底，需求不會完全卡死。</p>
        {NEEDS.map((need) => (
          <div key={need} style={{ marginTop: 8 }}>
            <div className="section-title">{NEED_LABEL[need]}</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {LADDERS[need].map((s) => (
                <li key={s.provider} className="card-sub">
                  <strong>{s.provider}</strong>（{s.kind}）— {s.note}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
