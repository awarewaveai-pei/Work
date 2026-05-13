"use client";

import { useState } from "react";

interface Props {
  canAct: boolean;
  mode: "start" | "run";
  incidentId?: string;
  runId?: string;
}

export function RepairActions({ canAct, mode, incidentId, runId }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  async function start() {
    if (!incidentId) return;
    if (!confirm("Start repair orchestration? This will run the backup gate before any GitHub issue is created.")) return;
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
      setMsg(json.ok ? "Repair run started. Refresh to see current state." : `Blocked: ${json.error ?? "unknown"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function humanOnly() {
    if (!runId) return;
    const reason = prompt("Reason for human-only handling:", "Manual review required") ?? "";
    if (!confirm("Mark this repair run as human-only?")) return;
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
      setMsg(json.ok ? "Marked human-only. Refresh to see current state." : `Failed: ${json.error ?? "unknown"}`);
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
      setMsg(json.ok ? "PR link saved. Refresh to see current state." : `Failed: ${json.error ?? "unknown"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markDeployPending() {
    if (!runId) return;
    if (!confirm("Mark this run as deploy_pending? Production deploy remains manual.")) return;
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
      setMsg(json.ok ? "Marked deploy pending. Run sg-deploy manually when ready." : `Failed: ${json.error ?? "unknown"}`);
    } catch (e) {
      setOk(false);
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!canAct) return <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>read-only</span>;

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "end", minWidth: 144 }}>
      {mode === "start" ? (
        <button type="button" className="btn-primary" disabled={busy} onClick={start}>
          {busy ? "Starting..." : "Approve"}
        </button>
      ) : (
        <>
          <button type="button" className="btn-secondary" disabled={busy} onClick={addPr}>
            Add PR
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={markDeployPending}>
            Deploy pending
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={humanOnly}>
            Human-only
          </button>
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
