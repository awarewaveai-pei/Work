"use client";
// The old staff video entries (/tools/video, /tools/script-forge) now only open the video workbench (plan U11 commit 1).
// The same click carries this browser's ScriptForge history to the video host (lib/video/script-history.ts).
// Card K11 (ADR 020 §2.4): the page registers the org layer, so the client rail shows; the workbench opens on the
// client picked there (?org= on the handoff link). No client picked = the workbench keeps its own (VW has no "none").
import { useEffect, useRef, useState } from "react";
import { HANDOFF_CHANNEL, fromHandoff, readScriptHistory } from "@/lib/video/script-history";
import { withContext } from "@/lib/client-context/contract";
import { useClientContext } from "@/lib/client-context/use-client-context";

/** TEMPORARY until card K12 (agency-os/handoffs/2026-11-22-platform-membership-ux/DISPATCH.md, row K12): the workbench
 *  ignores ?org= until its shell reads it, so a picked client is NOT applied there yet and the page must say so.
 *  Remove this constant and the note it gates when K12 ships (VW scripts/index-1.js + organization-picker.js). */
export const VW_IGNORES_ORG_UNTIL_K12 = true;

export default function OpenWorkbench({ videoHost, open }: { videoHost: string; open: string | null }) {
  const ctx = useClientContext("org");
  // A client account's workbench is always its own (session/route.ts ignores the cookie for clients): nothing to carry.
  const org = ctx.viewer === "staff" ? ctx.org : null;
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
    const href = withContext(`https://${videoHost}/handoff${open ? `?open=${encodeURIComponent(open)}` : ""}`, { org });
    const w = window.open(href, "_blank");
    if (!w) { setNote("瀏覽器擋下了新分頁。請允許這個網站開新分頁，再按一次。"); return; }
    opened.current = w;
    setNote("已在新分頁開啟。");
  }
  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
        影片製作已搬到影片工作台：寫腳本、做片、審片與發布都在那裡，會開在新分頁。這台瀏覽器裡舊腳本工具的歷史紀錄會一起帶過去。
      </p>
      {ctx.viewer === "staff" && !org && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          還沒在左邊客戶欄選客戶：工作台會用它目前的客戶，可在工作台頂部切換。
        </p>
      )}
      {VW_IGNORES_ORG_UNTIL_K12 && org && (
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 16 }}>
          工作台目前不會自動切到這個客戶，請在工作台頂部確認客戶。
        </p>
      )}
      <button type="button" className="btn-primary" onClick={start}>開啟影片工作台</button>
      {note && <p role="status" style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>{note}</p>}
    </div>
  );
}
