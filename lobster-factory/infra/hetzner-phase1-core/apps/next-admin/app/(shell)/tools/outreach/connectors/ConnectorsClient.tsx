'use client';
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LADDERS } from "@/lib/outreach/connectors/router";
import type { ConnectorNeed } from "@/lib/outreach/connectors/types";
import { useActiveOrg, withOrg } from "@/lib/outreach/use-active-org";
import SendersCard from "./SendersCard";

interface Connector {
  id: string;
  connector_name: string;
  connector_type: string;
  is_enabled: boolean;
  credentials_ref: string | null;
  settings: { email?: string; gmail_sync?: { last_ok_at?: string } } | null;
  organization_id: string | null;
  organizations?: { name: string | null } | null;
  created_at: string;
}
interface AgencyConnector { connector_name: string; connector_type: string; is_enabled: boolean; has_key: boolean }
interface Builtin { name: string; configured: boolean }

const BUILTIN_LABEL: Record<string, string> = {
  openai: "OpenAI 平台金鑰（產信、事實核對；公司沒設自己的 AI 金鑰時用）",
  serper: "Serper（Google 搜尋：找名單、查社群頁）",
  google_oauth: "Google OAuth 用戶端（連 Gmail 用）",
};
const labelOf = (name: string): string => KNOWN.find((k) => k.name === name)?.label ?? name;
const taipei = (iso: string): string => new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });

// Every name a runtime reader looks up in co_connector_accounts (generate.ts AI_PROVIDERS, mailbox-verify.ts
// PAID_PROVIDERS, draft.ts gmail): one missing here can be used but never added from this page.
const KNOWN: { name: string; type: string; label: string }[] = [
  { name: "claude",     type: "ai_generation",      label: "Claude（AI 生成 · 第 1 順位）" },
  { name: "openai",     type: "ai_generation",      label: "OpenAI（AI 生成 · 第 2 順位）" },
  { name: "gemini",     type: "ai_generation",      label: "Gemini（客戶自己的額度 · 研究、查證、寫信、回信分類都用 · 客戶 BYO）" },
  { name: "gemini_agency", type: "ai_generation",   label: "Gemini 代理商額度（AI 生成 · 最後順位）" },
  { name: "hunter",     type: "email_verification", label: "Hunter（Email 驗證 · 每月免費 50 點 · 客戶 BYO）" },
  { name: "zerobounce", type: "email_verification", label: "ZeroBounce（Email 驗證 · 每月免費 100 筆 · 客戶 BYO）" },
  { name: "reoon",      type: "email_verification", label: "Reoon（Email 驗證 · 每天免費 20 筆 · 客戶 BYO）" },
  { name: "gmail",      type: "email_send",         label: "Gmail（冷信草稿 · 客戶 OAuth）" },
  { name: "fluentsmtp", type: "email_send",         label: "FluentSMTP（暖信 · 客戶自有）" },
  { name: "brevo",      type: "email_send",         label: "Brevo（暖信 fallback free 300/日）" },
  { name: "apify",      type: "lead_scraping",      label: "Apify（抓資料 · 客戶 BYO · Phase 3）" },
  { name: "snov",       type: "email_verification", label: "Snov（Email 查找 · Phase 3）" },
];

