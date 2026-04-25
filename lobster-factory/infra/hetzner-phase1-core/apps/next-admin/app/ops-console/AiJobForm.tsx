"use client";

import { useEffect, useState } from "react";
import type { OpsRole } from "../../lib/ops-contracts";
import { roleHeader } from "../../lib/ops-role";

const ROLE_KEY = "ops_console_simulated_role";

type Props = {
  defaultOrganizationId: string;
};

export default function AiJobForm({ defaultOrganizationId }: Props) {
  const [actorRole, setActorRole] = useState<OpsRole>("operator");
  const [organizationId, setOrganizationId] = useState(defaultOrganizationId);
  const [workspaceId, setWorkspaceId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [prompt, setPrompt] = useState("smoke: generate a 1x1 transparent PNG placeholder for ops console");
  const [modelName, setModelName] = useState("xai-image-1");
  const [provider, setProvider] = useState("xai");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ROLE_KEY) as OpsRole | null;
      if (saved && ["owner", "admin", "operator", "viewer"].includes(saved)) {
        setActorRole(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (defaultOrganizationId && !organizationId) {
      setOrganizationId(defaultOrganizationId);
    }
  }, [defaultOrganizationId, organizationId]);

  const persistRole = (r: OpsRole) => {
    setActorRole(r);
    try {
      localStorage.setItem(ROLE_KEY, r);
    } catch {
      /* ignore */
    }
  };

  const submit = async () => {
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch("/api/ops/ai-image-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader(actorRole) },
        body: JSON.stringify({
          organizationId: organizationId || undefined,
          workspaceId: workspaceId || undefined,
          projectId: projectId || undefined,
          siteId: siteId || undefined,
          prompt,
          modelName,
          provider,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(`Error (${res.status}): ${JSON.stringify(json, null, 2)}`);
      } else {
        setMessage(`OK:\n${JSON.stringify(json, null, 2)}`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoading(false);
    }
  };

  const viewerLocked = actorRole === "viewer";

  return (
    <div className="form-block">
      <div className="form-row">
        <label className="form-label">Simulated role (v1)</label>
        <select
          className="form-select"
          value={actorRole}
          onChange={(e) => persistRole(e.target.value as OpsRole)}
        >
          <option value="owner">owner</option>
          <option value="admin">admin</option>
          <option value="operator">operator</option>
          <option value="viewer">viewer</option>
        </select>
        <p className="form-hint">
          Production should map from Clerk/SSO. This control is for local and staging smoke only.
        </p>
      </div>

      <div className="form-row">
        <label className="form-label">organization_id (UUID)</label>
        <input
          className="form-input"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          disabled={viewerLocked}
        />
      </div>
      <div className="form-row">
        <label className="form-label">workspace_id (optional)</label>
        <input
          className="form-input"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          disabled={viewerLocked}
        />
      </div>
      <div className="form-row">
        <label className="form-label">project_id (optional)</label>
        <input
          className="form-input"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={viewerLocked}
        />
      </div>
      <div className="form-row">
        <label className="form-label">site_id (optional)</label>
        <input
          className="form-input"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          disabled={viewerLocked}
        />
      </div>
      <div className="form-row">
        <label className="form-label">prompt</label>
        <textarea
          className="form-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={viewerLocked}
        />
      </div>
      <div className="form-row">
        <label className="form-label">modelName</label>
        <input
          className="form-input"
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          disabled={viewerLocked}
        />
      </div>
      <div className="form-row">
        <label className="form-label">provider</label>
        <input
          className="form-input"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          disabled={viewerLocked}
        />
        <p className="form-hint">e.g. xai, replicate — executor wiring comes after control-plane is stable.</p>
      </div>

      <button
        type="button"
        className="btn-primary"
        onClick={submit}
        disabled={loading || viewerLocked}
      >
        {viewerLocked ? "Viewer cannot submit" : loading ? "Submitting…" : "Create AI image job (queued)"}
      </button>

      {message ? <pre className="form-message">{message}</pre> : null}
    </div>
  );
}
