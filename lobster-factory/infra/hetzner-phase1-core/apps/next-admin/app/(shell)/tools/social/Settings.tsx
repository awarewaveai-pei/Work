"use client";
// 設定 -> the brand's channels (mock: #settingsView 社群帳號 + #connectDetail). Connecting opens the platform's
// authorisation in a new tab (Postiz's OAuth URL, POST /api/social/accounts); this view then asks GET accounts every
// few seconds, which attaches the new channel to this brand (lib/social/store.ts resolveConnectAttempt). Team and roles
// are C8; the time zone is the organisation's (organizations.default_timezone), shown, not edited here.
import { useCallback, useEffect, useRef, useState } from "react";
import { SENDABLE_PLATFORMS } from "@/lib/social/compose";
import { api, ApiError, type UnclaimedIntegration } from "./api";
import { PfMark } from "./Calendar";
import { platformOf, type Account, type Brand } from "./model";

const POLL_MS = 4000;
const STATUS: Record<Account["status"], string> = { connected: "已連接", expired: "連線失效", disabled: "已停用" };
const STATUS_TOKEN: Record<Account["status"], string> = { connected: "--green", expired: "--red", disabled: "--status-ignored" };
const claimMessage = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.status === 403) return "只有員工可以認領頻道。";
    if (e.status === 404) return "Postiz 已找不到這個頻道，請重新載入清單。";
    if (e.status === 409) return "頻道已綁到其他品牌，請重新載入清單。";
    if (e.status === 502) return "暫時無法讀取 Postiz，請稍後再試。";
  }
  return e instanceof Error ? e.message : String(e);
};
// the ones the sender can send (compose.ts SETTINGS), each once: linkedin-page / instagram-standalone are other ways in
const CONNECTABLE = SENDABLE_PLATFORMS.filter((p) => !["linkedin-page", "instagram-standalone", "mastodon", "telegram"].includes(p));

