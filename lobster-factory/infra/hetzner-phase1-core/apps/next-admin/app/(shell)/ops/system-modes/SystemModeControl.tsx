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
      setResult({ ok: false, msg: "目標模式跟目前一樣，沒得切。" });
      return;
    }
    let confirmMsg = `將模式從「${currentMode}」改成「${target}」？`;
    if (isUnlock) {
      confirmMsg = `🔓 解鎖：從「${currentMode}」→「normal」。\n\n這會重新開放所有指令執行。確定？`;
    } else if (isLock) {
      confirmMsg = `🛑 緊急停止 — 所有指令會立刻被擋下。\n\n確定？`;
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
        setResult({ ok: true, msg: `已切換到「${json.current.mode}」。重新整理頁面看更新狀態。` });
      } else {
        setResult({ ok: false, msg: `${json.error}${json.details ? "：" + json.details : ""}` });
      }
    } catch (e) {
      setResult({ ok: false, msg: `例外：${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "20px 24px",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
        切換模式
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13, color: "var(--text-primary)" }}>
          目標模式
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as Mode)}
            style={{
              marginLeft: 8,
              padding: "6px 10px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: 14,
              background: "var(--card-bg)",
            }}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
                {m === currentMode ? "（目前）" : ""}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: 13, color: "var(--text-primary)" }}>
          切換原因（可選填，最多 500 字）
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder={
              isUnlock
                ? "例：上游事故已解決，可以重新開放"
                : isLock
                  ? "例：發現異常活動，先鎖系統等查清"
                  : "簡短說明，留給未來審計用"
            }
            style={{
              display: "block",
              marginTop: 4,
              padding: "6px 10px",
              border: "1px solid var(--border)",
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
                ? { borderColor: "var(--red)", color: "var(--badge-red-text)", background: "var(--badge-red-bg)" }
                : {}),
              ...(isUnlock ? { background: "var(--green)", borderColor: "var(--green)" } : {}),
            }}
          >
            {busy
              ? "處理中..."
              : isUnlock
                ? `🔓 解鎖為 normal`
                : isLock
                  ? `🛑 緊急停止`
                  : `切換為「${target}」`}
          </button>
        </div>

        {result && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 12px",
              borderRadius: 4,
              fontSize: 13,
              background: result.ok ? "var(--badge-green-bg)" : "var(--badge-red-bg)",
              color: result.ok ? "var(--badge-green-text)" : "var(--badge-red-text)",
              border: `1px solid ${result.ok ? "var(--green)" : "var(--red)"}`,
            }}
          >
            {result.ok ? "✅" : "❌"} {result.msg}
          </div>
        )}
      </div>
    </div>
  );
}
