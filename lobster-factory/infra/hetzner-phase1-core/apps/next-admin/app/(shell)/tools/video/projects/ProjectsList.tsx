"use client";

import { useEffect, useState } from "react";
import OrganizationPicker from "../OrganizationPicker";
import { projectStatus } from "./project-status";

type Project = { id: string; organization_id: string; title: string; production_mode: string; lifecycle_stage: string; source: string; formats: string[] | null; last_error: string | null; updated_at: string };

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };
const MODE_TEXT: Record<string, string> = { quick_video: "快速影片", short_drama: "短劇", footage_edit: "實拍剪輯" };
const SOURCE_TEXT: Record<string, string> = { manual: "手動", script_forge: "腳本工具", content_topic: "選題" };

export default function ProjectsList() {
  const [org, setOrg] = useState("");
  const [items, setItems] = useState<Project[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError("");
    fetch(`/api/video/projects${org.trim() ? `?organizationId=${encodeURIComponent(org.trim())}` : ""}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({})) as { items?: Project[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j.items ?? [];
      })
      .then((list) => { if (!cancelled) setItems(list); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [org]);

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 960 }}>
      <div style={{ maxWidth: 360 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>客戶（不選＝全部）</div>
        <OrganizationPicker value={org} onChange={setOrg} />
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--red)" }}>讀取失敗：{error}</div>}
      {!error && items === null && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>載入中…</div>}
      {items && items.length === 0 && (
        <div style={{ ...card, fontSize: 12, color: "var(--text-secondary)" }}>
          還沒有影片專案。<a href="/tools/video" style={{ color: "var(--accent-text)" }}>開新影片</a>
        </div>
      )}
      {items?.map((p) => {
        const st = projectStatus(p.lifecycle_stage, p.last_error);
        return (
          <a key={p.id} href={`/tools/video/projects/${p.id}`} style={{ ...card, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.2fr 1fr 1fr 1.4fr", gap: 8, alignItems: "center", textDecoration: "none", fontSize: 12, color: "var(--text-secondary)" }}>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{p.title || "（未命名）"}</span>
            <span>{p.organization_id.slice(0, 8)}</span>
            <span>{MODE_TEXT[p.production_mode] ?? p.production_mode}</span>
            <span>{(p.formats ?? []).join("、") || "—"}</span>
            <span style={{ color: st.bad ? "var(--red)" : "var(--text-primary)", fontWeight: 700 }}>{st.text}</span>
            <span>{SOURCE_TEXT[p.source] ?? p.source}</span>
            <span>{new Date(p.updated_at).toLocaleString()}</span>
          </a>
        );
      })}
    </div>
  );
}
