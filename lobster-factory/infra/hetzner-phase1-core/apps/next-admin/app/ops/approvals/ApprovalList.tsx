"use client";

import { useState } from "react";

interface CommandRequestRow {
  id: string;
  organization_id: string;
  source: string;
  actor_type: string;
  actor_ref: string | null;
  command: string;
  args: Record<string, unknown>;
  risk_level: string;
  status: string;
  trace_id: string;
  received_at: string;
  metadata: Record<string, unknown>;
}

interface Props {
  items: CommandRequestRow[];
  canAct: boolean;
}

export function ApprovalList({ items, canAct }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  async function approve(id: string) {
    if (!confirm("核准這條指令？將會立刻執行，無法復原。")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/ops/approvals/${id}/approve`, { method: "POST" });
      const json = await res.json();
      setResults((r) => ({
        ...r,
        [id]: { ok: json.ok === true, msg: json.ok ? `成功 status=${json.status}` : `失敗 ${json.error}` },
      }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [id]: { ok: false, msg: `例外 ${(e as Error).message}` },
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const reason = prompt("拒絕理由（可選填）：") ?? "";
    if (reason === null) return; // cancelled
    if (!confirm("拒絕這條指令？")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/ops/approvals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      setResults((r) => ({
        ...r,
        [id]: { ok: json.ok === true, msg: json.ok ? `已拒絕：${json.reason ?? ""}` : `失敗 ${json.error}` },
      }));
    } catch (e) {
      setResults((r) => ({
        ...r,
        [id]: { ok: false, msg: `例外 ${(e as Error).message}` },
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((it) => {
        const result = results[it.id];
        const argsPreview =
          Object.keys(it.args ?? {}).length === 0
            ? "(no args)"
            : JSON.stringify(it.args).slice(0, 200);
        return (
          <div
            key={it.id}
            style={{
              background: "var(--approval-card-bg)",
              border: "1px solid var(--approval-card-border)",
              borderRadius: 8,
              padding: "16px 20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--approval-text-primary)",
                    }}
                  >
                    {it.command}
                  </span>
                  <span
                    style={{
                      background: it.risk_level === "critical" ? "var(--badge-red-bg)" : "var(--build-risk-medium-bg)",
                      color: it.risk_level === "critical" ? "var(--badge-red-text)" : "var(--build-risk-medium-text)",
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {it.risk_level}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--approval-text-muted)" }}>
                    {it.source} · {it.actor_type}
                    {it.actor_ref ? ` ${it.actor_ref}` : ""}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--approval-text-dim)", marginBottom: 4 }}>
                  參數：<code>{argsPreview}</code>
                </div>
                <div style={{ fontSize: 11, color: "var(--approval-text-faint)", fontFamily: "monospace" }}>
                  追蹤碼：{it.trace_id} · 收到時間：{new Date(it.received_at).toLocaleString("zh-TW")}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                {canAct ? (
                  <>
                    <button
                      type="button"
                      onClick={() => approve(it.id)}
                      disabled={busyId === it.id}
                      className="btn-primary"
                      style={{ minWidth: 100 }}
                    >
                      {busyId === it.id ? "處理中..." : "核准"}
                    </button>
                    <button
                      type="button"
                      onClick={() => reject(it.id)}
                      disabled={busyId === it.id}
                      className="btn-secondary"
                      style={{ minWidth: 100 }}
                    >
                      拒絕
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--approval-text-faint)" }}>唯讀</span>
                )}
              </div>
            </div>
            {result && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 4,
                  fontSize: 13,
                  background: result.ok ? "var(--approval-result-ok-bg)" : "var(--approval-result-err-bg)",
                  color: result.ok ? "var(--approval-result-ok-text)" : "var(--approval-result-err-text)",
                  border: `1px solid ${result.ok ? "var(--approval-result-ok-border)" : "var(--approval-result-err-border)"}`,
                }}
              >
                {result.ok ? "✅" : "❌"} {result.msg}
                <span style={{ marginLeft: 8, fontSize: 11, color: "var(--approval-text-muted)" }}>
                  （重新整理頁面看更新後的列表）
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
