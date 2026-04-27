"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function IncidentFilterBar({ current }: { current: { status?: string; severity?: string; source?: string; q?: string } }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, start] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    start(() => router.push(`/ops/inbox?${next.toString()}`));
  };

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {["all", "open", "investigating", "resolved"].map((s) => (
        <button
          key={s}
          onClick={() => setParam("status", s === "all" ? null : s)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            background: (current.status ?? "open") === s || (s === "all" && !current.status) ? "var(--btn-primary-bg)" : "var(--btn-secondary-bg)",
            color: (current.status ?? "open") === s ? "#fff" : "var(--text-primary)",
            border: "1px solid var(--btn-secondary-border)",
            cursor: "pointer",
          }}
        >
          {s}
        </button>
      ))}
      <input
        defaultValue={current.q ?? ""}
        placeholder="Search title / message..."
        onChange={(e) => setParam("q", e.target.value || null)}
        style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--btn-secondary-border)", flex: 1, minWidth: 200 }}
      />
    </div>
  );
}
