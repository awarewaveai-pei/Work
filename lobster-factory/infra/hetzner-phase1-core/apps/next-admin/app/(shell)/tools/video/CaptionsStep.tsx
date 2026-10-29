"use client";

import { useEffect, useRef, useState } from "react";

type Cue = { startMs: number; endMs: number; text: string };
type Asset = { id: string; object_url: string; byte_size?: number | null; checksum_sha256?: string; metadata?: { title?: string; variantOf?: string; cleanUrl?: string; captionSource?: "script_tts" | "transcription"; captionSrt?: string; captionVtt?: string; captionCues?: Cue[] }; created_at: string; asset_domain: string; mime_type?: string };
type JobStatus = "idle" | "dispatched" | "polling" | "completed" | "failed";
type Engine = "host" | "openai";
type Options = { hostReady: boolean; openAiReady: boolean; externalAllowed: boolean; canChangeSetting: boolean; hostRealtimeFactor: number; openAiMaxBytes: number; openAiUsdPerMin: number; twdRate: number };
type JobInfo = { engine: Engine; fallbackFrom: string | null; costUsd: number };

const ENGINE_LABEL: Record<Engine, string> = { host: "主機", openai: "OpenAI" };
function fmtDuration(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}
function fmtWait(sec: number): string {
  return sec < 60 ? `約 ${Math.max(5, Math.round(sec / 5) * 5)} 秒` : `約 ${Math.ceil(sec / 60)} 分鐘`;
}

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
      const j = await res.json().catch(() => ({})) as { ok?: boolean; jobs?: { assetId: string; jobId: string }[]; error?: string };
      if (!res.ok || !j.ok || !j.jobs) throw new Error(j.error ?? `重燒提交失敗（HTTP ${res.status}）`);
      const pending = new Set(j.jobs.map((x) => x.jobId));
      while (pending.size) {
        await new Promise((r) => setTimeout(r, 4000));
        for (const job of j.jobs) {
          if (!pending.has(job.jobId)) continue;
          const r = await fetch("/api/video/captions/reburn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: job.assetId, jobId: job.jobId }) });
          const p = await r.json().catch(() => ({})) as { ok?: boolean; status?: string; error?: string };
          if (!r.ok || !p.ok || p.status === "error") throw new Error(p.error ?? `重燒失敗（HTTP ${r.status}）`);
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
      {state === "failed" && <div role="alert" style={{ border: "1px solid var(--red)", background: "var(--badge-red-bg)", borderRadius: 8, padding: 10, fontSize: 12, color: "var(--badge-red-text)" }}>重燒字幕失敗：{msg}</div>}
    </div>
  );
}

const DISPATCH_ERRORS: Record<string, string> = {
  transcription_worker_not_configured: "主機轉錄還沒設定好",
  transcription_worker_unreachable: "主機轉錄服務連不上，可以改用 OpenAI",
  openai_not_configured: "OpenAI 金鑰沒有設定",
  client_keeps_audio_in_house: "這個客戶設定音檔不可外送",
  source_over_25mb: "檔案超過 25MB，只能用主機轉錄",
};

/** The two engines side by side, each with its time (and price) worked out before anyone clicks. */
function EngineChoice({ options, picked, durationSec, busy, onPick, savingSetting, onSetting }: {
  options: Options | null; picked: Asset; durationSec: number | null; busy: boolean;
  onPick: (engine: Engine) => void; savingSetting: boolean; onSetting: (externalAllowed: boolean) => void;
}) {
  if (!options) return <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>正在確認轉錄服務…</div>;
  const tooBig = (picked.byte_size ?? 0) > options.openAiMaxBytes;
  const hostWait = durationSec ? fmtWait(durationSec / options.hostRealtimeFactor) : "";
  const openAiNtd = durationSec ? (durationSec / 60) * options.openAiUsdPerMin * options.twdRate : null;
  const hostReason = !options.hostReady ? "主機轉錄服務現在連不上" : "";
  const openAiReason = !options.openAiReady ? "OpenAI 金鑰沒有設定" : tooBig ? "檔案超過 25MB，只能用主機" : "";
  const btn = (enabled: boolean, primary: boolean): React.CSSProperties => ({
    flex: "1 1 220px", padding: "10px 14px", borderRadius: 7, fontWeight: 700, fontSize: 13, textAlign: "left",
    border: primary ? 0 : "1px solid var(--border-subtle)", background: primary ? "var(--accent)" : "var(--card-bg)",
    color: primary ? "var(--btn-primary-text)" : "var(--text-primary)", opacity: enabled ? 1 : 0.5, cursor: enabled ? "pointer" : "not-allowed",
  });
  const hostOk = options.hostReady && !busy;
  const openAiOk = options.externalAllowed && options.openAiReady && !tooBig && !busy;
  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      {durationSec ? <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>這支影片長 {fmtDuration(durationSec)}</div> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" disabled={!hostOk} onClick={() => onPick("host")} style={btn(hostOk, true)}>
          免費轉錄（主機）{hostWait ? `・${hostWait}` : ""}
          {hostReason && <div style={{ fontSize: 11, fontWeight: 400, marginTop: 3 }}>{hostReason}</div>}
        </button>
        {options.externalAllowed && (
          <button type="button" disabled={!openAiOk} onClick={() => onPick("openai")} style={btn(openAiOk, false)}>
            快速轉錄（OpenAI）{openAiNtd !== null ? `・約 NT$${Math.max(0.1, openAiNtd).toFixed(1)}` : ""}
            {openAiReason && <div style={{ fontSize: 11, fontWeight: 400, marginTop: 3 }}>{openAiReason}</div>}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
        {options.externalAllowed ? "快速轉錄會把音檔送到 OpenAI；失敗會自動改用主機。" : "這個客戶設定音檔不可外送，只能用主機轉錄。"}
      </div>
      {options.canChangeSetting && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={!options.externalAllowed} disabled={savingSetting} onChange={(e) => onSetting(!e.target.checked)} />
          這個客戶的音檔不可送到外部 AI（記在客戶設定）
        </label>
      )}
    </div>
  );
}

/**
 * ⑦ 配音與字幕。腳本做的影片字幕已燒在影片裡；真人錄音的影片才轉錄，兩條路並排（lib/content/video/transcription.ts）：
 * 主機 Whisper（免費、較慢）或 OpenAI（快、按分鐘計費，客戶設定可關）。OpenAI 失敗由伺服器自動改走主機。
 * 時間與價格用瀏覽器讀到的影片長度先算好再給人按；重開頁面會接回這支影片最近一次的轉錄。
 */
export default function CaptionsStep({ organizationId, projectId, onContinue }: { organizationId: string; projectId?: string; onContinue: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [status, setStatus] = useState<JobStatus>("idle");
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState("");
  const [artifacts, setArtifacts] = useState<Record<string, { object_url?: string } | undefined> | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [jobInfo, setJobInfo] = useState<JobInfo | null>(null);
  const [savingSetting, setSavingSetting] = useState(false);
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
    fetch(`/api/video/assets?organizationId=${encodeURIComponent(org)}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { items?: Asset[] }) => {
        if (cancelled) return;
        const list = (j.items ?? []).filter((a) => !a.metadata?.variantOf && (!a.mime_type || a.mime_type.startsWith("video/") || a.mime_type.startsWith("audio/")));
        setAssets(list);
        if (projectId && list[0]) setAssetId(list[0].id);
      })
      .catch(() => { if (!cancelled) setAssets([]); });
    return () => { cancelled = true; };
  }, [organizationId, projectId]);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  useEffect(() => {
    const org = organizationId.trim();
    if (!org) { setOptions(null); return; }
    let cancelled = false;
    fetch(`/api/video/transcription/options?organizationId=${encodeURIComponent(org)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Options & { ok: boolean }) => { if (!cancelled && j.ok) setOptions(j); })
      .catch(() => { if (!cancelled) setOptions(null); });
    return () => { cancelled = true; };
  }, [organizationId]);

  const picked = assets.find((a) => a.id === assetId);

  // A new video: read its length for the estimates, and pick up its latest transcription (a job that kept
  // running after the page closed, or one already finished).
  useEffect(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setStatus("idle"); setJobId(""); setError(""); setArtifacts(null); setJobInfo(null); setDurationSec(null);
    if (!picked || picked.metadata?.captionSource === "script_tts") return;
    let cancelled = false;
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => { if (!cancelled && Number.isFinite(probe.duration)) setDurationSec(probe.duration); };
    probe.src = picked.object_url;
    fetch(`/api/video/transcription/status?sourceAssetId=${encodeURIComponent(picked.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; jobId?: string; status?: string } | null) => {
        if (!cancelled && j?.ok && j.jobId && (j.status === "dispatched" || j.status === "completed")) poll(j.jobId);
      })
      .catch(() => {});
    return () => { cancelled = true; probe.removeAttribute("src"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per video only
  }, [picked?.id]);

  function poll(id: string) {
    fetch(`/api/video/transcription/status?jobId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; status?: string; engine?: Engine; fallbackFrom?: string | null; costUsd?: number; artifacts?: Record<string, { object_url?: string }>; error?: string }) => {
        if (unmountedRef.current) return;
        if (!j.ok) { setStatus("failed"); setError(j.error ?? "查詢失敗"); return; }
        setJobId(id);
        setJobInfo({ engine: j.engine ?? "host", fallbackFrom: j.fallbackFrom ?? null, costUsd: j.costUsd ?? 0 });
        if (j.status === "completed") { setStatus("completed"); setArtifacts(j.artifacts ?? null); return; }
        if (j.status === "failed") { setStatus("failed"); setError("轉錄失敗，可以再按一次，或改用另一條路"); return; }
        setStatus("polling");
        pollRef.current = setTimeout(() => poll(id), 4000);
      })
      .catch(() => { if (!unmountedRef.current) pollRef.current = setTimeout(() => poll(id), 6000); });
  }

  async function dispatch(engine: Engine) {
    setError(""); setStatus("dispatched"); setJobInfo({ engine, fallbackFrom: null, costUsd: 0 });
    try {
      const res = await fetch("/api/video/transcription/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceAssetId: assetId, engine }),
      });
      const json = await res.json() as { ok: boolean; jobId?: string; error?: string };
      if (!res.ok || !json.ok || !json.jobId) throw new Error(DISPATCH_ERRORS[json.error ?? ""] ?? json.error ?? "轉錄提交失敗");
      setJobId(json.jobId);
      setStatus("polling");
      poll(json.jobId);
    } catch (e) {
      setStatus("failed");
      setError(e instanceof Error ? e.message : "轉錄提交失敗");
    }
  }

  async function setExternalAllowed(value: boolean) {
    setSavingSetting(true);
    try {
      const res = await fetch("/api/video/transcription/options", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, externalAllowed: value }) });
      const j = await res.json().catch(() => ({})) as { ok?: boolean };
      if (res.ok && j.ok) setOptions((o) => (o ? { ...o, externalAllowed: value } : o));
      else setError("客戶設定沒有存成功");
    } finally { setSavingSetting(false); }
  }

  // D11: the voice of a quick video / short drama is ours, so its captions already come from the script + voice timing
  // (burned into the video, SRT/VTT stored with it). Whisper is only for footage whose audio is a real recording.
  const scriptCaptions = picked?.metadata?.captionSource === "script_tts" ? picked.metadata : null;
  const dl = (text: string) => `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>⑦ 配音與字幕</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
          {scriptCaptions
            ? "配音和字幕都已經在生成階段做完、烤進影片了。下面可以逐句改字幕，或直接繼續。"
            : "真人錄音的影片可以在這裡轉成字幕（SRT／VTT）。不需要字幕就直接繼續。"}
        </div>
      </div>

      <div style={card}>
        <label style={{ fontSize: 11 }}>選擇要轉錄的影片素材
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} style={{ ...field, marginTop: 5 }} disabled={status === "dispatched" || status === "polling"}>
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
        {!scriptCaptions && picked && (
          <EngineChoice options={options} picked={picked} durationSec={durationSec} busy={status === "dispatched" || status === "polling"}
            onPick={(engine) => void dispatch(engine)} savingSetting={savingSetting} onSetting={(v) => void setExternalAllowed(v)} />
        )}
      </div>

      {(status === "dispatched" || status === "polling") && (
        <div style={{ ...card, fontSize: 12, color: "var(--text-secondary)" }}>
          {jobInfo?.fallbackFrom ? "OpenAI 沒有成功，已自動改用主機轉錄" : `用${ENGINE_LABEL[jobInfo?.engine ?? "host"]}轉錄中`}
          {durationSec && options ? `，${fmtWait(jobInfo?.engine === "openai" ? Math.max(10, durationSec / 10) : durationSec / options.hostRealtimeFactor)}` : ""}。關掉頁面也會繼續，回來會接上。
          {jobId ? <span style={{ opacity: 0.6 }}>（{jobId.slice(0, 8)}）</span> : null}
        </div>
      )}

      {status === "completed" && (
        <div style={{ border: "1px solid var(--green)", background: "var(--intake-success-bg)", borderRadius: 8, padding: 12, fontSize: 12 }}>
          <b>字幕已產生</b>
          {jobInfo && (
            <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
              用{ENGINE_LABEL[jobInfo.engine]}轉錄{jobInfo.fallbackFrom ? "（OpenAI 沒有成功，自動改用主機）" : ""}
              {jobInfo.costUsd > 0 && options ? `，花費約 NT$${(jobInfo.costUsd * options.twdRate).toFixed(1)}` : "，免費"}
            </div>
          )}
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
          {status === "completed" || scriptCaptions ? "繼續 →" : "略過，繼續 →"}
        </button>
      </div>
    </div>
  );
}
