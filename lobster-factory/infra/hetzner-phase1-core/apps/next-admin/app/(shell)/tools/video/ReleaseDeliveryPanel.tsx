"use client";

import { useEffect, useState } from "react";

const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--bg-subtle)", color: "var(--text-primary)", fontFamily: "ui-monospace, monospace", fontSize: 11 };
const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14, display: "grid", gap: 9 };

/** Explicit Release gate and delivery receipts. No destination call happens before approval. */
export default function ReleaseDeliveryPanel() {
  const [organizationId, setOrganizationId] = useState("");
  const [candidateAssetId, setCandidateAssetId] = useState("");
  const [candidateChecksum, setCandidateChecksum] = useState("");
  const [reports, setReports] = useState("[]");
  const [releaseId, setReleaseId] = useState("");
  const [videoUrls, setVideoUrls] = useState('{"16x9":""}');
  const [platforms, setPlatforms] = useState('[{"platform":"youtube","content":""}]');
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [postId, setPostId] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState<Array<{ id: string; object_url: string; checksum_sha256?: string; metadata?: { title?: string }; created_at: string; asset_domain: string }>>([]);
  const [qaItems, setQaItems] = useState<Array<{ id: string; kind: string; status: string; candidateAssetId: string; candidateChecksum: string; profileId: string; profileVersion: string }>>([]);
  const [loadingPickers, setLoadingPickers] = useState(false);

  useEffect(() => {
    const org = organizationId.trim();
    if (!org) { setAssets([]); setQaItems([]); return; }
    let cancelled = false;
    setLoadingPickers(true);
    void fetch(`/api/video/assets?organizationId=${encodeURIComponent(org)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("素材清單讀取失敗")))
      .then((json: { items?: typeof assets }) => { if (!cancelled) setAssets(json.items ?? []); })
      .catch(() => { if (!cancelled) setAssets([]); })
      .finally(() => { if (!cancelled) setLoadingPickers(false); });
    return () => { cancelled = true; };
  }, [organizationId]);

  async function chooseAsset(assetId: string) {
    setCandidateAssetId(assetId);
    const asset = assets.find((item) => item.id === assetId);
    setCandidateChecksum(asset?.checksum_sha256 ?? "");
    setQaItems([]); setReports("[]");
    if (!assetId || !organizationId.trim()) return;
    const checksum = asset?.checksum_sha256 ?? "";
    if (checksum.length >= 16 && checksum.length <= 128) {
      // Selecting a candidate is the single explicit trigger for deterministic
      // editorial/rights QA; the API derives evidence from tenant-owned metadata.
      await fetch("/api/video/qa/editorial-rights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: organizationId.trim(), candidateAssetId: assetId, candidateChecksum: checksum }),
      });
    }
    const res = await fetch(`/api/video/qa/reports?organizationId=${encodeURIComponent(organizationId.trim())}&candidateAssetId=${encodeURIComponent(assetId)}`);
    const json = await res.json().catch(() => ({})) as { items?: typeof qaItems };
    if (!res.ok) return;
    const items = json.items ?? [];
    setQaItems(items);
    setReports(JSON.stringify(items.map((item) => ({ id: item.id, kind: item.kind, status: item.status, candidateAssetId: item.candidateAssetId, candidateChecksum: item.candidateChecksum, profileId: item.profileId, profileVersion: item.profileVersion })), null, 2));
  }

  async function call(path: string, body: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(String(json.error ?? json.message ?? `HTTP ${res.status}`));
      setMessage(`${path} 完成：${JSON.stringify(json)}`);
      return json as Record<string, unknown>;
    } catch (e) { setMessage(e instanceof Error ? e.message : "操作失敗"); return null; }
    finally { setBusy(false); }
  }
  async function createRelease() {
    let parsedReports: unknown;
    try { parsedReports = JSON.parse(reports); } catch { setMessage("QA reports 必須是 JSON 陣列"); return; }
    const result = await call("/api/video/release", { organizationId: organizationId.trim(), candidateAssetId: candidateAssetId.trim(), candidateChecksum: candidateChecksum.trim(), requiredKinds: ["technical", "caption", "editorial", "rights"], reports: parsedReports });
    const release = result?.release as Record<string, unknown> | undefined;
    if (typeof release?.id === "string") setReleaseId(release.id);
  }
  async function publishSocial() {
    let parsedPlatforms: unknown, parsedVideoUrls: unknown;
    try { parsedPlatforms = JSON.parse(platforms); parsedVideoUrls = JSON.parse(videoUrls); } catch { setMessage("社群欄位必須是 JSON"); return; }
    await call("/api/content/social-publish", { clientId: clientId.trim() || organizationId.trim(), mode: "draft", platforms: parsedPlatforms, videoUrls: parsedVideoUrls, releaseId: releaseId.trim(), variant: "default" });
  }
  async function embedWordPress() {
    const parsedPostId = Number(postId);
    if (!Number.isInteger(parsedPostId) || parsedPostId <= 0) { setMessage("WordPress postId 必須是正整數"); return; }
    await call("/api/video/embed-to-wp", { siteId: siteId.trim(), postId: parsedPostId, videoUrl: videoUrl.trim(), releaseId: releaseId.trim(), variant: "default" });
  }
  return <div style={{ padding: "20px 28px", display: "grid", gap: 14 }}>
    <div><b style={{ fontSize: 15 }}>Release 與交付</b><p style={{ margin: "4px 0", fontSize: 12, color: "var(--text-secondary)" }}>先通過四類 QA 建立 Release，再把同一個 releaseId 交給 Postiz 或 WordPress receipt adapter。</p></div>
    <section style={card}><b>1. 建立 Release（硬閘）</b><label style={{ fontSize: 11 }}>Organization UUID<input value={organizationId} onChange={e => { setOrganizationId(e.target.value); setCandidateAssetId(""); setCandidateChecksum(""); setReports("[]"); }} style={field} /></label><label style={{ fontSize: 11 }}>候選影片／實拍資產<select value={candidateAssetId} onChange={e => void chooseAsset(e.target.value)} style={{ ...field, fontFamily: "inherit" }} disabled={!assets.length}><option value="">{loadingPickers ? "讀取素材中…" : assets.length ? "選擇 media_assets" : "先輸入有效 organization UUID"}</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.metadata?.title ?? asset.asset_domain} · {new Date(asset.created_at).toLocaleString()} · {asset.id.slice(0, 8)}</option>)}</select></label><label style={{ fontSize: 11 }}>候選 SHA-256<input value={candidateChecksum} readOnly placeholder="選擇資產後自動帶入" style={field} /></label><label style={{ fontSize: 11 }}>已通過的 QA reports（自動從資產載入，可展開檢視）<textarea value={reports} onChange={e => setReports(e.target.value)} rows={5} style={field} /><span style={{ display: "block", marginTop: 4, color: "var(--text-secondary)" }}>{qaItems.length ? `已載入 ${qaItems.length} 筆 immutable QA；Release 仍要求 technical/caption/editorial/rights 四類。` : "選擇資產後會載入通過或警告的 QA 證據。"}</span></label><button type="button" disabled={busy} onClick={() => void createRelease()} style={{ width: "fit-content", padding: "8px 12px", border: 0, borderRadius: 7, background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700 }}>建立 approved Release</button>{releaseId && <div style={{ fontSize: 11, color: "var(--green)", wordBreak: "break-all" }}>Release ID：{releaseId}</div>}</section>
    <section style={card}><b>2. Postiz 社群草稿</b><label style={{ fontSize: 11 }}>Client/Organization UUID<input value={clientId} onChange={e => setClientId(e.target.value)} placeholder={organizationId} style={field} /></label><label style={{ fontSize: 11 }}>平台貼文 JSON<textarea value={platforms} onChange={e => setPlatforms(e.target.value)} rows={3} style={field} /></label><label style={{ fontSize: 11 }}>影片 URL map JSON<textarea value={videoUrls} onChange={e => setVideoUrls(e.target.value)} rows={2} style={field} /></label><button type="button" disabled={busy || !releaseId} onClick={() => void publishSocial()} style={{ width: "fit-content", padding: "8px 12px", border: 0, borderRadius: 7, background: "var(--green)", color: "#fff", fontWeight: 700 }}>送 Postiz 草稿</button></section>
    <section style={card}><b>3. WordPress 內嵌</b><label style={{ fontSize: 11 }}>Site ID<input value={siteId} onChange={e => setSiteId(e.target.value)} style={field} /></label><label style={{ fontSize: 11 }}>Post ID<input value={postId} onChange={e => setPostId(e.target.value)} style={field} /></label><label style={{ fontSize: 11 }}>成片 HTTPS URL<input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} style={field} /></label><button type="button" disabled={busy || !releaseId} onClick={() => void embedWordPress()} style={{ width: "fit-content", padding: "8px 12px", border: 0, borderRadius: 7, background: "var(--green)", color: "#fff", fontWeight: 700 }}>寫入 WordPress</button></section>
    {message && <pre style={{ ...card, whiteSpace: "pre-wrap", fontSize: 11, color: message.includes("完成") ? "var(--green)" : "var(--red)" }}>{message}</pre>}
  </div>;
}
