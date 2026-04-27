"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** Default list = open + investigating (same as no `status` query). */
const STATUS_TABS = [
  { key: "active", label: "進行中", param: null as string | null },
  { key: "all", label: "全部", param: "all" },
  { key: "open", label: "open", param: "open" },
  { key: "investigating", label: "investigating", param: "investigating" },
  { key: "resolved", label: "resolved", param: "resolved" },
] as const;

function effectiveStatusKey(status: string | undefined): string {
  if (!status) return "active";
  return status;
}

export function IncidentFilterBar({ current }: { current: { status?: string; severity?: string; source?: string; q?: string } }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const eff = effectiveStatusKey(current.status);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    start(() => router.push(`/ops/inbox?${next.toString()}`));
  };

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      {STATUS_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setParam("status", tab.param)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            background: eff === tab.key ? "var(--btn-primary-bg)" : "var(--btn-secondary-bg)",
            color: eff === tab.key ? "#fff" : "var(--text-primary)",
            border: "1px solid var(--btn-secondary-border)",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {tab.label}
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
