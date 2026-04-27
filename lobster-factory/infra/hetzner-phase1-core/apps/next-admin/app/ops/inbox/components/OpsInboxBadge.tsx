"use client";

import { useEffect, useState } from "react";

export function OpsInboxBadge() {
  const [counts, setCounts] = useState<{ critical: number; total: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/ops/inbox/health");
        if (!alive || !r.ok) return;
        const j = await r.json();
        setCounts({ critical: j.critical_count ?? 0, total: j.open_count ?? 0 });
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

  const bg = counts.critical > 0 ? "var(--severity-critical)" : "#64748b";
  return (
    <span style={{ marginLeft: 8, padding: "2px 6px", background: bg, color: "#fff", borderRadius: 999, fontSize: 11 }}>
      {counts.total}
    </span>
  );
}
