"use client";

import { useState } from "react";
import {
  DEPARTMENT_CATALOG,
  GROUP_LABELS,
  SMB_DEFAULT_CLUSTERS,
  buildDepartmentSelection,
  getRequiredTemplateFiles,
  type ClusterId,
  type DepartmentCluster,
} from "@/lib/department-catalog";

const GROUP_ORDER: DepartmentCluster["group"][] = [
  "core",
  "revenue",
  "supply_chain",
  "platform",
  "support",
  "horizontal",
  "cross_border",
];

export default function DepartmentSelector({ tenantSlug }: { tenantSlug?: string }) {
  const [selected, setSelected] = useState<Set<ClusterId>>(new Set(SMB_DEFAULT_CLUSTERS));
  const [copied, setCopied] = useState(false);
  const [slug, setSlug] = useState(tenantSlug ?? "");

  const toggle = (id: ClusterId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedIds = Array.from(selected) as ClusterId[];
  const payload = buildDepartmentSelection(selectedIds, slug);
  const requiredFiles = getRequiredTemplateFiles(selectedIds);

  const copyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    clusters: DEPARTMENT_CATALOG.filter((d) => d.group === group),
  }));

  return (
    <div className="dept-selector">
      <div className="build-form-grid" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <label className="form-label">tenant slug</label>
          <input
            className="form-input"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="company-<slug>"
          />
        </div>
      </div>

      <div className="dept-legend">
        <span className="dept-legend-item dept-on">SMB 預設 on</span>
        <span className="dept-legend-item dept-by-industry">視業態</span>
        <span className="dept-legend-item dept-off">預設 off</span>
      </div>

      {grouped.map(({ group, label, clusters }) => (
        <div key={group} className="dept-group">
          <div className="dept-group-label">{label}</div>
          <div className="dept-cluster-grid">
            {clusters.map((cluster) => {
              const isSelected = selected.has(cluster.clusterId);
              return (
                <label
                  key={cluster.clusterId}
                  className={`dept-cluster-card ${isSelected ? "selected" : ""} dept-smb-${cluster.smbDefault.replace("_", "-")}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(cluster.clusterId)}
                  />
                  <span className="dept-cluster-name">{cluster.label}</span>
                  <span className="dept-cluster-rows">
                    {cluster.matrixRows.join(" · ")}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="dept-summary">
        <div className="section-title" style={{ marginBottom: 8 }}>
          已選 {selected.size} / 20 部門 — 需填模板檔案
        </div>
        {requiredFiles.length === 0 ? (
          <p className="form-hint">未選擇任何部門</p>
        ) : (
          <div className="dept-file-list">
            {requiredFiles.map((f) => (
              <div key={f.path} className="dept-file-row">
                <code className="dept-file-path">{f.path}</code>
                <span className="dept-file-fields">
                  必填：{f.mandatoryFields?.join("、") || "—"}
                  {f.recommendedFields?.length ? (
                    <span className="dept-file-recommended">
                      {" "}／ 建議：{f.recommendedFields.join("、")}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" className="btn-primary" style={{ marginTop: 16 }} onClick={copyJson}>
        {copied ? "✓ 已複製" : `複製 DEPARTMENT_SELECTION JSON（${selected.size} 部門）`}
      </button>

      <details style={{ marginTop: 12 }}>
        <summary className="form-hint" style={{ cursor: "pointer" }}>
          預覽 JSON payload
        </summary>
        <pre className="dept-json-preview">{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
}
