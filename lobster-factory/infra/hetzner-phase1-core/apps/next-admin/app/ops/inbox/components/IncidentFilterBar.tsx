"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const STATUS_TABS = [
  { key: "active", label: "進行中", param: null as string | null },
  { key: "all", label: "全部", param: "all" },
  { key: "resolved", label: "已解決", param: "resolved" },
  { key: "ignored", label: "已忽略", param: "ignored" },
] as const;

function effectiveStatusKey(status: string | undefined): string {
  if (!status) return "active";
  return status;
}

export function IncidentFilterBar({
  current,
}: {
  current: { status?: string; severity?: string; source?: string; q?: string };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, start] = useTransition();
  const eff = effectiveStatusKey(current.status);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    start(() => router.push(`/ops/inbox?${next.toString()}`));
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 14,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "8px 12px",
        flexWrap: "wrap",
      }}
    >
      {/* Status tabs */}
      <div style={{ display: "flex", gap: 2 }}>
        {STATUS_TABS.map((tab) => {
          const active = eff === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              disabled={isPending}
              onClick={() => setParam("status", tab.param)}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                background: active ? "#0f172a" : "transparent",
                color: active ? "#fff" : "#64748b",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                transition: "background 0.12s, color 0.12s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 4px" }} />

      {/* Search */}
      <div style={{ flex: 1, position: "relative", minWidth: 180 }}>
        <span
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#94a3b8",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          🔍
        </span>
        <input
          defaultValue={current.q ?? ""}
          placeholder="Search title / message..."
          onChange={(e) => setParam("q", e.target.value || null)}
          style={{
            width: "100%",
            padding: "5px 10px 5px 30px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            fontSize: 12,
            color: "#0f172a",
            background: "#f8fafc",
            outline: "none",
          }}
        />
      </div>

      {isPending && (
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Loading…</span>
      )}
    </div>
  );
}
