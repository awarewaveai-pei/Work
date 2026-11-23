"use client";
// video.<base>/handoff (plan U11 commit 1): the staff door's 「開啟影音工作台」 opens this window, sends this browser's
// ScriptForge history once it hears "ready", then this page goes on to the workbench. No opener, or nothing within
// a few seconds (staff page closed): go on without it. org (card K11) rides along to the shell: /?open=X&org=Y.
import { useEffect } from "react";
import { withContext } from "@/lib/client-context/contract";
import { HANDOFF_CHANNEL, acceptScriptHistory, storeScriptHistory, workbenchPath } from "@/lib/video/script-history";

const WAIT_MS = 4000;

export default function ScriptHistoryHandoff({ staffHosts, open, org = null }: { staffHosts: string[]; open: string | null; org?: string | null }) {
  useEffect(() => {
    const go = () => window.location.replace(withContext(workbenchPath(open), { org }));
    const opener = window.opener as Window | null;
    if (!opener) { go(); return; }
    const timer = window.setTimeout(go, WAIT_MS);
    const onMessage = (event: MessageEvent) => {
      const items = acceptScriptHistory(event, { staffHosts, opener });
      if (!items) return;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      const added = storeScriptHistory(window.localStorage, items);
      opener.postMessage({ channel: HANDOFF_CHANNEL, type: "saved", added }, event.origin);
      go();
    };
    window.addEventListener("message", onMessage);
    // "ready" carries nothing; the history only travels back to an origin the staff page checked (fromHandoff).
    opener.postMessage({ channel: HANDOFF_CHANNEL, type: "ready" }, "*");
    return () => { window.removeEventListener("message", onMessage); window.clearTimeout(timer); };
  }, [staffHosts, open, org]);
  return <p style={{ padding: 24, fontSize: 13, color: "var(--text-muted)" }}>正在開啟影片工作台…</p>;
}
