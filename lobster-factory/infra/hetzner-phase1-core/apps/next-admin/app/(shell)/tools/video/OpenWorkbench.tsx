"use client";
// The old staff video entries (/tools/video, /tools/script-forge) now only open the video workbench (plan U11 commit 1).
// The same click carries this browser's ScriptForge history to the video host (lib/video/script-history.ts).
import { useEffect, useRef, useState } from "react";
import { HANDOFF_CHANNEL, fromHandoff, readScriptHistory } from "@/lib/video/script-history";

export default function OpenWorkbench({ videoHost, open }: { videoHost: string; open: string | null }) {
  const opened = useRef<Window | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const m = fromHandoff(event, { window: opened.current, videoHost });
      if (m?.type === "ready") opened.current!.postMessage({ channel: HANDOFF_CHANNEL, type: "history", items: readScriptHistory(window.localStorage) }, event.origin);
      if (m?.type === "saved") setNote(m.added ? `已在新分頁開啟；這台瀏覽器的腳本歷史帶過去 ${m.added} 筆。` : "已在新分頁開啟。");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [videoHost]);
  function start() {
    const w = window.open(`https://${videoHost}/handoff${open ? `?open=${encodeURIComponent(open)}` : ""}`, "_blank");
    if (!w) { setNote("瀏覽器擋下了新分頁。請允許這個網站開新分頁，再按一次。"); return; }
    opened.current = w;
    setNote("已在新分頁開啟。");
  }
  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
        影片製作已搬到影音工作台：寫腳本、做片、審片與發布都在那裡，會開在新分頁。這台瀏覽器裡舊腳本工具的歷史紀錄會一起帶過去。
      </p>
      <button type="button" className="btn-primary" onClick={start}>開啟影音工作台</button>
      {note && <p role="status" style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>{note}</p>}
    </div>
  );
}
