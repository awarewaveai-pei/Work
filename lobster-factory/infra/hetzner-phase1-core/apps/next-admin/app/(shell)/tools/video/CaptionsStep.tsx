"use client";

import { useEffect, useRef, useState } from "react";

type Asset = { id: string; object_url: string; checksum_sha256?: string; metadata?: { title?: string }; created_at: string; asset_domain: string; mime_type?: string };
type JobStatus = "idle" | "dispatched" | "polling" | "completed" | "failed";

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", color: "var(--text-primary)", fontSize: 12 };

/**
 * ⑦ 配音與 Whisper 字幕。配音已經在④生成時做完（TTS 烤進影片）；這步只做「選擇性」字幕：
 * 送去 /api/video/transcription/dispatch（GPU worker 真跑 Whisper）→ 輪詢
 * /api/video/transcription/status（今天新增，之前完全沒有讀取路徑）→ 完成後給 SRT/VTT 連結。
 * 可略過——不是每支影片都要字幕。
 */
export default function CaptionsStep({ organizationId, onContinue }: { organizationId: string; onContinue: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [status, setStatus] = useState<JobStatus>("idle");
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState("");
  const [artifacts, setArtifacts] = useState<Record<string, { object_url?: string } | undefined> | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // pollRef 的 cleanup 只清得掉「已排程」的 timeout；若卸載當下有一個 fetch 正在飛行中，它的
  // .then()/.catch() 還是會在卸載後觸發、排出下一顆 timeout，卸載時的 cleanup 已經跑完抓不到它，
  // 導致輪詢永遠停不了。用這個 ref 讓 poll() 的每個非同步分支卸載後直接跳過，不再繼續排程。
  const unmountedRef = useRef(false);
  useEffect(() => () => { unmountedRef.current = true; }, []);

  useEffect(() => {
    const org = organizationId.trim();
    if (!org) { setAssets([]); return; }
    let cancelled = false;
    fetch(`/api/video/assets?organizationId=${encodeURIComponent(org)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { items?: Asset[] }) => { if (!cancelled) setAssets((j.items ?? []).filter((a) => !a.mime_type || a.mime_type.startsWith("video/") || a.mime_type.startsWith("audio/"))); })
      .catch(() => { if (!cancelled) setAssets([]); });
    return () => { cancelled = true; };
  }, [organizationId]);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  function poll(id: string) {
    fetch(`/api/video/transcription/status?jobId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; status?: string; artifacts?: Record<string, { object_url?: string }>; error?: string }) => {
        if (unmountedRef.current) return;
        if (!j.ok) { setStatus("failed"); setError(j.error ?? "查詢失敗"); return; }
        if (j.status === "completed") { setStatus("completed"); setArtifacts(j.artifacts ?? null); return; }
        if (j.status === "failed") { setStatus("failed"); setError("Whisper 轉錄失敗"); return; }
        pollRef.current = setTimeout(() => poll(id), 4000);
      })
      .catch(() => { if (!unmountedRef.current) pollRef.current = setTimeout(() => poll(id), 6000); });
  }

  async function dispatch() {
    setError(""); setStatus("dispatched");
    try {
      const res = await fetch("/api/video/transcription/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAssetId: assetId }),
      });
      const json = await res.json() as { ok: boolean; jobId?: string; error?: string };
      if (!res.ok || !json.ok || !json.jobId) throw new Error(json.error ?? "轉錄提交失敗");
      setJobId(json.jobId);
      setStatus("polling");
      poll(json.jobId);
    } catch (e) {
      setStatus("failed");
      setError(e instanceof Error ? e.message : "轉錄提交失敗");
    }
  }

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>⑦ 配音與 Whisper 字幕</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
          配音已經在生成階段做完、烤進影片了。這步是選擇性的 Whisper 字幕（SRT／VTT）——可以略過。
        </div>
      </div>

      <div style={card}>
        <label style={{ fontSize: 11 }}>選擇要轉錄的影片素材
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} style={{ ...field, marginTop: 5 }} disabled={status !== "idle"}>
            <option value="">{assets.length ? "選擇素材" : organizationId ? "此租戶尚無素材" : "先選租戶"}</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.metadata?.title ?? a.asset_domain} · {new Date(a.created_at).toLocaleString()} · {a.id.slice(0, 8)}</option>)}
          </select>
        </label>
        <button type="button" disabled={!assetId || status !== "idle"} onClick={() => void dispatch()}
          style={{ marginTop: 10, padding: "9px 14px", border: 0, borderRadius: 7, background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700, cursor: assetId && status === "idle" ? "pointer" : "not-allowed" }}>
          產生字幕（Whisper）
        </button>
      </div>

      {(status === "dispatched" || status === "polling") && (
        <div style={{ ...card, fontSize: 12, color: "var(--text-secondary)" }}>
          Job {jobId || "建立中…"}：GPU worker 轉錄中，通常需要幾分鐘（依影片長度）。
        </div>
      )}

      {status === "completed" && (
        <div style={{ border: "1px solid var(--green)", background: "var(--intake-success-bg)", borderRadius: 8, padding: 12, fontSize: 12 }}>
          <b>字幕已產生</b>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            {artifacts?.srt?.object_url && <a href={artifacts.srt.object_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)" }}>下載 SRT</a>}
            {artifacts?.vtt?.object_url && <a href={artifacts.vtt.object_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-text)" }}>下載 VTT</a>}
          </div>
        </div>
      )}

      {status === "failed" && (
        <div style={{ border: "1px solid var(--red)", background: "var(--badge-red-bg)", borderRadius: 8, padding: 12, fontSize: 12, color: "var(--badge-red-text)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={onContinue}
          style={{ padding: "12px 0", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700, fontSize: 14, cursor: "pointer", width: 160 }}>
          {status === "completed" ? "繼續 →" : "略過，繼續 →"}
        </button>
      </div>
    </div>
  );
}