const API = "/api/outreach/connectors";
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
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
  const [agency, setAgency] = useState<AgencyConnector[]>([]);
  const [builtin, setBuiltin] = useState<Builtin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState(KNOWN[0].name);
  const [keyingId, setKeyingId] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [poolId, setPoolId] = useState<string | null>(null);   // the gmail connector being connected as a pool mailbox
  const [poolEmail, setPoolEmail] = useState("");

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
      setAgency((j.agency ?? []) as AgencyConnector[]);
      setBuiltin((j.builtin ?? []) as Builtin[]);
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

      <form className="card" onSubmit={add} style={{ display: "grid", gap: 8 }}>
        <span className="card-label">新增 Connector：先選一個，再按「新增」</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="radiogroup" aria-label="要新增的 connector">
          {KNOWN.map((k) => (
            <button key={k.name} type="button" role="radio" aria-checked={pick === k.name}
              className={pick === k.name ? "btn-primary" : "btn-secondary"} onClick={() => setPick(k.name)}>
              {k.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" className="btn-primary" disabled={busy}>新增</button>
          <span className="card-sub">先建 connector，再按「🔑 設定金鑰」。金鑰加密存在 Supabase Vault，資料庫只留指標。</span>
        </div>
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
                    <strong>{labelOf(c.connector_name)}</strong>
                    <span className="card-sub"> · {c.organization_id ? (c.organizations?.name ?? "某家公司") : "代理商共用"}</span>
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
                      <>
                        <a className="btn-secondary" href={`/api/outreach/connectors/gmail/authorize?connectorId=${encodeURIComponent(c.id)}`}>
                          {c.credentials_ref ? "🔗 重新連接" : "🔗 連接 Google 帳號"}
                        </a>
                        <button type="button" className="btn-secondary" onClick={() => { setPoolId(poolId === c.id ? null : c.id); setPoolEmail(""); }}>
                          📮 連為寄件池信箱
                        </button>
                      </>
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
                {c.connector_name === "gmail" && c.credentials_ref && (
                  <p className="card-sub">上次同步成功：{c.settings?.gmail_sync?.last_ok_at ? taipei(c.settings.gmail_sync.last_ok_at) : "還沒同步過"}</p>
                )}
                {poolId === c.id && c.connector_name === "gmail" && (
                  <div style={{ display: "grid", gap: 6 }}>
                    <p className="card-sub">此信箱屬於寄件池：系統自動寄出、每日上限 50，暖機從每天 10 封開始。輸入要連的信箱確認，Google 登入的帳號必須是這個地址。</p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="email" placeholder="例：hello@mail.yourbrand.com" value={poolEmail} aria-label="寄件池信箱地址"
                        onChange={(e) => setPoolEmail(e.target.value)} style={{ flex: 1 }} />
                      <a className="btn-primary" aria-disabled={!EMAIL_SHAPE.test(poolEmail.trim())}
                        style={EMAIL_SHAPE.test(poolEmail.trim()) ? undefined : { pointerEvents: "none", opacity: 0.5 }}
                        href={`/api/outreach/connectors/gmail/authorize?connectorId=${encodeURIComponent(c.id)}&pool=1&poolEmail=${encodeURIComponent(poolEmail.trim())}`}>
                        確認並連接
                      </a>
                    </div>
                  </div>
                )}
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

      {org && agency.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-label">代理商共用（{agency.length}）</span></div>
          <p className="card-sub">這家公司自己沒設某項時，系統改用這一組；費用記在這家公司的點數。</p>
            <ul style={{ display: "grid", gap: 6, listStyle: "none", padding: 0 }}>
              {agency.map((a) => (
                <li key={`${a.connector_name}-${a.connector_type}`}>
                  <strong>{labelOf(a.connector_name)}</strong>
                  <span className={`card-badge ${a.is_enabled ? "badge-green" : "badge-gray"}`} style={{ marginLeft: 8 }}>{a.is_enabled ? "啟用" : "停用"}</span>
                  <span className={`card-badge ${a.has_key ? "badge-green" : "badge-gray"}`} style={{ marginLeft: 4 }}>{a.has_key ? "🔑 已設金鑰" : "未設金鑰"}</span>
                  {connectors.some((c) => c.connector_name === a.connector_name && c.is_enabled && c.credentials_ref)
                    && <span className="card-sub">（這家公司有自己的，優先用自己的）</span>}
                </li>
              ))}
            </ul>
        </div>
      )}

      {builtin.length > 0 && <div className="card">
        <div className="card-header"><span className="card-label">系統內建（{builtin.length}）</span></div>
        <p className="card-sub">設在主機環境變數，所有公司共用；這裡只顯示有沒有設定，不顯示金鑰。</p>
        <ul style={{ display: "grid", gap: 6, listStyle: "none", padding: 0 }}>
          {builtin.map((b) => (
            <li key={b.name}>
              <strong>{BUILTIN_LABEL[b.name] ?? b.name}</strong>
              <span className={`card-badge ${b.configured ? "badge-green" : "badge-red"}`} style={{ marginLeft: 8 }}>{b.configured ? "已設定" : "未設定"}</span>
            </li>
          ))}
        </ul>
      </div>}

      <SendersCard org={org} />

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
