"use client";

import { useEffect, useState } from "react";
import { QA_LABELS, STATUS_TEXT, findingLabel } from "../qa-labels";
import { projectStatus } from "./project-status";

type Scene = { narration?: string };
type Project = { id: string; organization_id: string; title: string; lifecycle_stage: string; last_error: string | null; brief_json: { title?: string; production?: { scenes?: Scene[] } } | null };
type Asset = { id: string; object_url: string; created_at: string; metadata?: { title?: string; formats?: Record<string, string> } };
type Release = { id: string; candidate_asset_id: string; status: string; created_at: string; approved_at: string | null; withdrawn_at: string | null };
type Delivery = { id: string; release_id: string; destination: string; variant: string | null; status: string; created_at: string };
type QaItem = { kind: string; status: string; findings?: { rule: string; message: string; format?: string }[] };
type Outcome = { id: string; release_id: string; platform: string; maturity: string; observed_at: string; metrics: Record<string, unknown> | null };
type Detail = { item: Project; assets: Asset[]; releases: Release[]; deliveries: Delivery[]; outcomes?: Outcome[] };

const METRIC_LABEL: Record<string, string> = { views: "觀看", impressions: "曝光", reach: "觸及", likes: "讚", comments: "留言", shares: "分享", saves: "收藏", clicks: "點擊", completion_rate: "完成率 %" };
const MATURITY_LABEL: Record<string, string> = { "24h": "24 小時", "7d": "7 天", "30d": "30 天" };

/** Newest snapshot per platform and maturity (rows arrive newest first). */
function latestOutcomes(rows: Outcome[]): Outcome[] {
  const seen = new Set<string>();
  return rows.filter((o) => { const k = `${o.platform}/${o.maturity}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)" };

function Qa({ organizationId, assetId }: { organizationId: string; assetId: string }) {
  const [items, setItems] = useState<QaItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/video/qa/reports?organizationId=${encodeURIComponent(organizationId)}&candidateAssetId=${encodeURIComponent(assetId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { items?: QaItem[] }) => { if (!cancelled) setItems(j.items ?? []); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [organizationId, assetId]);
  if (failed) return <div style={{ ...muted, color: "var(--red)" }}>QA 讀取失敗，重新整理再試一次。</div>;
  if (!items) return <div style={muted}>QA 載入中…</div>;
  const byKind = new Map<string, QaItem>();
  for (const q of items) if (!byKind.has(q.kind)) byKind.set(q.kind, q);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
      {Object.entries(QA_LABELS).map(([kind, label]) => {
        const it = byKind.get(kind);
        const status = it?.status ?? "missing";
        const color = status === "passed" ? "var(--badge-green-text)" : status === "missing" ? "var(--text-muted)" : "var(--red)";
        const findings = status === "warned" || status === "failed" ? it?.findings ?? [] : [];
        return (
          <div key={kind} style={{ border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "8px 10px", background: status === "passed" ? "var(--badge-green-bg)" : "transparent" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color }}>{label}　{STATUS_TEXT[status] ?? status}</div>
            {findings.map((f, i) => <div key={i} style={{ fontSize: 10, color, marginTop: 2 }}>{f.format ? `[${f.format}] ` : ""}{findingLabel(f.rule, f.message)}</div>)}
          </div>
        );
      })}
    </div>
  );
}

export default function ProjectDetail({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/video/projects?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({})) as Partial<Detail> & { error?: string };
        if (!r.ok || !j.item) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as Detail;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <div style={{ padding: "24px 28px", fontSize: 12, color: "var(--red)" }}>讀取失敗：{error}</div>;
  if (!data) return <div style={{ padding: "24px 28px", ...muted }}>載入中…</div>;

  const { item, assets, releases, deliveries } = data;
  const outcomes = latestOutcomes(data.outcomes ?? []);
  const st = projectStatus(item.lifecycle_stage, item.last_error);
  const scenes = item.brief_json?.production?.scenes ?? [];
  const editLink = <a href={`/tools/video?project=${item.id}`} style={{ color: "var(--accent-text)", fontSize: 12, fontWeight: 700 }}>繼續編輯 →</a>;

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 960 }}>
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{item.title || "（未命名）"}</div>
        <div style={{ ...muted, marginTop: 6, display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ color: st.bad ? "var(--red)" : "var(--text-primary)", fontWeight: 700 }}>{st.text}</span>
          {editLink}
        </div>
        {item.last_error && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6 }}>{item.last_error}</div>}
      </div>

      {assets.length === 0 && <div style={{ ...card, ...muted }}>還沒有成片。{editLink}</div>}
      {assets.map((a) => {
        const formats = Object.entries(a.metadata?.formats ?? {});
        const rels = releases.filter((r) => r.candidate_asset_id === a.id);
        return (
          <div key={a.id} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{a.metadata?.title ?? "成片"} <span style={{ ...muted, fontWeight: 400 }}>{new Date(a.created_at).toLocaleString()}</span></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {formats.map(([fmt, url]) => (
                <div key={fmt} style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 280 }}>
                  <video controls preload="metadata" src={url} style={{ width: "100%", borderRadius: 6, background: "#000" }} />
                  <div style={{ ...muted, display: "flex", justifyContent: "space-between" }}>
                    <span>{fmt}</span>
                    <a href={url} target="_blank" rel="noopener" style={{ color: "var(--accent-text)" }}>下載</a>
                  </div>
                </div>
              ))}
              {formats.length === 0 && <div style={muted}>這筆成片沒有記錄各比例的影片網址。</div>}
            </div>
            <Qa organizationId={item.organization_id} assetId={a.id} />
            <div style={muted}>
              {rels.length === 0 ? "尚未發布" : rels.map((r) => (
                <div key={r.id} style={{ marginBottom: 4 }}>
                  Release：{r.status}（{new Date(r.created_at).toLocaleString()}）
                  {deliveries.filter((d) => d.release_id === r.id).map((d) => (
                    <div key={d.id} style={{ marginLeft: 12 }}>→ {d.destination}{d.variant ? `／${d.variant}` : ""}：{d.status}（{new Date(d.created_at).toLocaleString()}）</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {outcomes.length > 0 && (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>成效</div>
          {outcomes.map((o) => (
            <div key={o.id} style={muted}>
              {o.platform}（發布後 {MATURITY_LABEL[o.maturity] ?? o.maturity}，{new Date(o.observed_at).toLocaleDateString()}）：
              {Object.entries(o.metrics ?? {}).filter(([, v]) => typeof v === "number").map(([k, v]) => `${METRIC_LABEL[k] ?? k} ${v}`).join("　") || "尚無數字"}
            </div>
          ))}
        </div>
      )}

      <details style={card}>
        <summary style={{ fontSize: 12, fontWeight: 700, cursor: "pointer", color: "var(--text-primary)" }}>腳本：{item.brief_json?.title || "（未命名）"}（{scenes.length} 場）</summary>
        <ol style={{ ...muted, margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
          {scenes.map((s, i) => <li key={i}>{s.narration ?? ""}</li>)}
        </ol>
        {scenes.length === 0 && <div style={muted}>這個專案還沒有腳本。</div>}
      </details>
    </div>
  );
}
