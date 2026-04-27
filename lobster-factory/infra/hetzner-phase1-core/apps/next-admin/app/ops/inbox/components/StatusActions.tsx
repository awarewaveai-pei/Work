"use client";

import { useTransition } from "react";
import { acknowledgeIncident, ignoreIncident, reopenIncident, resolveIncident } from "../actions";

export function StatusActions({ incidentId, status, canAct }: { incidentId: string; status: string; canAct: boolean }) {
  const [pending, start] = useTransition();
  if (!canAct) return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>(view only)</span>;
  const btn = {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid var(--btn-secondary-border)",
    background: "var(--btn-secondary-bg)",
    cursor: "pointer",
  } as const;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {status === "open" && (
        <button style={btn} disabled={pending} onClick={() => start(() => acknowledgeIncident(incidentId))}>
          Acknowledge
        </button>
      )}
      {(status === "open" || status === "investigating") && (
        <button style={btn} disabled={pending} onClick={() => start(() => resolveIncident(incidentId))}>
          Mark resolved
        </button>
      )}
      {(status === "open" || status === "investigating") && (
        <button style={btn} disabled={pending} onClick={() => start(() => ignoreIncident(incidentId))}>
          Mark ignored
        </button>
      )}
      {(status === "resolved" || status === "ignored") && (
        <button style={btn} disabled={pending} onClick={() => start(() => reopenIncident(incidentId))}>
          Reopen
        </button>
      )}
    </div>
  );
}
