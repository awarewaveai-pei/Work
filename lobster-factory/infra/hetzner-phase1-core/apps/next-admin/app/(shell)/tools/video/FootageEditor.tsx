"use client";

import { useMemo, useState } from "react";

type Clip = {
  id: string;
  name: string;
  url: string;
  r2Key: string;
  inMs: number;
  outMs: number;
  destinationStartMs: number;
  durationMs: number;
};

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };
const input: React.CSSProperties = { border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "7px 8px", background: "var(--bg-subtle)", color: "var(--text-primary)", fontSize: 12 };

/** First-class real-footage editing surface. Uploads are isolated to the existing R2 asset route. */
export default function FootageEditor() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [frameRate, setFrameRate] = useState(30);

  const plan = useMemo(() => ({
    schemaVersion: "1.0.0",
    kind: "edit-decision-plan",
    frameRate,
    sources: clips.map((c) => ({ assetId: c.id, storageKey: c.r2Key, durationMs: c.durationMs, name: c.name })),
    decisions: clips.map((c) => ({ sourceAssetId: c.id, track: "video", inMs: c.inMs, outMs: c.outMs, destinationStartMs: c.destinationStartMs })),
  }), [clips, frameRate]);

  async function upload(file: File) {
    setBusy(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/video/upload-asset", { method: "POST", body: fd });
      const json = await res.json() as { ok: boolean; imageUrl?: string; r2Key?: string; error?: string };
      if (!res.ok || !json.ok || !json.imageUrl || !json.r2Key) throw new Error(json.error ?? "素材上傳失敗");
      const id = crypto.randomUUID();
      setClips((old) => [...old, { id, name: file.name, url: json.imageUrl!, r2Key: json.r2Key!, inMs: 0, outMs: 10_000, destinationStartMs: old.reduce((n, c) => Math.max(n, c.destinationStartMs + (c.outMs - c.inMs)), 0), durationMs: 10_000 }]);
    } catch (e) { setError(e instanceof Error ? e.message : "素材上傳失敗"); }
    finally { setBusy(false); }
  }

  function update(id: string, key: keyof Clip, value: string) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) return;
    setClips((old) => old.map((c) => c.id === id ? { ...c, [key]: n } : c));
  }

  async function copyPlan() {
    await navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  }

  return <div style={{ padding: "20px 28px", display: "grid", gap: 14 }}>
    <div>
      <b style={{ fontSize: 15 }}>實拍素材剪輯</b>
      <p style={{ margin: "4px 0", fontSize: 12, color: "var(--text-secondary)" }}>上傳短片、調整切點與輸出時間，產生可版本化的 Edit Decision Plan 草稿。</p>
    </div>
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 10 }}>
      <label style={{ padding: "8px 12px", borderRadius: 7, background: "var(--accent)", color: "var(--btn-primary-text)", fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
        {busy ? "上傳中…" : "＋ 匯入 MP4"}
        <input type="file" accept="video/mp4" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.currentTarget.value = ""; }} />
      </label>
      <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Frame rate <input type="number" min={1} max={120} value={frameRate} onChange={(e) => setFrameRate(Math.min(120, Math.max(1, Number(e.target.value) || 30)))} style={{ ...input, width: 64, marginLeft: 5 }} /></label>
    </div>
    {error && <div style={{ ...card, color: "var(--red)", fontSize: 12 }}>{error}</div>}
    {clips.length === 0 && <div style={{ ...card, color: "var(--text-muted)", fontSize: 12 }}>尚未匯入素材。檔案會沿用既有 magic-byte 檢查與 R2 暫存清理。</div>}
    {clips.map((c, i) => <div key={c.id} style={{ ...card, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 12 }}>{i + 1}. {c.name}</b><button type="button" onClick={() => setClips((old) => old.filter((x) => x.id !== c.id))} style={{ border: 0, background: "transparent", color: "var(--red)", cursor: "pointer", fontSize: 12 }}>移除</button></div>
      <video src={c.url} controls preload="metadata" style={{ width: "100%", maxHeight: 220, background: "#000", borderRadius: 6 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <label style={{ fontSize: 11 }}>入點 ms<input type="number" min={0} value={c.inMs} onChange={(e) => update(c.id, "inMs", e.target.value)} style={{ ...input, width: "100%", boxSizing: "border-box" }} /></label>
        <label style={{ fontSize: 11 }}>出點 ms<input type="number" min={1} value={c.outMs} onChange={(e) => update(c.id, "outMs", e.target.value)} style={{ ...input, width: "100%", boxSizing: "border-box" }} /></label>
        <label style={{ fontSize: 11 }}>輸出起點 ms<input type="number" min={0} value={c.destinationStartMs} onChange={(e) => update(c.id, "destinationStartMs", e.target.value)} style={{ ...input, width: "100%", boxSizing: "border-box" }} /></label>
      </div>
    </div>)}
    <div style={{ ...card, display: "flex", gap: 8, alignItems: "center" }}><button type="button" onClick={() => void copyPlan()} disabled={!clips.length} style={{ padding: "8px 12px", border: 0, borderRadius: 7, background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700, cursor: clips.length ? "pointer" : "not-allowed" }}>{copied ? "已複製" : "複製 EDP 草稿"}</button><span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{clips.length ? `${clips.length} 個素材；資產登錄後可送 Timeline／Remotion` : "匯入後會產生剪輯計畫"}</span></div>
  </div>;
}
