"use client";

// While an AI turn of this tab runs (lib/ai-wait.ts): one line, kept in view at the bottom, with how long it has taken.
// A long draft takes about two minutes; without this the page only showed a greyed-out button. A turn of another block or
// case says where its answer goes; a page that came back after its turn started is told when the answer is in.
import React, { useEffect, useState } from "react";
import { useAiWaits, type AiWait } from "../../lib/ai-wait";
import { blockOf } from "../../lib/blocks";

export const SHOW_AFTER_SECONDS = 3;   // a quick answer comes before the line would only flash
export const WRITING = "AI 正在寫，寫好會直接出現在這一頁。";
export const IN_BACKGROUND = "AI 還在寫，寫好會直接出現在這一頁，不用再按一次。先離開也不會中斷，回來就看得到。";
export const READY = "AI 寫好了，重新整理這一頁就看得到。";

export function elapsed(seconds: number): string {
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, "0")} 秒`;
}

const elsewhere = (wait: AiWait, projectId: string | null) =>
  `「${blockOf(wait.block)?.name ?? wait.block}」${wait.projectId === projectId ? "" : "（另一個案子）"}的 AI 還在寫，寫好會留在那一塊。`;

/** ``projectId`` and ``block``: the page it sits on (BlockShell). */
export function AiWaiting({ projectId, block }: { projectId: string | null; block?: string }) {
  const { waits, settled } = useAiWaits();
  const [mounted] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waits.length) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waits.length]);
  const mine = (wait: AiWait) => block !== undefined && wait.block === block && wait.projectId === projectId;
  const here = waits.filter(mine);
  const away = waits.filter((wait) => !mine(wait));
  // the page that asked was left and this one mounted since: only a reload reads what was saved (unless it asked again:
  // joined). Saved before this page mounted = its own load read it.
  const ready = settled.some((wait) => mine(wait) && !wait.joined && wait.since < mounted && (wait.ended ?? 0) > mounted);
  const seconds = here.length ? Math.max(0, Math.floor((now - Math.min(...here.map((wait) => wait.since))) / 1000)) : 0;
  const lines = [
    ...(here.length && seconds >= SHOW_AFTER_SECONDS ? [<p key="here" className="mt0 mb0"><span role="status">{here.some((wait) => wait.background) ? IN_BACKGROUND : WRITING}</span> <span className="sub" aria-hidden="true">已經過了 {elapsed(seconds)}。</span></p>] : []),
    ...away.filter((wait) => now - wait.since >= SHOW_AFTER_SECONDS * 1000).map((wait) => <p key={wait.id} className="mt0 mb0 sub" role="status">{elsewhere(wait, projectId)}</p>),
    ...(ready && !here.length ? [<p key="ready" className="mt0 mb0" role="status">{READY} <button className="btn" type="button" onClick={() => window.location.reload()}>重新整理</button></p>] : []),
  ];
  if (!lines.length) return null;
  return <div className="card aiwait">{lines}</div>;
}
