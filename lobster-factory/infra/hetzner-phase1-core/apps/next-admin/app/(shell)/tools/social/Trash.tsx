"use client";
// 已刪除貼文 (its own tab; mock v16 renderTrash; GAP_REPORT S5, F22): when it was due, what, where to, the state it was in,
// when it was deleted and WHO (the newest `delete` row of the audit log, GET /api/social/posts?trash=1 deletions).
import { useState } from "react";
import EmptyState from "./EmptyState";
import { PfMark, platformsOf, stateStyle, titleOf } from "./Calendar";
import { who } from "./LogView";
import { shortDate, STATE_NAMES, zoned, type Account, type Post } from "./model";

export type Deletions = Record<string, { actor: string; from: string | null }>;

const when = (iso: string | null, tz: string) => { if (!iso) return ""; const z = zoned(iso, tz); return `${shortDate(z.date)} ${z.time}`; };

/** A binned post that went out (published, or one channel did) stays as the record: no 永久刪除 (state.ts assertCanPurge). */
const wentOut = (p: Post) => !!p.published_at || p.targets.some((t) => t.state === "published" || !!t.release_url);

export default function Trash({ posts, deletions, accounts, tz, canWrite, onRestore, onPurge, onBack }: {
  posts: Post[]; deletions: Deletions; accounts: Account[]; tz: string; canWrite: boolean; onRestore: (post: Post) => void;
  onPurge: (post: Post) => void; onBack: () => void;
}) {
  const [asking, setAsking] = useState<Post | null>(null);   // the post whose 永久刪除 waits for the dialog
  return (
    <section className="sm-panel" aria-label="已刪除貼文">
      <div className="sm-ptop"><h2>已刪除貼文<span className="sm-muted">刪掉的貼文留在這裡，可以還原。</span></h2></div>
      {posts.length ? (
        <div className="sm-list">
          <table>
            <thead><tr><th>排定時間</th><th>內容</th><th>發到</th><th>刪除前</th><th>刪除時間</th><th>誰刪的</th><th /></tr></thead>
            <tbody>
              {posts.map((p) => {
                const d = deletions[p.id];
                const from = d?.from && d.from in STATE_NAMES ? (d.from as keyof typeof STATE_NAMES) : null;
                return (
                  <tr key={p.id}>
                    <td>{p.scheduled_at ? when(p.scheduled_at, tz) : "未排時間"}</td>
                    <td className="sm-wrap">{titleOf(p).slice(0, 120)}</td>
                    <td><span className="sm-avs">{platformsOf(p, accounts).map((pf) => <PfMark key={pf} platform={pf} />)}</span></td>
                    <td>{from ? <span className="sm-pill" style={stateStyle(from)}>{STATE_NAMES[from]}</span> : <span className="sm-muted">不明</span>}</td>
                    <td>{when(p.deleted_at, tz)}</td>
                    <td>{d ? who(d.actor) : <span className="sm-muted">不明</span>}</td>
                    <td>{canWrite && <>
                      <button type="button" onClick={() => onRestore(p)}>還原</button>
                      {wentOut(p) ? <span className="sm-muted" title="發出去過的貼文留作紀錄">　已發佈過</span>
                        : <button type="button" className="sm-danger" onClick={() => setAsking(p)}>永久刪除</button>}
                    </>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon="trash" line="沒有刪掉的貼文" hint="從日曆或清單刪掉的貼文，會留在這裡。" button="回排程日曆" onButton={onBack} />}
      {asking && (
        <div className="sm-dialog-backdrop">
          <div className="sm-dialog" role="dialog" aria-modal="true" aria-labelledby="sm-purge-title">
            <div className="sm-dialog-heading">
              <span className="sm-dialog-icon" aria-hidden="true">!</span>
              <div>
                <h2 id="sm-purge-title">永久刪除，無法還原</h2>
                <p>「{titleOf(asking).slice(0, 60)}」</p>
              </div>
            </div>
            <p className="sm-dialog-warning">這則貼文和它的頻道、留言、標籤、自動回覆規則會一起刪掉；媒體庫的檔案保留。</p>
            <div className="sm-dialog-actions">
              <button type="button" autoFocus onClick={() => setAsking(null)}>取消</button>
              <button type="button" className="sm-danger" onClick={() => { const p = asking; setAsking(null); onPurge(p); }}>永久刪除</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
