"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// P8 fix: the operational pages (Repair Center / Ops Inbox / Approvals) are force-dynamic
// Server Components with no live updates — new incidents / state changes only appeared on a
// manual reload. This drops in a lightweight poller that calls router.refresh() (re-fetches
// the RSC payload, no full page reload) on an interval, but ONLY while the tab is visible so
// it doesn't hammer the server in background tabs. No SSE/websocket infra needed.
export function AutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const id = setInterval(tick, intervalMs);
    // Refresh immediately when the tab regains focus (catches up after being backgrounded).
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
