"use client";

import { useEffect, useState } from "react";

type Asset = { id: string; object_url: string; checksum_sha256?: string; metadata?: { title?: string }; created_at: string; asset_domain: string };
type QaItem = { id: string; kind: string; status: string; candidateAssetId: string; candidateChecksum: string; profileId: string; profileVersion: string };

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", color: "var(--text-primary)", fontSize: 12 };
const QA_LABELS: Record<string, string> = { technical: "技術 QA", caption: "字幕 QA", editorial: "編輯 QA", rights: "版權 QA" };

/**
 * ⑧ 技術 QA + 編輯 QA——之前這些證據被埋在 Release 表單裡的一個唯讀 <pre> 區塊；
 * 現在拉出來當自己的可見步驟。不在這裡硬擋下一步：Release（⑨）本身在 API 層對每個
 * candidate 都會重新驗證同一份證據，這裡重複硬擋只是同一個檢查做兩次、還可能不同步。
 */
export default function QaStep({ organizationId, onContinue }: { organizationId: string; onContinue: (candidateAssetId: string, candidateChecksum: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [checksum, setChecksum] = useState("");
  const [qaItems, setQaItems] = useState<QaItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const org = organizationId.trim();
    if (!org) { setAssets([]); return; }
    let cancelled = false;
    fetch(`/api/video/assets?organizationId=${encodeURIComponent(org)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { items?: Asset[] }) => { if (!cancelled) setAssets(j.items ?? []); })
      .catch(() => { if (!cancelled) setAssets([]); });
    return () => { cancelled = true; };
  }, [organizationId]);

  async function pick(id: string) {
    setAssetId(id);
    const asset = assets.find((a) => a.id === id);
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

  const byKind = new Map(qaItems.map((q) => [q.kind, q]));

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>⑧ 技術 QA + 編輯 QA</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>選候選素材，查看伺服器端已核發的 QA 證據。</div>
      </div>

      <div style={card}>
        <label style={{ fontSize: 11 }}>候選影片／實拍資產
          <select value={assetId} onChange={(e) => void pick(e.target.value)} style={{ ...field, marginTop: 5 }} disabled={!assets.length}>
            <option value="">{assets.length ? "選擇 media_assets" : organizationId ? "此租戶尚無素材" : "先選租戶"}</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.metadata?.title ?? a.asset_domain} · {new Date(a.created_at).toLocaleString()} · {a.id.slice(0, 8)}</option>)}
          </select>
        </label>
      </div>

      {assetId && (
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          {loading ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>載入中…</span> : Object.entries(QA_LABELS).map(([kind, label]) => {
            const item = byKind.get(kind);
            const status = item?.status ?? "missing";
            const color = status === "passed" ? "var(--green)" : status === "missing" ? "var(--text-muted)" : "var(--red)";
            const bg = status === "passed" ? "var(--badge-green-bg)" : status === "missing" ? "var(--bg-subtle)" : "var(--badge-red-bg)";
            return (
              <div key={kind} style={{ background: bg, border: `1px solid ${color}`, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color }}>{label}</div>
                <div style={{ fontSize: 10, color, marginTop: 2 }}>{status === "passed" ? "✓ 通過" : status === "missing" ? "尚無證據" : status}</div>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={() => onContinue(assetId, checksum)} disabled={!assetId}
        style={{ padding: "12px 0", borderRadius: 8, border: "none", background: assetId ? "var(--accent)" : "var(--border-subtle)", color: assetId ? "var(--btn-primary-text)" : "var(--text-muted)", fontWeight: 700, fontSize: 14, cursor: assetId ? "pointer" : "not-allowed", width: 200 }}>
        繼續到 Release →
      </button>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>未通過的項目 Release 步驟會擋下——那裡的閘是最終依據，這裡只是先給你看。</div>
    </div>
  );
}
