"use client";

import { useState } from "react";
import { roleHeader } from "../../lib/ops-role";
import type { TenantConfig } from "../../lib/ops-contracts";

type Props = {
  tenant: TenantConfig;
};

export default function TenantConfigForm({ tenant }: Props) {
  const [status, setStatus] = useState<TenantConfig["status"]>(tenant.status);
  const [defaultLocale, setDefaultLocale] = useState(tenant.defaultLocale);
  const [defaultTimezone, setDefaultTimezone] = useState(tenant.defaultTimezone);
  const [actorRole, setActorRole] = useState<"owner" | "admin" | "operator" | "viewer">("admin");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/ops/tenants/${tenant.id}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...roleHeader(actorRole) },
        body: JSON.stringify({
          status,
          defaultLocale,
          defaultTimezone,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; tenant?: TenantConfig; error?: string };
      if (!res.ok || !json.ok || !json.tenant) {
        setMessage(`Error (${res.status}): ${json.error ?? "unknown_error"}`);
        return;
      }
      setStatus(json.tenant.status);
      setDefaultLocale(json.tenant.defaultLocale);
      setDefaultTimezone(json.tenant.defaultTimezone);
      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "request_failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="form-block">
      <div className="form-row">
        <label className="form-label">tenant</label>
        <input className="form-input" value={`${tenant.name} (${tenant.slug})`} disabled />
      </div>
      <div className="form-row">
        <label className="form-label">simulated role for save</label>
        <select className="form-select" value={actorRole} onChange={(e) => setActorRole(e.target.value as typeof actorRole)}>
          <option value="owner">owner</option>
          <option value="admin">admin</option>
          <option value="operator">operator</option>
          <option value="viewer">viewer</option>
        </select>
      </div>
      <div className="form-row">
        <label className="form-label">status</label>
        <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value as TenantConfig["status"])}>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="suspended">suspended</option>
        </select>
      </div>
      <div className="form-row">
        <label className="form-label">defaultLocale</label>
        <input className="form-input" value={defaultLocale} onChange={(e) => setDefaultLocale(e.target.value)} />
      </div>
      <div className="form-row">
        <label className="form-label">defaultTimezone</label>
        <input className="form-input" value={defaultTimezone} onChange={(e) => setDefaultTimezone(e.target.value)} />
      </div>
      <button type="button" className="btn-primary" disabled={saving} onClick={submit}>
        {saving ? "Saving..." : "Save tenant config"}
      </button>
      {message ? <pre className="form-message">{message}</pre> : null}
    </div>
  );
}
