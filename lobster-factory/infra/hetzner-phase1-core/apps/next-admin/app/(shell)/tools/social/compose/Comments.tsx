"use client";
// 留言 (mock #parts): comments the account leaves under its own post, on every platform (operator 2026-10-18: Bluesky
// and Threads too -- a comment, never the next post). Each has its own box, an image, emoji, when to post it, order.
import { BODY_LIMITS, bodyLength } from "@/lib/social/limits";
import { PfMark } from "../Calendar";
import type { Account } from "../model";
import { delayText, nextDelay, type CommentDraft } from "./draft";
import CIcon from "./icons";

export default function Comments({ comments, channels, editable, mediaPath, onChange, onAdd, onPickImage }: {
  comments: CommentDraft[]; channels: Account[]; editable: boolean; mediaPath: (id: string) => string | null;
  onChange: (next: CommentDraft[]) => void; onAdd: () => void; onPickImage: (key: number) => void;
}) {
  const set = (key: number, patch: Partial<CommentDraft>) => onChange(comments.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const move = (i: number, j: number) => { const n = [...comments]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  // the tightest limit among the channels: a comment has its platform's post limit (lib/social/limits.ts)
  const limited = channels.filter((a) => BODY_LIMITS[a.platform]);
  const tight = limited.reduce<Account | null>((m, a) => (!m || BODY_LIMITS[a.platform] < BODY_LIMITS[m.platform] ? a : m), null);
  return (
    <div className="sm-parts">
      {comments.map((c, i) => {
        const n = tight ? bodyLength(tight.platform, c.body) : 0;
        const path = c.media_id ? mediaPath(c.media_id) : null;
        return (
          <div className="sm-part" key={c.key}>
            <div className="sm-pbox">
              <textarea rows={2} aria-label={`第 ${i + 1} 則留言`} placeholder={`第 ${i + 1} 則留言`} value={c.body} readOnly={!editable} onChange={(e) => set(c.key, { body: e.target.value })} />
              {c.media_id && (
                <div className="sm-mrow"><span className="sm-mt">{path ? <img src={path} alt="" /> : <span>圖</span>}
                  {editable && <button type="button" className="sm-x" aria-label={`拿掉第 ${i + 1} 則留言的圖`} onClick={() => set(c.key, { media_id: null })}><CIcon name="x" /></button>}</span></div>
              )}
              <div className="sm-tools">
                <button type="button" className="sm-ibtn" title="加一張圖" aria-label={`第 ${i + 1} 則留言加圖`} disabled={!editable} onClick={() => onPickImage(c.key)}><CIcon name="image" /></button>
                <button type="button" className="sm-ibtn" title="加表情" aria-label={`第 ${i + 1} 則留言加表情`} disabled={!editable} onClick={() => set(c.key, { body: `${c.body}🙂` })}><CIcon name="smile" /></button>
                <span className="sm-muted">{delayText(c.delay, i === 0)}</span>
                {tight && <span className={`sm-cnt${n > BODY_LIMITS[tight.platform] ? " sm-over" : ""}`}><PfMark platform={tight.platform} /> {n}／{BODY_LIMITS[tight.platform].toLocaleString()}</span>}
              </div>
            </div>
            {editable && (
              <div className="sm-pside">
                <button type="button" className="sm-ibtn" aria-label={`第 ${i + 1} 則往上`} disabled={i === 0} onClick={() => move(i, i - 1)}><CIcon name="up" /></button>
                <button type="button" className="sm-ibtn" aria-label={`第 ${i + 1} 則往下`} disabled={i === comments.length - 1} onClick={() => move(i, i + 1)}><CIcon name="down" /></button>
                <button type="button" className="sm-ibtn" aria-label={`刪掉第 ${i + 1} 則留言`} onClick={() => onChange(comments.filter((x) => x.key !== c.key))}><CIcon name="trash" /></button>
                <button type="button" className={`sm-ibtn${c.delay ? " sm-act" : ""}`} aria-label={`第 ${i + 1} 則什麼時候留`} title={`${delayText(c.delay, i === 0)}（點一下換）`}
                  onClick={() => set(c.key, { delay: nextDelay(c.delay) })}><CIcon name="clock" /></button>
              </div>
            )}
          </div>
        );
      })}
      {editable && (
        <div className="sm-addpart">
          <button type="button" onClick={onAdd}><CIcon name="plus" />新增留言</button>
          <span className="sm-muted">貼文發出後，用你的帳號在下面留言。</span>
        </div>
      )}
    </div>
  );
}
