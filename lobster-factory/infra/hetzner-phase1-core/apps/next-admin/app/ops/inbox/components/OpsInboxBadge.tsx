"use client";

import { useEffect, useState } from "react";

export function OpsInboxBadge() {
  const [counts, setCounts] = useState<{ critical: number; high: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/ops/inbox/health");
        if (!alive || !r.ok) return;
        const j = await r.json();
        setCounts({ critical: j.critical_count ?? 0, high: j.high_count ?? 0 });
      } catch {}
    };
    void tick();
    const id = setInterval(tick, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!counts) return null;
  if (counts.critical > 0) {
    return (
      <span style={{ marginLeft: 8, padding: "2px 6px", background: "var(--severity-critical)", color: "#fff", borderRadius: 999, fontSize: 11 }}>
        {counts.critical}
      </span>
    );
  }
  if (counts.high > 0) {
    return (
      <span style={{ marginLeft: 8, padding: "2px 6px", background: "var(--severity-high)", color: "#fff", borderRadius: 999, fontSize: 11 }}>
        {counts.high}
      </span>
    );
  }
  return null;
}
