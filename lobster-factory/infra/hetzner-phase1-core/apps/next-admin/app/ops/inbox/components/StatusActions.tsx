"use client";

import { useTransition } from "react";
import { acknowledgeIncident, ignoreIncident, reopenIncident, resolveIncident } from "../actions";

export function StatusActions({ incidentId, status, canAct }: { incidentId: string; status: string; canAct: boolean }) {
  const [pending, start] = useTransition();
  if (!canAct)
    return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>（唯讀，無法變更狀態）</span>;
  const btn = {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--btn-secondary-border)",
    background: "var(--btn-secondary-bg)",
    cursor: "pointer",
  } as const;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {status === "open" && (
        <button style={btn} disabled={pending} onClick={() => start(() => acknowledgeIncident(incidentId))}>
          標記調查中
        </button>
      )}
      {(status === "open" || status === "investigating") && (
        <button style={btn} disabled={pending} onClick={() => start(() => resolveIncident(incidentId))}>
          標記已解決
        </button>
      )}
      {(status === "open" || status === "investigating") && (
        <button style={btn} disabled={pending} onClick={() => start(() => ignoreIncident(incidentId))}>
          標記忽略
        </button>
      )}
      {(status === "resolved" || status === "ignored") && (
        <button style={btn} disabled={pending} onClick={() => start(() => reopenIncident(incidentId))}>
          重新開啟
        </button>
      )}
    </div>
  );
}
