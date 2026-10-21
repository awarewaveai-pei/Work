"use client";
// 文章 → 社群貼文 (SOCIAL_MANAGER_PLAN.md C10; mock: #srcBox). Two ways to start the post: the article's own excerpt,
// featured image and link (free), or an AI rewrite per channel through /api/social/rewrite (cost on the button,
// lib/social/wp-article.ts rewriteCostTwd from lib/ai/cost-model.ts). Either one fills the editor; nothing is saved
// until someone presses one of its four buttons.
import { useState } from "react";
import { rewriteCostTwd, syndicatePlatforms, textsFromSyndicate, type WpArticle } from "@/lib/social/wp-article";
import { api, ApiError } from "./api";
import { PfMark } from "./Calendar";
import type { Account, Brand } from "./model";

/** `for` = the article it came from (site:post); the manager hands it only to that article's editor (review 2026-10-15:
 *  a slow answer for article A must not fill article B). */
export interface Prefill { for: string; body: string; link: string; sourceUrl: string; custom: Record<string, string>; mediaIds: string[]; n: number }

export default function ArticleSource({ brand, accounts, siteId, postId, title, onPrefill }: {
  brand: Brand; accounts: Account[]; siteId: string; postId: number; title: string; onPrefill: (p: Omit<Prefill, "n">) => void;
}) {
  const key = `${siteId}:${postId}`;
  const [busy, setBusy] = useState<"excerpt" | "ai" | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const connected = accounts.filter((a) => a.status === "connected");

  async function article(): Promise<WpArticle> {
    return (await api.wpArticle(brand.id, siteId, postId)).article;
  }

  async function image(a: WpArticle): Promise<string[]> {
    if (!a.image) return [];
    try {
      const { media } = await api.upload(brand.id, a.image, a.image.split("/").pop()?.replace(/[^\w.\- ]/g, "_").slice(0, 200) || "featured.jpg");
      return [media.id];
    } catch {
      return [];   // the post still works without the image; the note says so
    }
  }

  async function useExcerpt() {
    setBusy("excerpt");
    setNote(null);
    try {
      const a = await article();
      const mediaIds = await image(a);
      onPrefill({ for: key, body: `${a.excerpt || a.title}\n\n全文：${a.link}`, link: a.link, sourceUrl: a.link, custom: {}, mediaIds });
      setNote({ text: `用的是文章本身的摘要${mediaIds.length ? "和主圖" : "（主圖沒拿到）"}，沒有花錢。` });
    } catch (e) {
      setNote({ text: e instanceof ApiError ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  }

  async function useAi() {
    setBusy("ai");
    setNote(null);
    try {
      const a = await article();
      const platforms = syndicatePlatforms(connected.map((x) => x.platform));
      if (!platforms.length) throw new Error("先連接至少一個社群帳號。");
      const res = await fetch("/api/social/rewrite", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ article: `${a.title}\n\n${a.content || a.excerpt}`, platforms, articleUrl: a.link, mediaType: a.image ? "image" : "text" }),
      });
      if (!res.ok) throw new Error(`AI 改寫失敗（${res.status}）：${(await res.text()).slice(0, 200)}`);
      const json = (await res.json()) as { ok: boolean; posts?: Record<string, string>; error?: string };
      if (!json.ok || !json.posts) throw new Error(json.error ?? "AI 改寫沒有回內容");
      const custom = textsFromSyndicate(json.posts, connected);
      const mediaIds = await image(a);
      onPrefill({ for: key, body: a.excerpt || a.title, link: a.link, sourceUrl: a.link, custom, mediaIds });
      setNote({ text: `AI 替 ${Object.keys(custom).length} 個頻道各寫了一版，看過再存。` });
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sm-src">
      <PfMark platform="wordpress" />
      <span className="sm-ellipsis" style={{ flex: 1, minWidth: 0 }} title={title}>{title}</span>
      <button type="button" disabled={!!busy} onClick={useExcerpt}>{busy === "excerpt" ? "讀取中…" : "用文章摘要"}</button>
      <button type="button" disabled={!!busy} onClick={useAi}>{busy === "ai" ? "改寫中…" : `AI 改寫（約 NT$${rewriteCostTwd()}）`}</button>
      {note && <span className={note.error ? "sm-err" : "sm-muted"} style={{ flexBasis: "100%" }}>{note.text}</span>}
    </div>
  );
}
