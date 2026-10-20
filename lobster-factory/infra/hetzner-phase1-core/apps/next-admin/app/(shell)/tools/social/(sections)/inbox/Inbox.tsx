"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import EmptyState from "../../EmptyState";
import Icon from "../../Icon";
import { api, type InboxData, type InboxRow } from "../../api";
import { platformOf } from "../../model";
import type { SlotContext } from "../../SocialManager";

const STATUS_TEXT: Record<InboxRow["status"], string> = {
  unlinked: "尚未對應 Chatwoot 收件匣",
  not_configured: "尚未設定 Chatwoot 讀取權限",
  unavailable: "Chatwoot 暫時讀不到",
  ok: "",
};

function Avatar({ row }: { row: InboxRow }) {
  return row.picture ? <img className="sm-av" src={row.picture} alt="" /> : <span className="sm-av">{row.label.slice(0, 1) || "?"}</span>;
}

export default function Inbox({ ctx }: { ctx: SlotContext }) {
  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);
  const load = useCallback(() => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    api.inbox(ctx.brand.id)
      .then((next) => { if (requestRef.current === requestId) setData(next); })
      .catch((e) => { if (requestRef.current === requestId) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (requestRef.current === requestId) setLoading(false); });
  }, [ctx.brand.id]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (!data && loading) return <section className="sm-panel" aria-label="訊息收件匣"><div className="sm-ptop"><h2>訊息收件匣</h2></div><p className="sm-muted">讀取 Chatwoot 未讀數…</p></section>;
  if (error && !data) return <section className="sm-panel" aria-label="訊息收件匣"><div className="sm-ptop"><h2>訊息收件匣</h2></div><p className="sm-err" role="alert">讀不到收件匣：{error}</p><button type="button" className="btn-secondary" onClick={load}>重試</button></section>;
  if (!data?.inboxes.length) return <section className="sm-panel" aria-label="訊息收件匣"><div className="sm-ptop"><h2>訊息收件匣</h2></div><EmptyState icon="inbox" line="還沒有連接社群頻道" hint="連接 Facebook 或 Instagram 後，這裡會顯示 Chatwoot 未讀數。" button="到設定連接帳號" onButton={() => ctx.setView("settings")} /></section>;

  const total = data.inboxes.reduce((sum, row) => sum + row.unread, 0);
  return <section className="sm-panel" aria-label="訊息收件匣">
    <div className="sm-ptop">
      <div><h2>訊息收件匣</h2><span className="sm-muted">{total ? `${total.toLocaleString()} 則未讀` : "目前沒有未讀訊息"}</span></div>
      <button type="button" className="btn-secondary" onClick={load} disabled={loading}>{loading ? "更新中…" : "重新整理"}</button>
    </div>
    <div className="sm-list">
      {data.inboxes.map((row) => <div className="sm-row" key={row.accountId}>
        <div className="sm-r"><Avatar row={row} /><div><b>{row.label}</b><div className="sm-muted">{platformOf(row.platform).name}{row.handle ? ` · ${row.handle}` : ""}</div></div></div>
        <div className="sm-r">
          {row.status === "ok" ? <span className="sm-pill" style={{ background: row.unread ? "var(--bg-subtle)" : "var(--accent-light)", color: row.unread ? "var(--severity-high)" : "var(--green)" } as CSSProperties}>{row.unread ? `${row.unread} 則未讀` : "都讀了"}</span> : <span className="sm-muted">{STATUS_TEXT[row.status]}</span>}
          {row.chatwootUrl && <a className="btn-secondary" href={row.chatwootUrl} target="_blank" rel="noreferrer"><Icon name="inbox" />打開 Chatwoot</a>}
        </div>
      </div>)}
    </div>
  </section>;
}
