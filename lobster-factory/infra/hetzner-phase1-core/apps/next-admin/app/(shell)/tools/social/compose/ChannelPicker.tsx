"use client";
// 發到: the composer's left column (mock .chan / #pickList). One row per account, scrolls, the search narrows it; a
// channel that cannot send (authorisation expired) or that already went out stays as it is.
import { useState } from "react";
import { PfMark } from "../Calendar";
import { platformOf, type Account } from "../model";
import CIcon from "./icons";

export default function ChannelPicker({ accounts, picked, locked, readOnly, onToggle }: {
  accounts: Account[]; picked: string[]; locked: ReadonlySet<string>; readOnly: boolean; onToggle: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const rows = accounts.filter((a) => !q.trim() || `${a.label} ${a.handle ?? ""} ${platformOf(a.platform).name}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="sm-cchan" aria-label="發到">
      <div className="sm-ptop"><h2>發到 <span className="sm-muted">已選 {picked.length}</span></h2></div>
      <label className="sm-find"><CIcon name="search" /><input type="search" placeholder="找頻道" aria-label="找頻道" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="sm-clist">
        {!accounts.length && <p className="sm-muted">這個品牌還沒有連接社群帳號，先到「設定」連接。</p>}
        {accounts.length > 0 && !rows.length && <p className="sm-muted">找不到「{q.trim()}」。</p>}
        {rows.map((a) => {
          const on = picked.includes(a.id);
          const ok = a.status === "connected";
          const why = !ok ? "授權過期，到設定重新連接" : locked.has(a.id) ? "這個頻道已經送出，不能拿掉" : "";
          return (
            <label key={a.id} className={`sm-pick${on ? " sm-on" : ""}${ok ? "" : " sm-off"}`} title={why}>
              <input type="checkbox" checked={on} disabled={readOnly || locked.has(a.id) || (!ok && !on)} onChange={() => onToggle(a.id)} />
              <span className="sm-aav">
                {a.picture ? <img className="sm-av" src={a.picture} alt="" /> : <span className="sm-av">{(a.label || "?").slice(0, 1)}</span>}
                <PfMark platform={a.platform} />
              </span>
              <span className="sm-nm"><b>{a.label}</b><span className={ok ? "" : "sm-err"}>{ok ? `${platformOf(a.platform).name} · ${a.handle || a.label}` : "授權過期"}</span></span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
