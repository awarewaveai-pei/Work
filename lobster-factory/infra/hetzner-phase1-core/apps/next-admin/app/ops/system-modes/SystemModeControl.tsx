"use client";

import { useState } from "react";

const MODES = ["normal", "read_only", "maintenance", "emergency_stop"] as const;
type Mode = (typeof MODES)[number];

interface Props {
  currentMode: string;
}

export function SystemModeControl({ currentMode }: Props) {
  const [target, setTarget] = useState<Mode>("normal");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const isUnlock = currentMode !== "normal" && target === "normal";
  const isLock = target === "emergency_stop" && currentMode !== "emergency_stop";

  async function submit() {
    if (target === currentMode) {
      setResult({ ok: false, msg: "Target mode is same as current; nothing to change." });
      return;
    }
    let confirmMsg = `Change mode from "${currentMode}" to "${target}"?`;
    if (isUnlock) {
      confirmMsg = `🔓 UNLOCK from "${currentMode}" → "normal".\n\nThis re-enables all command dispatch. Continue?`;
    } else if (isLock) {
      confirmMsg = `🛑 EMERGENCY STOP — all commands will be blocked immediately.\n\nContinue?`;
    }
    if (!confirm(confirmMsg)) return;

    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/ops/system-modes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: target, reason: reason || undefined }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult({ ok: true, msg: `Mode changed to "${json.current.mode}". Refresh to see updated state.` });
      } else {
        setResult({ ok: false, msg: `${json.error}${json.details ? ": " + json.details : ""}` });
      }
    } catch (e) {
      setResult({ ok: false, msg: `Exception: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: "20px 24px",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
        Change Mode
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, color: "#0f172a" }}>
          Target mode
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as Mode)}
            style={{
              marginLeft: 8,
              padding: "6px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: 4,
              fontSize: 14,
              background: "#fff",
            }}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
                {m === currentMode ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, color: "#0f172a" }}>
          Reason (optional, max 500 chars)
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder={
              isUnlock
                ? "e.g. resolved upstream incident, ready to re-enable"
                : isLock
                  ? "e.g. suspicious activity, locking until investigation"
                  : "Brief context for audit"
            }
            style={{
              display: "block",
              marginTop: 4,
              padding: "6px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: 4,
              fontSize: 14,
              width: "100%",
              maxWidth: 500,
            }}
          />
        </label>

        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={submit}
            disabled={busy || target === currentMode}
            className={isLock ? "btn-secondary" : "btn-primary"}
            style={{
              minWidth: 160,
              ...(isLock
                ? { borderColor: "#dc2626", color: "#991b1b", background: "#fef2f2" }
                : {}),
              ...(isUnlock ? { background: "#059669", borderColor: "#059669" } : {}),
            }}
          >
            {busy
              ? "..."
              : isUnlock
                ? `🔓 Unlock to normal`
                : isLock
                  ? `🛑 Emergency Stop`
                  : `Change to "${target}"`}
          </button>
        </div>

        {result && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 12px",
              borderRadius: 4,
              fontSize: 13,
              background: result.ok ? "#ecfdf5" : "#fef2f2",
              color: result.ok ? "#065f46" : "#991b1b",
              border: `1px solid ${result.ok ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            {result.ok ? "✅" : "❌"} {result.msg}
          </div>
        )}
      </div>
    </div>
  );
}
