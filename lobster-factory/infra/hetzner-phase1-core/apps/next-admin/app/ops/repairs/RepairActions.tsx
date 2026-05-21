"use client";

import { useState } from "react";

interface Props {
  canAct: boolean;
  mode: "start" | "run";
  incidentId?: string;
  runId?: string;
  runState?: string;
  canEscalate?: boolean;
}

const TERMINAL_STATES = ["resolved", "rolled_back", "human_only"];

function isTerminal(state?: string): boolean {
  return !state || TERMINAL_STATES.includes(state);
}

export function RepairActions({ canAct, mode, incidentId, runId, runState, canEscalate }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  async function start() {
    if (!incidentId) return;
    if (!confirm("要啟動修復流程嗎？系統會先執行備份閘門，通過後才建立 GitHub Issue。")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ops/repairs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId }),
      });
      const json = await res.json();
      setOk(json.ok === true);
      setMsg(json.ok ? "修復流程已啟動。重新整理即可查看最新狀態。" : `已阻擋：${json.error ?? "未知錯誤"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function humanOnly() {
    if (!runId) return;
    const reason = prompt("改為人工處理的原因：", "需要人工審查") ?? "";
    if (!confirm("要將這筆修復標記為人工處理嗎？")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops/repairs/${runId}/human-only`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      setOk(json.ok === true);
      setMsg(json.ok ? "已標記為人工處理。重新整理即可查看最新狀態。" : `失敗：${json.error ?? "未知錯誤"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addPr() {
    if (!runId) return;
    const url = prompt("GitHub PR URL:");
    if (url === null) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops/repairs/${runId}/links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ github_pr_url: url }),
      });
      const json = await res.json();
      setOk(json.ok === true);
      setMsg(json.ok ? "PR 連結已儲存。重新整理即可查看最新狀態。" : `失敗：${json.error ?? "未知錯誤"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markDeployPending() {
    if (!runId) return;
    if (!confirm("要將這筆修復標記為待部署嗎？正式環境部署仍需手動執行。")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops/repairs/${runId}/links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "deploy_pending", deploy_status: "pending_manual" }),
      });
      const json = await res.json();
      setOk(json.ok === true);
      setMsg(json.ok ? "已標記為待部署。確認後請手動執行 sg-deploy。" : `失敗：${json.error ?? "未知錯誤"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function closeRun() {
    if (!runId) return;
    if (!confirm("要將這筆修復標記為已解決（結案）嗎？")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops/repairs/${runId}/links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "resolved" }),
      });
      const json = await res.json();
      setOk(json.ok === true);
      setMsg(json.ok ? "已結案。重新整理即可查看最新狀態。" : `失敗：${json.error ?? "未知錯誤"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeployed() {
    if (!runId) return;
    if (!confirm("要確認部署已完成並結案嗎？")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops/repairs/${runId}/links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: "resolved", deploy_status: "passed" }),
      });
      const json = await res.json();
      setOk(json.ok === true);
      setMsg(json.ok ? "部署已確認，修復結案。重新整理即可查看最新狀態。" : `失敗：${json.error ?? "未知錯誤"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function escalate() {
    if (!runId) return;
    if (!confirm("確認已分析根因為 code regression，要升級為自動修復 PR 嗎？")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops/repairs/${runId}/escalate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const json = await res.json();
      setOk(json.ok === true);
      setMsg(json.ok ? "已升級為 auto_repair。GitHub Issue 將收到升級通知。重新整理即可查看最新狀態。" : `失敗：${json.error ?? "未知錯誤"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canAct) return <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>唯讀</span>;

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "end", minWidth: 144 }}>
      {mode === "start" ? (
        <button type="button" className="btn-primary" disabled={busy} onClick={start}>
          {busy ? "啟動中..." : "核准修復"}
        </button>
      ) : (
        <>
          {!TERMINAL_STATES.includes(runState ?? "") && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={addPr}>
              加入 PR
            </button>
          )}
          {(runState === "repairing" || runState === "pr_ready") && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={markDeployPending}>
              待部署
            </button>
          )}
          {!TERMINAL_STATES.includes(runState ?? "") && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={humanOnly}>
              人工處理
            </button>
          )}
          {runState === "human_only" && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={closeRun}>
              結案
            </button>
          )}
          {(runState === "deploy_pending" || runState === "deploying") && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={confirmDeployed}>
              確認部署完成
            </button>
          )}
          {canEscalate && !isTerminal(runState) && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={escalate}>
              升級修復
            </button>
          )}
        </>
      )}
      {msg && (
        <div
          style={{
            maxWidth: 220,
            fontSize: 11,
            lineHeight: 1.45,
            color: ok ? "#166534" : "#991b1b",
            textAlign: "right",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
