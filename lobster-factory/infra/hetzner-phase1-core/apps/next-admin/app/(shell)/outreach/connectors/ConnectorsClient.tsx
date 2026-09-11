'use client';
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LADDERS } from "@/lib/outreach/connectors/router";
import type { ConnectorNeed } from "@/lib/outreach/connectors/types";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";

interface Connector {
  id: string;
  connector_name: string;
  connector_type: string;
  is_enabled: boolean;
  credentials_ref: string | null;
  settings: { email?: string } | null;
  created_at: string;
}

const KNOWN: { name: string; type: string; label: string }[] = [
  { name: "gemini",     type: "ai_generation",      label: "Gemini（AI 生成 · 客戶 BYO）" },
  { name: "hunter",     type: "email_verification", label: "Hunter（Email 驗證 · 客戶 BYO）" },
  { name: "gmail",      type: "email_send",         label: "Gmail（冷信草稿 · 客戶 OAuth）" },
  { name: "fluentsmtp", type: "email_send",         label: "FluentSMTP（暖信 · 客戶自有）" },
  { name: "brevo",      type: "email_send",         label: "Brevo（暖信 fallback free 300/日）" },
  { name: "apify",      type: "lead_scraping",      label: "Apify（抓資料 · 客戶 BYO · Phase 3）" },
  { name: "snov",       type: "email_verification", label: "Snov（Email 查找 · Phase 3）" },
];

const API = "/api/outreach/connectors";
const SECRET_API = "/api/outreach/connectors/secret";
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState(KNOWN[0].name);
  const [keyingId, setKeyingId] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");

  const org = useActiveOrg();
  const searchParams = useSearchParams();
  const gmailStatus = searchParams.get("gmail"); // set by the OAuth callback redirect
  const gmailDetail = searchParams.get("detail");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(withOrg(API, org));
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "load failed");
      setConnectors(j.connectors as Connector[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const k = KNOWN.find((x) => x.name === pick);
    if (!k) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectorName: k.name, connectorType: k.type, isEnabled: false, organizationId: org }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "save failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(connectorId: string) {
    if (!keyValue.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(SECRET_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectorId, value: keyValue }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "save key failed");
      setKeyingId(null);
      setKeyValue("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearKey(connectorId: string) {
    if (!window.confirm("移除這個 connector 的金鑰（從 vault 刪除）？")) return;
    setErr(null);
    try {
      const r = await fetch(`${SECRET_API}?connectorId=${encodeURIComponent(connectorId)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "clear key failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggle(c: Connector) {
    setErr(null);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: c.id, connectorName: c.connector_name, connectorType: c.connector_type, isEnabled: !c.is_enabled }),
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
      {gmailStatus === "connected" && <div className="card-badge badge-green">已連接 Gmail：{gmailDetail}</div>}
      {gmailStatus === "error" && <div className="card-badge badge-red" role="alert">Gmail 連接失敗：{gmailDetail}</div>}

      <form className="card" onSubmit={add} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="card-label">新增 Connector：</span>
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          {KNOWN.map((k) => (
            <option key={k.name} value={k.name}>{k.label}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={busy}>新增</button>
        <span className="card-sub">（先建 connector，再為它「🔑 設定金鑰」→ 金鑰加密存 Supabase Vault，DB 只留指標）</span>
      </form>

      <div className="card">
        <div className="card-header"><span className="card-label">已連接（{connectors.length}）</span></div>
        {loading ? (
          <p className="card-sub">載入中…</p>
        ) : connectors.length === 0 ? (
          <p className="card-sub">尚無 connector。先為此客戶加 Gemini / Hunter，再設定其 BYO free key。</p>
        ) : (
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>
            {connectors.map((c) => (
              <li key={c.id} className="card" style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span>
                    <strong>{c.connector_name}</strong>
                    <span className="card-sub"> · {c.connector_type}</span>
                    <span className={`card-badge ${c.is_enabled ? "badge-green" : "badge-gray"}`} style={{ marginLeft: 8 }}>
                      {c.is_enabled ? "enabled" : "disabled"}
                    </span>
                    {c.connector_name === "gmail" ? (
                      <span className={`card-badge ${c.credentials_ref ? "badge-green" : "badge-gray"}`} style={{ marginLeft: 4 }}>
                        {c.credentials_ref ? `✅ 已連接 ${c.settings?.email ?? ""}` : "未連接"}
                      </span>
                    ) : (
                      <span className={`card-badge ${c.credentials_ref ? "badge-green" : "badge-gray"}`} style={{ marginLeft: 4 }}>
                        {c.credentials_ref ? "🔑 已設金鑰" : "未設金鑰"}
                      </span>
                    )}
                  </span>
                  <span style={{ display: "flex", gap: 8 }}>
                    {c.connector_name === "gmail" ? (
                      <a className="btn-secondary" href={`/api/outreach/connectors/gmail/authorize?connectorId=${encodeURIComponent(c.id)}`}>
                        {c.credentials_ref ? "🔗 重新連接" : "🔗 連接 Google 帳號"}
                      </a>
                    ) : (
                      <>
                        <button type="button" className="btn-secondary" onClick={() => { setKeyingId(keyingId === c.id ? null : c.id); setKeyValue(""); }}>
                          🔑 設定金鑰
                        </button>
                        {c.credentials_ref && (
                          <button type="button" className="btn-secondary" onClick={() => void clearKey(c.id)}>清除金鑰</button>
                        )}
                      </>
                    )}
                    <button type="button" className="btn-secondary" onClick={() => void toggle(c)}>{c.is_enabled ? "停用" : "啟用"}</button>
                    <button type="button" className="btn-secondary" onClick={() => void remove(c.id)}>移除</button>
                  </span>
                </div>
                {keyingId === c.id && c.connector_name !== "gmail" && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder="貼上該客戶的真實 API key（加密存 vault，不進 DB）"
                      value={keyValue}
                      onChange={(e) => setKeyValue(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="btn-primary" disabled={busy || !keyValue.trim()} onClick={() => void saveKey(c.id)}>
                      存入 Vault
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-header"><span className="card-label">Free-Plan Router — fallback ladders</span></div>
        <p className="card-sub">成本優先：每個需求由上往下選第一個「可用」步驟；free / manual 永遠墊底，需求不會完全卡死。</p>
        {NEEDS.map((need) => (
          <div key={need} style={{ marginTop: 8 }}>
            <div className="section-title">{NEED_LABEL[need]}</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {LADDERS[need].map((s) => (
                <li key={s.provider} className="card-sub"><strong>{s.provider}</strong>（{s.kind}）— {s.note}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
