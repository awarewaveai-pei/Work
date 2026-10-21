"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import MediaView from "./MediaView";
import type { SlotContext } from "../SocialManager";

/** C31: the two library modes from the product brief. The current database stores saved post copy in
 * social_saved_texts; media stays in social_media. A saved text can seed a new post, while selected media can
 * seed or attach to one. This keeps the UI honest until the separate saved-post snapshot table is introduced. */
export default function Library({ ctx }: { ctx: SlotContext }) {
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const [texts, setTexts] = useState<Array<{ id: string; body: string; mediaIds: string[] }> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const canWrite = ctx.brand.role === "owner" || ctx.brand.role === "editor";
  const fromComposer = ctx.canAttach;

  useEffect(() => {
    let live = true;
    api.texts(ctx.brand.id).then((r) => {
      if (!live) return;
      // Keep older API responses/render fixtures usable while the media relation rolls out.
      setTexts(r.texts.map((t) => ({
        ...t,
        mediaIds: Array.isArray(t.mediaIds) ? t.mediaIds.filter((id): id is string => typeof id === "string") : [],
      })));
    }).catch((e) => ctx.say(e instanceof ApiError ? e.message : String(e), true));
    return () => { live = false; };
  }, [ctx.brand.id, ctx.say]);

  function useSelected() {
    const ids = [...selected];
    if (!ids.length) return ctx.say("先選至少一個媒體。", true);
    if (ctx.canAttach) {
      ctx.attachMany(ids);
      ctx.say(`已附上 ${ids.length} 個媒體。`);
    } else {
      ctx.select({ kind: "new", key: Date.now(), mediaIds: ids });
    }
    setSelected(new Set());
  }

  return (
    <div className="sm-side">
      <div className="sm-row sm-chips">
        <div className="sm-seg" role="group" aria-label="素材庫分類">
          <button type="button" className={tab === "posts" ? "sm-on" : ""} aria-pressed={tab === "posts"} onClick={() => setTab("posts")}>存起來的貼文</button>
          <button type="button" className={tab === "media" ? "sm-on" : ""} aria-pressed={tab === "media"} onClick={() => setTab("media")}>圖片和影片</button>
        </div>
        {tab === "media" && !fromComposer && <button type="button" disabled={!canWrite || !selected.size} onClick={useSelected}>用這些寫新貼文（{selected.size}）</button>}
      </div>
      {tab === "posts" ? (
        <>
          <span className="sm-muted">目前保存貼文文字與媒體順序；頻道、留言、標籤和排程不會一併保存。</span>
          <div className="sm-media-grid">
            {(texts ?? []).map((t) => <button type="button" key={t.id} className="sm-sec" disabled={!canWrite} onClick={() => ctx.select({ kind: "new", key: Date.now(), body: t.body, mediaIds: t.mediaIds })}>
              <b>貼文素材</b><span>{t.body}</span><span className="sm-muted">{t.mediaIds.length ? `含 ${t.mediaIds.length} 個媒體 · ` : ""}用這段寫新貼文</span>
            </button>)}
            {texts && !texts.length && <span className="sm-muted">還沒有存起來的貼文文字。</span>}
            {!texts && <span className="sm-muted">載入中…</span>}
          </div>
        </>
      ) : (
        <>
          <span className="sm-muted">點選多個圖片或影片，再一次帶入新貼文；目前編輯貼文時也可直接附加。</span>
          <MediaView ctx={ctx} selected={fromComposer ? undefined : selected} onToggle={fromComposer ? undefined : (id) => setSelected((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; })} />
        </>
      )}
    </div>
  );
}
