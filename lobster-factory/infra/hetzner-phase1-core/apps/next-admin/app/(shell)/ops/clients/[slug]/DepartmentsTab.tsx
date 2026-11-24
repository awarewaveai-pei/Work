"use client";

// 部門選型 tab: the M3 department picker that was step 3 of the retired /onboard wizard (card SF-P), now saved per client
// (PATCH /api/ops/clients/[slug]/departments). It opens on the stored client_config.department_selection; an id the
// catalog no longer lists is kept as stored and shown below the groups (lib/department-catalog.ts nextDepartmentSelection).
import { useState } from "react";
import {
  DEPARTMENT_CATALOG,
  GROUP_LABELS,
  buildDepartmentSelection,
  getRequiredTemplateFiles,
  type ClusterId,
  type DepartmentCluster,
} from "@/lib/department-catalog";
import { roleHeader } from "@/lib/ops-role";
import { Card } from "./hub-ui";

const GROUP_ORDER: DepartmentCluster["group"][] = [
  "core", "revenue", "supply_chain", "platform", "support", "horizontal", "cross_border",
];
const CATALOG_IDS = new Set<string>(DEPARTMENT_CATALOG.map((d) => d.clusterId));

/** onSaved: the parent keeps the saved value, so a remount (switching tabs) starts from it. */
export function DepartmentsTab({ slug, stored, reviewedAt, onSaved }: {
  slug: string; stored: readonly string[]; reviewedAt: string | null; onSaved?: (selection: string[], reviewedAt: string | null) => void;
}) {
  const [selected, setSelected] = useState<string[]>(() => [...stored]);
  const [savedAt, setSavedAt] = useState<string | null>(reviewedAt);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const catalogSelected = selected.filter((id) => CATALOG_IDS.has(id)) as ClusterId[];
  const outsideCatalog = selected.filter((id) => !CATALOG_IDS.has(id));
  const requiredFiles = getRequiredTemplateFiles(catalogSelected);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops/clients/${encodeURIComponent(slug)}/departments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ selection: selected }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: string; selection?: string[]; reviewedAt?: string };
      if (!res.ok || !data.ok) throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
      const saved = data.selection ?? selected;
      setSelected(saved);
      setSavedAt(data.reviewedAt ?? null);
      onSaved?.(saved, data.reviewedAt ?? null);
      setMsg("✓ 已儲存");
    } catch (e) {
      setMsg(`⚠ 儲存失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  function copyJson() {
    void navigator.clipboard.writeText(JSON.stringify(buildDepartmentSelection(catalogSelected, slug), null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card title="部門選型（M3 · 20 部門）" badge={`已選 ${selected.length} · ${savedAt ? `上次儲存 ${savedAt}` : "尚未儲存過"}`}>
      <p className="form-hint" style={{ marginBottom: 12 }}>
        勾選這個客戶採購的能力模組，按「儲存」寫進客戶設定。
      </p>

      <div className="dept-legend">
        <span className="dept-legend-item dept-on">SMB 預設 on</span>
        <span className="dept-legend-item dept-by-industry">視業態</span>
        <span className="dept-legend-item dept-off">預設 off</span>
      </div>

      {GROUP_ORDER.map((group) => (
        <div key={group} className="dept-group">
          <div className="dept-group-label">{GROUP_LABELS[group]}</div>
          <div className="dept-cluster-grid">
            {DEPARTMENT_CATALOG.filter((d) => d.group === group).map((cluster) => {
              const on = selected.includes(cluster.clusterId);
              return (
                <label key={cluster.clusterId} className={`dept-cluster-card ${on ? "selected" : ""} dept-smb-${cluster.smbDefault.replace("_", "-")}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(cluster.clusterId)} />
                  <span className="dept-cluster-name">{cluster.label}</span>
                  <span className="dept-cluster-rows">{cluster.matrixRows.join(" · ")}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {outsideCatalog.length > 0 && (
        <div className="dept-group">
          <div className="dept-group-label">目錄已沒有的項目（照原樣保留）</div>
          <div className="dept-cluster-grid">
            {outsideCatalog.map((id) => (
              <label key={id} className="dept-cluster-card selected">
                <input type="checkbox" checked onChange={() => toggle(id)} />
                <span className="dept-cluster-name">{id}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {requiredFiles.length > 0 && (
        <div className="dept-summary" style={{ marginTop: 16 }}>
          <div className="section-title" style={{ marginBottom: 8 }}>需填寫 {requiredFiles.length} 個模板檔案</div>
          <div className="dept-file-list">
            {requiredFiles.map((f) => (
              <div key={f.path} className="dept-file-row">
                <code className="dept-file-path">{f.path}</code>
                <span className="dept-file-fields">
                  必填：{f.mandatoryFields?.join("、") || "—"}
                  {f.recommendedFields?.length ? <span className="dept-file-recommended"> ／ 建議：{f.recommendedFields.join("、")}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
          {saving ? "儲存中…" : "儲存"}
        </button>
        <button type="button" className="btn-secondary" onClick={copyJson}>
          {copied ? "✓ 已複製 JSON" : "複製 DEPARTMENT_SELECTION JSON"}
        </button>
        {msg && <span role="status" style={{ fontSize: 12, color: msg.startsWith("✓") ? "var(--green)" : "var(--red)" }}>{msg}</span>}
      </div>
    </Card>
  );
}