export default function Settings({ brand, accounts, onAccounts, team }: { brand: Brand; accounts: Account[]; onAccounts: (a: Account[]) => void; team?: React.ReactNode }) {
  const canWrite = brand.role === "owner" || brand.role === "editor";
  const [connecting, setConnecting] = useState<{ id: string; platform: string } | null>(null);
  const [hint, setHint] = useState<{ text: string; error?: boolean } | null>(null);
  const [unclaimed, setUnclaimed] = useState<UnclaimedIntegration[] | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const activeBrand = useRef(brand.id);
  activeBrand.current = brand.id;

  const refresh = useCallback(async () => {
    const brandId = brand.id;
    try {
      const r = await api.accounts(brandId);
      if (activeBrand.current !== brandId) return false;
      onAccounts(r.accounts);
      setConnecting(r.connecting);
      if (r.justConnected) setHint({ text: "帳號已連接。" });
      if (r.connectFailed) setHint({ text: `沒有連上：${r.connectFailed}`, error: true });
      return true;
    } catch (e) {
      if (activeBrand.current === brandId) setHint({ text: e instanceof Error ? e.message : String(e), error: true });
      return false;
    }
  }, [brand.id, onAccounts]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setUnclaimed(null); setClaimBusy(false); }, [brand.id]);
  useEffect(() => {
    if (!connecting) return;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [connecting, refresh]);

  async function connect(platform: string, accountId?: string) {
    setHint(null);
    const tab = window.open("about:blank", "_blank");   // opened on the click itself, or the browser blocks it
    if (tab) tab.opener = null;                           // the platform's page gets no handle on this one
    try {
      const { attemptId, url } = await api.connect(brand.id, platform, accountId);
      if (tab) tab.location.href = url; else window.open(url, "_blank", "noopener");
      setConnecting({ id: attemptId, platform });
      setHint({ text: `在新分頁授權 ${platformOf(platform).name}，選好要管理的帳號。授權完回到這裡，帳號會自己出現。` });
    } catch (e) {
      tab?.close();
      setHint({ text: e instanceof ApiError ? e.message : String(e), error: true });
    }
  }

  async function loadUnclaimed() {
    const brandId = brand.id;
    setClaimBusy(true);
    setHint(null);
    try {
      const { integrations } = await api.unclaimedIntegrations();
      if (activeBrand.current === brandId) setUnclaimed(integrations);
    } catch (e) {
      if (activeBrand.current === brandId) setHint({ text: claimMessage(e), error: true });
    } finally {
      if (activeBrand.current === brandId) setClaimBusy(false);
    }
  }

  async function claim(integrationId: string) {
    const brandId = brand.id;
    setClaimBusy(true);
    setHint(null);
    try {
      await api.claimIntegration(brandId, integrationId);
      if (activeBrand.current !== brandId) return;
      setUnclaimed((current) => current?.filter((i) => i.id !== integrationId) ?? null);
      if (await refresh()) setHint({ text: "頻道已綁到這個品牌。" });
    } catch (e) {
      if (activeBrand.current === brandId) setHint({ text: claimMessage(e), error: true });
    } finally {
      if (activeBrand.current === brandId) setClaimBusy(false);
    }
  }

  return (
    <div className="sm-side">
      <div className="sm-sec">
        <h3>社群帳號</h3>
        {accounts.map((a) => (
          <div className="sm-arow" key={a.id}>
            <PfMark platform={a.platform} />
            <span className="sm-ellipsis">{platformOf(a.platform).name} <small className="sm-muted">{a.label}</small></span>
            <span className="sm-pill" style={{ "--sm-state": `var(${STATUS_TOKEN[a.status]})` } as React.CSSProperties}>{STATUS[a.status]}</span>
            {canWrite && (
              <span className="sm-chips">
                <button type="button" disabled={!!connecting} onClick={() => connect(a.platform, a.id)}>重新連接</button>
                <button type="button" onClick={async () => {
                  try { await api.unlink(brand.id, a.id); await refresh(); } catch (e) { setHint({ text: e instanceof ApiError && e.status === 409 ? "還有貼文要發到這個帳號，先把它們改掉或刪掉。" : String(e), error: true }); }
                }}>移除</button>
              </span>
            )}
          </div>
        ))}
        {accounts.length === 0 && <span className="sm-muted">還沒有帳號。</span>}
        {canWrite && (
          <div className="sm-row sm-chips"><span className="sm-lab">加帳號</span>
            {CONNECTABLE.map((p) => <button type="button" key={p} disabled={!!connecting} onClick={() => connect(p)}>＋ {platformOf(p).name}</button>)}
          </div>
        )}
        {canWrite && (
          <>
            <div className="sm-row sm-chips">
              <button type="button" disabled={claimBusy} onClick={() => void loadUnclaimed()}>認領 Postiz 上的頻道</button>
              <span className="sm-muted">僅限員工操作。</span>
            </div>
            {unclaimed !== null && (unclaimed.length === 0
              ? <span className="sm-muted">目前沒有尚未綁定的頻道。</span>
              : unclaimed.map((i) => (
                <div className="sm-arow" key={i.id}>
                  <PfMark platform={i.identifier} />
                  <span className="sm-ellipsis">{platformOf(i.identifier).name} <small className="sm-muted">{i.name}</small>{i.disabled && <small className="sm-muted"> · 連線失效</small>}</span>
                  <button type="button" disabled={claimBusy} onClick={() => void claim(i.id)}>綁到這個品牌</button>
                </div>
              )))}
          </>
        )}
        {connecting && (
          <div className="sm-row">
            <span className="sm-muted">正在連接 {platformOf(connecting.platform).name}…（同一時間只能連一個，15 分鐘沒完成會自動取消）</span>
            <button type="button" onClick={async () => { try { await api.cancelConnect(brand.id, connecting.id); } finally { await refresh(); } }}>取消</button>
          </div>
        )}
        <span className="sm-muted">授權是平台發給我們的，我們不會拿到你的密碼。還在等平台審核的 app，授權頁會拒絕。</span>
        {hint && <span className={hint.error ? "sm-err" : "sm-muted"}>{hint.text}</span>}
      </div>
      <div className="sm-sec">
        <h3>時區</h3>
        <span>{brand.default_timezone}</span>
        <span className="sm-muted">行事曆和排程時間都用這個時區（客戶資料裡的時區）。</span>
      </div>
      {team}
    </div>
  );
}
