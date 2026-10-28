"use client";
// 文章的日期與發布（AUTO_CONTENT P9.6; was the content calendar's edit box). A topic's article keeps its date in the topic
// (B12): the only move is the topic's own schedule action, never WordPress, and it has no publish-now or trash here.
import { useState } from "react";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/content/wp-calendar";
import { useDoorHref } from "@/app/DoorContext";
import { zoned } from "./model";
import type { WpPost } from "./api";

const TAIPEI = "Asia/Taipei";

async function send(url: string, method: "PATCH" | "DELETE", body: unknown): Promise<void> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) throw new Error(data.error ?? `失敗（${res.status}）`);
}

export default function ArticleSchedule({ article, onChanged }: { article: WpPost; onChanged: () => Promise<void> }) {
  const topic = article.topic;
  const topicsHref = useDoorHref("/tools/content/topics");
  const [value, setValue] = useState(() => {
    if (!topic?.scheduledFor) return toDatetimeLocal(article.date);
    const z = zoned(topic.scheduledFor, TAIPEI);
    return `${z.date}T${z.time}`;
  });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"publish" | "delete" | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      setConfirm(null);
      setNote({ text: `${label}了。` });
      await onChanged();
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(false);
    }
  }

  const saveTopicDate = () => run("日期改好", () => {
    const [date, time] = value.split("T");
    return send(`/api/content/topics/${topic?.id}`, "PATCH", { action: "schedule", version: topic?.version, month: date.slice(0, 7), day: Number(date.slice(8, 10)), hour: Number(time.slice(0, 2)) });
  });
  const saveWpDate = () => run("日期改好", () => send("/api/content/wp-post", "PATCH",
    { siteId: article.siteId, postId: article.id, date: fromDatetimeLocal(value), status: article.status === "draft" ? "future" : article.status }));

  return (
    <div className="sm-src">
      <span className="sm-muted">{topic ? "這篇文章是題目做出來的，日期跟著題目（台灣時間，整點）。" : "文章日期（網站的時間）"}</span>
      <input type="datetime-local" value={value} step={topic ? 3600 : 60} onChange={(e) => setValue(e.target.value)} aria-label="文章日期" />
      <button type="button" disabled={busy || (topic ? !topic.canReschedule : false)} onClick={topic ? saveTopicDate : saveWpDate}>{busy ? "處理中…" : "改日期"}</button>
      {topic && !topic.canReschedule && <span className="sm-muted" style={{ flexBasis: "100%" }}>{topic.status === "scheduled" ? "已經到排定時間，正在發布，日期不能改。" : "已經做好、等審核，日期不能改。"}</span>}
      {topic && topicsHref && <a href={topicsHref}>到題目頁</a>}
      {!topic && article.status !== "publish" && (confirm === "publish"
        ? <button type="button" disabled={busy} onClick={() => run("發布", () => send("/api/content/wp-post", "PATCH", { siteId: article.siteId, postId: article.id, status: "publish" }))}>再按一次：立即發布</button>
        : <button type="button" disabled={busy} onClick={() => setConfirm("publish")}>立即發布</button>)}
      {!topic && (confirm === "delete"
        ? <button type="button" disabled={busy} onClick={() => run("移到垃圾桶", () => send("/api/content/wp-post", "DELETE", { siteId: article.siteId, postId: article.id }))}>再按一次：移到垃圾桶</button>
        : <button type="button" disabled={busy} onClick={() => setConfirm("delete")}>移到垃圾桶</button>)}
      {note && <span className={note.error ? "sm-err" : "sm-muted"} style={{ flexBasis: "100%" }}>{note.text}</span>}
    </div>
  );
}
