"use client";

import { useEffect, useState } from "react";
import { buttonStyle, cardStyle, optionStyle } from "@/components/tools/panel-primitives";
import { QA_LABELS, QA_HINTS, STATUS_TEXT, BLOCKED_NOTE, explainFinding } from "./qa-labels";

type Asset = { id: string; object_url: string; checksum_sha256?: string; metadata?: { title?: string; variantOf?: string }; created_at: string; asset_domain: string };
type QaFinding = { rule: string; severity: string; message: string; format?: string; evidence?: Record<string, number | string | null> };
type QaItem = { id: string; kind: string; status: string; candidateAssetId: string; candidateChecksum: string; profileId: string; profileVersion: string; findings?: QaFinding[] };

const card: React.CSSProperties = { ...cardStyle(), padding: 14 };

/**
 * 審片面板讀伺服器核發的四項報告；前進按鈕只在目前 checksum 的四項都過時亮起。
 * 發布 API 仍會重新驗證證據，畫面不取代伺服器的最終閘門。
 */
// initialAssetId: the one video to review (the workbench opens its own cut); includeWorkbench: workbench renders count as candidates too.
export default function QaStep({ organizationId, projectId, initialAssetId, includeWorkbench = false, onContinue }: { organizationId: string; projectId?: string; initialAssetId?: string; includeWorkbench?: boolean; onContinue: (candidateAssetId: string, candidateChecksum: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [checksum, setChecksum] = useState("");
  const [qaItems, setQaItems] = useState<QaItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const org = organizationId.trim();
    if (!org) { setAssets([]); return; }
    let cancelled = false;
    // Only this project's videos (main row per video; ratio rows are read through it), newest first; a named video is the only one listed; a project's first is preselected.
    fetch(`/api/video/assets?organizationId=${encodeURIComponent(org)}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}${includeWorkbench ? "&includeWorkbench=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { items?: Asset[] }) => {
        if (cancelled) return;
        const list = (j.items ?? []).filter((a) => !a.metadata?.variantOf && (!initialAssetId || a.id === initialAssetId));
        setAssets(list);
        if ((initialAssetId || projectId) && list[0]) void pick(list[0].id, list);
      })
      .catch(() => { if (!cancelled) setAssets([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, projectId]);

  async function pick(id: string, list: Asset[] = assets) {
    setAssetId(id);
    const asset = list.find((a) => a.id === id);
    const cs = asset?.checksum_sha256 ?? "";
    setChecksum(cs);
    setQaItems([]);
    if (!id || !organizationId.trim()) return;
    setLoading(true);
    if (cs.length >= 16 && cs.length <= 128) {
      await fetch("/api/video/qa/editorial-rights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: organizationId.trim(), candidateAssetId: id, candidateChecksum: cs }),
      }).catch(() => {});
    }
    const res = await fetch(`/api/video/qa/reports?organizationId=${encodeURIComponent(organizationId.trim())}&candidateAssetId=${encodeURIComponent(id)}`);
    const json = await res.json().catch(() => ({})) as { items?: QaItem[] };
    setQaItems(json.items ?? []);
    setLoading(false);
  }

  // qaItems 是新→舊排序：每個 kind 只留第一筆（最新）。
  const byKind = new Map<string, QaItem>();
  for (const q of qaItems) if (!byKind.has(q.kind)) byKind.set(q.kind, q);
  const allPassed = Object.keys(QA_LABELS).every((kind) => byKind.get(kind)?.status === "passed" && byKind.get(kind)?.candidateChecksum === checksum);

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>審片 · 四項檢查</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>選候選素材，查看伺服器端已核發的檢查證據。</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 11 }}>候選影片／實拍資產</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>{assets.length ? "選擇影片素材" : organizationId ? "這個客戶還沒有素材" : "先選客戶"}</div>
        {assets.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
            {assets.map((a) => <button key={a.id} type="button" aria-pressed={assetId === a.id} onClick={() => void pick(a.id)} style={optionStyle(assetId === a.id)}>{a.metadata?.title ?? a.asset_domain} · {new Date(a.created_at).toLocaleString()}</button>)}
          </div>
        )}
      </div>

      {assetId && (
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          {loading ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>載入中…</span> : Object.entries(QA_LABELS).map(([kind, label]) => {
            const item = byKind.get(kind);
            const status = item?.status ?? "missing";
            const color = status === "passed" ? "var(--green)" : status === "missing" ? "var(--text-muted)" : "var(--red)";
            const bg = status === "passed" ? "var(--badge-green-bg)" : status === "missing" ? "var(--bg-subtle)" : "var(--badge-red-bg)";
            const findings = status === "warned" || status === "failed" ? item?.findings ?? [] : [];
            return (
              <div key={kind} style={{ background: bg, border: `1px solid ${color}`, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color }}>{label}</div>
                <div style={{ fontSize: 10, color, marginTop: 2 }}>{STATUS_TEXT[status] ?? status}</div>
                <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>{QA_HINTS[kind]}</div>
                {findings.map((f, i) => (
                  <div key={i} style={{ fontSize: 10, color, marginTop: 2, textAlign: "left" }}>
                    {f.format ? `[${f.format}] ` : ""}{explainFinding(f)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>這些檢查報告不會出現在影片裡；四項都通過才能核准發布。</div>

      <button type="button" onClick={() => onContinue(assetId, checksum)} disabled={!assetId || !allPassed}
        style={{ ...buttonStyle({ tone: "primary", disabled: !assetId || !allPassed }), width: 200 }}>
        繼續到發布 →
      </button>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{BLOCKED_NOTE}核准發布前會再確認一次。</div>
    </div>
  );
}
