"use client";

import { useEffect, useRef, useState } from "react";

type Cue = { startMs: number; endMs: number; text: string };
type Asset = { id: string; object_url: string; checksum_sha256?: string; metadata?: { title?: string; variantOf?: string; cleanUrl?: string; captionSource?: "script_tts" | "transcription"; captionSrt?: string; captionVtt?: string; captionCues?: Cue[] }; created_at: string; asset_domain: string; mime_type?: string };
type JobStatus = "idle" | "dispatched" | "polling" | "completed" | "failed";

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, borderRadius: 6, border: "1px solid var(--border-subtle)", background: "var(--card-bg)", color: "var(--text-primary)", fontSize: 12 };

/** V4.8: edit the script captions of one video and burn them again onto the caption-less video kept at render time. */
function CueEditor({ assetId, cues: initial }: { assetId: string; cues: Cue[] }) {
  const [texts, setTexts] = useState(initial.map((c) => c.text));
  const [state, setState] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [msg, setMsg] = useState("");
  const changed = texts.some((t, i) => t !== initial[i].text);

  async function reburn() {
    setState("running"); setMsg("");
    try {
      const res = await fetch("/api/video/captions/reburn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId, cues: initial.map((c, i) => ({ ...c, text: texts[i].trim() })) }) });
      const j = await res.json() as { ok: boolean; jobs?: { assetId: string; jobId: string }[]; error?: string };
      if (!res.ok || !j.ok || !j.jobs) throw new Error(j.error ?? "重燒提交失敗");
      const pending = new Set(j.jobs.map((x) => x.jobId));
      while (pending.size) {
        await new Promise((r) => setTimeout(r, 4000));
        for (const job of j.jobs) {
          if (!pending.has(job.jobId)) continue;
          const r = await fetch("/api/video/captions/reburn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: job.assetId, jobId: job.jobId }) });
          const p = await r.json() as { ok: boolean; status?: string; error?: string };
          if (!r.ok || !p.ok || p.status === "error") throw new Error(p.error ?? "重燒失敗");
          if (p.status === "done") pending.delete(job.jobId);
        }
      }
      setState("done");
    } catch (e) { setState("failed"); setMsg(e instanceof Error ? e.message : "重燒失敗"); }
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>逐句改字幕；改完按「重燒字幕」，每個比例都會重做（時間點不變）。</div>
      {initial.map((c, i) => (
        <input key={i} value={texts[i]} onChange={(e) => setTexts((t) => t.map((x, k) => (k === i ? e.target.value : x)))} disabled={state === "running"} style={field} aria-label={`字幕第 ${i + 1} 句`} />
      ))}
      <button type="button" disabled={!changed || state === "running" || texts.some((t) => !t.trim())} onClick={() => void reburn()}
        style={{ padding: "9px 14px", border: 0, borderRadius: 7, background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700, width: 160, cursor: changed && state !== "running" ? "pointer" : "not-allowed" }}>
        {state === "running" ? "重燒中…" : "重燒字幕"}
      </button>
      {state === "done" && <div style={{ fontSize: 12, color: "var(--text-primary)" }}>字幕已重燒，品質檢查已用新影片重跑。</div>}
      {state === "failed" && <div style={{ fontSize: 12, color: "var(--badge-red-text)" }}>{msg}</div>}
    </div>
  );
}

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
      .then((j: { items?: Asset[] }) => { if (!cancelled) setAssets((j.items ?? []).filter((a) => !a.metadata?.variantOf && (!a.mime_type || a.mime_type.startsWith("video/") || a.mime_type.startsWith("audio/")))); })
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

  // D11: the voice of a quick video / short drama is ours, so its captions already come from the script + voice timing
  // (burned into the video, SRT/VTT stored with it). Whisper is only for footage whose audio is a real recording.
  const picked = assets.find((a) => a.id === assetId);
  const scriptCaptions = picked?.metadata?.captionSource === "script_tts" ? picked.metadata : null;
  const dl = (text: string) => `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;

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
        {scriptCaptions && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-primary)" }}>
            <b>這支影片的字幕來自腳本和配音時間，已經燒在影片裡，不需要 Whisper。</b>
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              {scriptCaptions.captionSrt && <a href={dl(scriptCaptions.captionSrt)} download="captions.srt" style={{ color: "var(--accent-text)" }}>下載 SRT</a>}
              {scriptCaptions.captionVtt && <a href={dl(scriptCaptions.captionVtt)} download="captions.vtt" style={{ color: "var(--accent-text)" }}>下載 VTT</a>}
            </div>
            {scriptCaptions.captionCues?.length && scriptCaptions.cleanUrl ? <CueEditor key={assetId} assetId={assetId} cues={scriptCaptions.captionCues} /> : null}
          </div>
        )}
        <button type="button" disabled={!assetId || status !== "idle" || !!scriptCaptions} onClick={() => void dispatch()}
          style={{ marginTop: 10, padding: "9px 14px", border: 0, borderRadius: 7, background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700, cursor: assetId && status === "idle" && !scriptCaptions ? "pointer" : "not-allowed" }}>
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
