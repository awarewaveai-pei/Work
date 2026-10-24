"use client";

import { useEffect, useState } from "react";

export function OpsInboxBadge() {
  const [counts, setCounts] = useState<{ critical: number; total: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        // /api/ops/inbox/health answers 503 while the probe is stale but still carries the counts;
        // that is exactly when the badge matters, so read the body whatever the status.
        const r = await fetch("/api/ops/inbox/health");
        const j = await r.json().catch(() => null);
        if (!alive || typeof j?.open_count !== "number") return;
        setCounts({ critical: j.critical_count ?? 0, total: j.open_count });
      } catch {}
    };
    void tick();
    const id = setInterval(tick, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!counts || counts.total === 0) return null;

  const bg = counts.critical > 0 ? "var(--severity-critical)" : "var(--status-ignored)";
  return (
    <span style={{ marginLeft: 8, padding: "2px 6px", background: bg, color: "var(--btn-primary-text)", borderRadius: 999, fontSize: 11 }}>
      {counts.total}
    </span>
  );
}
