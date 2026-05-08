"use client";
// WpUpdateButtons — one-click WP plugin update via SSH + SSE streaming.
// Rendered only for WordPress clients that have ssh_host configured.
// Calls POST /api/ops/clients/:slug/wp-update → SSE log stream.
//
// Phase 2c — 2026-05-08

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

type Wave = "wave1" | "wave2" | "wave3";
type RunState = "idle" | "running" | "done" | "error";

interface WaveInfo {
  key: Wave;
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  border: string;
}

const WAVES: WaveInfo[] = [
  {
    key: "wave1",
    label: "Wave 1 — 高風險",
    sublabel: "逐個更新・遇失敗立刻停止",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  {
    key: "wave2",
    label: "Wave 2 — 中風險",
    sublabel: "逐個更新・記錄失敗後繼續",
    color: "#ca8a04",
    bg: "#fffbeb",
    border: "#fde68a",
  },
  {
    key: "wave3",
    label: "Wave 3 — 低風險",
    sublabel: "批次更新・最後健康檢查",
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
  },
];

interface Props {
  slug: string;
  waves: { wave1?: string[]; wave2?: string[]; wave3?: string[] };
}

export function WpUpdateButtons({ slug, waves }: Props) {
  const router = useRouter();
  const [runState, setRunState] = useState<RunState>("idle");
  const [activeWave, setActiveWave] = useState<Wave | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [doneResult, setDoneResult] = useState<Record<string, unknown> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
    // auto-scroll
    requestAnimationFrame(() => {
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    });
  };

  const startUpdate = async (wave: Wave) => {
    if (runState === "running") return;

    setRunState("running");
    setActiveWave(wave);
    setLogs([]);
    setDoneResult(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const resp = await fetch(`/api/ops/clients/${slug}/wp-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wave }),
        signal: abort.signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        setRunState("error");
        appendLog(`🔴 HTTP ${resp.status}：${text}`);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        setRunState("error");
        appendLog("🔴 無法讀取 SSE 串流");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw) as {
              type: string;
              message?: string;
              result?: Record<string, unknown>;
            };
            if (evt.type === "log" && evt.message) {
              appendLog(evt.message);
            } else if (evt.type === "done") {
              setDoneResult(evt.result ?? {});
              setRunState("done");
              // Refresh server component data (re-fetches plugin summary from Supabase)
              router.refresh();
            } else if (evt.type === "error") {
              setRunState("error");
              appendLog(`🔴 ${evt.message ?? "未知錯誤"}`);
            }
          } catch {
            /* skip malformed line */
          }
        }
      }

      if (runState !== "done" && runState !== "error") {
        setRunState("done");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setRunState("error");
        appendLog(`🔴 串流中斷：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const stopUpdate = () => {
    abortRef.current?.abort();
    setRunState("idle");
    appendLog("⏹ 已中止（伺服器端指令可能仍在執行中）");
  };

  const reset = () => {
    abortRef.current?.abort();
    setRunState("idle");
    setActiveWave(null);
    setLogs([]);
    setDoneResult(null);
  };

  const isRunning = runState === "running";

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: 12,
      padding: "18px 20px",
      marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
          🔌 一鍵更新外掛
        </h2>
        {(runState === "done" || runState === "error") && (
          <button
            onClick={reset}
            style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 6,
              border: "1px solid #e2e8f0", background: "#f8fafc",
              color: "var(--text-secondary)", cursor: "pointer",
            }}
          >
            重置
          </button>
        )}
      </div>

      {/* Warning */}
      <div style={{
        background: "#fffbeb", border: "1px solid #fde68a",
        borderRadius: 8, padding: "8px 12px", marginBottom: 14,
        fontSize: 11, color: "#92400e", lineHeight: 1.6,
      }}>
        ⚠️ 網頁模式不自動備份。建議先在本機執行
        {" "}<code style={{ fontSize: 10, background: "#fef3c7", padding: "1px 4px", borderRadius: 3 }}>
          update-client-wp-plugins.ps1
        </code>
        {" "}確認備份正常後，再使用此功能。
      </div>

      {/* Wave buttons — only show when idle */}
      {runState === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WAVES.map((w) => {
            const pluginList = waves[w.key] ?? [];
            const isEmpty = pluginList.length === 0;
            return (
              <button
                key={w.key}
                onClick={() => !isEmpty && startUpdate(w.key)}
                disabled={isEmpty}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${isEmpty ? "#e2e8f0" : w.border}`,
                  background: isEmpty ? "#f8fafc" : w.bg,
                  cursor: isEmpty ? "not-allowed" : "pointer",
                  opacity: isEmpty ? 0.5 : 1,
                  textAlign: "left",
                  width: "100%",
                  transition: "filter 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!isEmpty) (e.currentTarget as HTMLButtonElement).style.filter = "brightness(0.96)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.filter = "none";
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isEmpty ? "#94a3b8" : w.color }}>
                    {w.label}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                    {isEmpty ? "尚無外掛指派（在 Supabase client_config.waves 設定）" : w.sublabel}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600,
                  background: isEmpty ? "#e2e8f0" : `${w.color}18`,
                  color: isEmpty ? "#94a3b8" : w.color,
                  padding: "2px 10px", borderRadius: 12,
                  whiteSpace: "nowrap",
                }}>
                  {isEmpty ? "無外掛" : `${pluginList.length} 個外掛`}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Running / done state — show log */}
      {(isRunning || runState === "done" || runState === "error" || logs.length > 0) && (
        <div style={{ marginTop: runState === "idle" ? 14 : 0 }}>
          {/* Status bar */}
          {activeWave && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isRunning && (
                  <span style={{
                    display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                    background: "#3b82f6", animation: "pulse 1.2s infinite",
                  }} />
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                  {WAVES.find((w) => w.key === activeWave)?.label}
                  {runState === "done" ? " — 完成" : runState === "error" ? " — 失敗" : " — 執行中..."}
                </span>
              </div>
              {isRunning && (
                <button
                  onClick={stopUpdate}
                  style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 6,
                    border: "1px solid #fecaca", background: "#fef2f2",
                    color: "#dc2626", cursor: "pointer",
                  }}
                >
                  中止
                </button>
              )}
            </div>
          )}

          {/* Done summary */}
          {runState === "done" && doneResult && (
            <div style={{
              display: "flex", gap: 16, flexWrap: "wrap",
              marginBottom: 10,
              padding: "8px 12px",
              background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8,
            }}>
              <DoneStat
                label="已更新"
                value={Number(doneResult.updated_count ?? 0)}
                color="#16a34a"
              />
              <DoneStat
                label="失敗"
                value={Number(doneResult.failed_count ?? 0)}
                color="#dc2626"
              />
              <div style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "flex-end", marginLeft: "auto" }}>
                外掛統計已同步至 Supabase ↑
              </div>
            </div>
          )}

          {/* Log window */}
          <div
            ref={logRef}
            style={{
              background: "#0f172a", color: "#94a3b8",
              borderRadius: 8, padding: "10px 12px",
              fontSize: 11, lineHeight: 1.65,
              fontFamily: "monospace",
              maxHeight: 320, overflowY: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}
          >
            {logs.length === 0
              ? <span style={{ opacity: 0.4 }}>等待輸出...</span>
              : logs.map((line, i) => <div key={i}>{line}</div>)}
            {isRunning && (
              <div style={{ opacity: 0.4 }}>▌</div>
            )}
          </div>
        </div>
      )}

      {/* Pulse keyframe (injected inline) */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

function DoneStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{label}</div>
    </div>
  );
}
