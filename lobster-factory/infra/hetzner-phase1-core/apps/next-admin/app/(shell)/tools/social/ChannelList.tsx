"use client";
// The channel list (ADR 016 §5 decision 1; mock: #chanPanel). One row per connected account, so a brand run for others
// can hold 100; it scrolls, the search narrows it. A click shows only that channel's posts (again = all); ⋮ = its menu.
import { useState } from "react";
import { PfMark } from "./Calendar";
import Icon from "./Icon";
import { platformOf, type Account } from "./model";

/** handle: null = not looked up yet, "" = the platform has none (0105); then the label is the line under the name */
const lineOf = (a: Account) => a.status === "expired" ? "授權已過期，請按 ⋮ 選擇「重新連接」。"
  : `${platformOf(a.platform).name} · ${a.handle || a.label}`;

export default function ChannelList({ accounts, only, canWrite, onToggle, onOnly, onWrite, onSettings, onRemove, onCloseMobile }: {
  accounts: Account[]; only: Set<string>; canWrite: boolean;
  onToggle: (id: string) => void; onOnly: (id: string) => void; onWrite: (id: string) => void; onSettings: () => void;
  onRemove: (a: Account) => Promise<void>; onCloseMobile?: () => void;
}) {
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);
  const rows = accounts.filter((a) => !q.trim() || `${a.label} ${a.handle ?? ""} ${platformOf(a.platform).name}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="sm-panel sm-chan" aria-label="頻道">
      <div className="sm-ptop">
        <h2>頻道 {accounts.length > 0 && <span className="sm-muted">{accounts.length} 個</span>}</h2>
        {onCloseMobile && <button type="button" className="sm-mobile-close sm-r" onClick={onCloseMobile}>關閉</button>}
        {canWrite && <button type="button" className="sm-r" onClick={onSettings}><Icon name="plus" />加頻道</button>}
      </div>
      <label className="sm-find"><Icon name="search" /><input type="search" placeholder="找頻道" aria-label="找頻道" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="sm-clist">
        {rows.map((a) => (
          <div key={a.id} className={`sm-crow${only.has(a.id) ? " sm-on" : ""}`}>
            <button type="button" className="sm-cmain" aria-pressed={only.has(a.id)} title={only.has(a.id) ? "再按一下，看全部頻道" : "只看這個頻道的貼文"} onClick={() => onToggle(a.id)}>
              <span className="sm-aav">
                {a.picture ? <img className="sm-av" src={a.picture} alt="" /> : <span className="sm-av">{(a.label || "?").slice(0, 1)}</span>}
                <PfMark platform={a.platform} />
              </span>
              <span className="sm-nm" title={`${a.label}\n${lineOf(a)}`}><b>{a.label}</b><span className={a.status === "expired" ? "sm-err" : ""}>{lineOf(a)}</span></span>
            </button>
            <button type="button" className="sm-ibtn" aria-label={`${a.label} 的選單`} aria-expanded={menu === a.id} onClick={() => setMenu((m) => (m === a.id ? null : a.id))}><Icon name="vdots" /></button>
            {menu === a.id && (
              <div className="sm-pop sm-menu sm-cmenu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenu(null); onOnly(a.id); }}>只看這個頻道</button>
                {canWrite && <button type="button" role="menuitem" onClick={() => { setMenu(null); onWrite(a.id); }}>用這個頻道寫貼文</button>}
                <button type="button" role="menuitem" onClick={() => { setMenu(null); onSettings(); }}>{a.status === "expired" ? "重新連接" : "偏好設定"}</button>
                {canWrite && <button type="button" role="menuitem" onClick={() => { setMenu(null); setRemoving(a); }}>移除頻道</button>}
              </div>
            )}
          </div>
        ))}
        {!rows.length && (accounts.length
          ? <p className="sm-muted">找不到「{q.trim()}」。</p>
          : <p className="sm-muted">還沒有頻道。連接社群帳號後，會列在這裡。</p>)}
      </div>
      {removing ? (
        <div className="sm-confirm sm-cfoot" role="alert">
          <span>要移除「{removing.label}」嗎？每日歷史數據將一併刪除，無法復原。</span>
          <span className="sm-row">
            <button type="button" className="sm-danger" onClick={async () => { const a = removing; setRemoving(null); await onRemove(a); }}>確定移除</button>
            <button type="button" onClick={() => setRemoving(null)}>取消</button>
          </span>
        </div>
      ) : (
        <div className="sm-cfoot sm-muted">{only.size ? `目前顯示 ${only.size} 個頻道的貼文。` : accounts.length ? "點選頻道，日曆只顯示該頻道的貼文。" : ""}</div>
      )}
    </section>
  );
}
