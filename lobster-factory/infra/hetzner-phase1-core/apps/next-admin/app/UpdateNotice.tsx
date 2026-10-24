"use client";

import { useEffect, useState } from "react";

// Shows a reload bar once the server runs a newer build than the one this page was rendered from. An open tab keeps the
// old client code after a deploy, so its buttons behave the old way without any sign (2026-10-23).
export function UpdateNotice({ buildId }: { buildId: string | null }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!buildId) return;
    let cancelled = false;
    const check = () => {
      fetch("/api/ops/build-id", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { buildId?: string | null } | null) => {
          if (!cancelled && d?.buildId && d.buildId !== buildId) setStale(true);
        })
        .catch(() => { /* offline or mid-deploy: try again on the next tick */ });
    };
    const timer = setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [buildId]);

  if (!stale) return null;
  return (
    <div
      role="alert"
      style={{
        position: "sticky", top: 0, zIndex: 1000, display: "flex", gap: 12, alignItems: "center", justifyContent: "center",
        padding: "10px 16px", background: "var(--accent)", color: "var(--btn-primary-text)", fontSize: 14, fontWeight: 600,
      }}
    >
      網站已更新。這一頁還是舊版，按鈕會照舊版運作，請重新整理。
      <button className="btn-secondary" onClick={() => window.location.reload()} style={{ fontSize: 13 }}>
        重新整理
      </button>
    </div>
  );
}
