"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VIDEO_PIPELINE_STEPS, computeVideoCost } from "@/lib/content/video/video-cost";
import { IMAGE_RATES, DEFAULT_IMAGE_MODEL } from "@/lib/ai/cost-model";
import { usdToNtd } from "@/lib/ai/cost-calculator";
import type { VideoHistoryItem } from "@/app/api/video/history/route";

// ─── Formatters ───────────────────────────────────────────────────────────────

const NT = (usd: number) => {
  const n = usdToNtd(usd);
  return `NT$${n.toLocaleString("zh-TW", { maximumFractionDigits: n < 1 ? 4 : n < 100 ? 2 : 0 })}`;
};
const USD = (usd: number) =>
  `$${usd.toLocaleString("en-US", { maximumFractionDigits: usd < 0.01 ? 4 : 2 })}`;

// ─── Types ────────────────────────────────────────────────────────────────────

type GenStatus = "idle" | "loading" | "done" | "error";

interface VideoOutputs {
  outputs: Record<string, string>;
  out_dir: string;
  title: string;
}

// ─── Output format label map ──────────────────────────────────────────────────

const OUTPUT_LABELS: Record<string, { label: string; ratio: string; icon: string }> = {
  youtube_linkedin: { label: "YouTube / LinkedIn", ratio: "16:9", icon: "▶" },
  tiktok_reels:    { label: "TikTok / Reels",     ratio: "9:16",  icon: "📱" },
  instagram_facebook: { label: "Instagram / Facebook", ratio: "1:1", icon: "📷" },
  twitter_reddit_bluesky: { label: "Twitter / Reddit / Bluesky", ratio: "16:9 短版", icon: "🐦" },
};

// ─── Pipeline step descriptions (for progress tracker) ────────────────────────

const PROGRESS_STEPS = [
  { key: "script",  label: "腳本生成",      match: "腳本" },
  { key: "assets",  label: "素材生成",      match: "素材" },
  { key: "submit",  label: "提交渲染",      match: "提交" },
  { key: "render",  label: "TTS + ffmpeg",  match: "TTS" },
  { key: "done",    label: "完成",          match: "__done__" },
];

function getCurrentStepIndex(step: string): number {
  const idx = PROGRESS_STEPS.findIndex((s) => step.includes(s.match));
  return idx >= 0 ? idx : 0;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VideoStudio() {
  // ── Config knobs ──
  const [totalScenes, setTotalScenes] = useState(6);
  const [customScenes, setCustomScenes] = useState(3);
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);

  const brollScenes = Math.max(0, totalScenes - customScenes);

  const costBreakdown = useMemo(
    () => computeVideoCost({ totalScenes, customScenes: Math.min(customScenes, totalScenes), brollScenes, imageModel }),
    [totalScenes, customScenes, brollScenes, imageModel],
  );

  // ── Generate form ──
  const [topic, setTopic] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleContent, setArticleContent] = useState("");
  const [language, setLanguage] = useState("繁體中文");
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genStep, setGenStep] = useState("");
  const [genError, setGenError] = useState("");
  const [genResult, setGenResult] = useState<VideoOutputs | null>(null);

  // ── History ──
  const [history, setHistory] = useState<VideoHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoHistoryItem | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [deletingVideos, setDeletingVideos] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // clear poll timer on unmount
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  // load history on mount
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetch("/api/video/history?limit=20");
      const j = (await r.json()) as { ok: boolean; items?: VideoHistoryItem[] };
      if (j.ok && j.items) setHistory(j.items);
    } catch { /* best-effort */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // ── Delete selected videos ──
  const deleteSelected = async () => {
    if (selectedVideos.size === 0) return;
    if (!confirm(`刪除 ${selectedVideos.size} 個影片？此操作無法復原。`)) return;
    setDeletingVideos(true);
    try {
      await Promise.all(
        Array.from(selectedVideos).map(id =>
          fetch(`/api/video/${id}`, { method: "DELETE" })
        )
      );
      setSelectedVideos(new Set());
      void loadHistory();
    } catch (e) {
      console.error("delete failed", e);
    } finally {
      setDeletingVideos(false);
    }
  };

  // ── Generate handler ──
  async function handleGenerate() {
    if (!topic.trim()) return;
    if (pollRef.current) clearTimeout(pollRef.current);
    setGenStatus("loading");
    setGenStep("準備中…");
    setGenError("");
    setGenResult(null);

    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          articleTitle: articleTitle.trim() || undefined,
          articleContent: articleContent.trim() || undefined,
          language,
          customScenes: Math.min(customScenes, totalScenes),
          brollScenes,
          imageModel,
        }),
      });
      const start = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!start.ok || !start.jobId) {
        setGenStatus("error");
        setGenError(start.error ?? "無法建立生成工作");
        return;
      }

      const jobId = start.jobId;
      const deadline = Date.now() + 12 * 60 * 1000;

      interface StatusResp {
        ok: boolean;
        status?: "running" | "done" | "error";
        step?: string;
        video?: { outputs: Record<string, string>; out_dir: string };
        title?: string;
        error?: string;
      }

      const poll = async (): Promise<void> => {
        if (Date.now() > deadline) {
          setGenStatus("error");
          setGenError("生成逾時（>12 分鐘）。影片可能仍在背景產出，稍後可至下方歷史紀錄查看。");
          return;
        }
        let sj: StatusResp;
        try {
          const sr = await fetch(`/api/video/status?jobId=${encodeURIComponent(jobId)}`);
          sj = (await sr.json()) as StatusResp;
        } catch {
          pollRef.current = setTimeout(() => void poll(), 5000);
          return;
        }
        if (!sj.ok) {
          setGenStatus("error");
          setGenError(sj.error ?? "查詢生成狀態失敗");
          return;
        }
        if (sj.status === "running") {
          if (sj.step) setGenStep(sj.step);
          pollRef.current = setTimeout(() => void poll(), 5000);
          return;
        }
        if (sj.status === "done" && sj.video) {
          setGenResult({ outputs: sj.video.outputs, out_dir: sj.video.out_dir, title: sj.title ?? "" });
          setGenStatus("done");
          void loadHistory(); // refresh history
          return;
        }
        setGenStatus("error");
        setGenError(sj.error ?? "生成失敗");
      };

      pollRef.current = setTimeout(() => void poll(), 3000);
    } catch (e: unknown) {
      setGenStatus("error");
      setGenError(e instanceof Error ? e.message : "網路錯誤，請重試");
    }
  }

  function handleTotalChange(n: number) {
    setTotalScenes(n);
    if (customScenes > n) setCustomScenes(n);
  }

  const isLoading = genStatus === "loading";
  const canGenerate = topic.trim().length > 0 && !isLoading;

  return (
    <div style={{ padding: "24px 28px", background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 480px) 1fr", gap: 24, alignItems: "start" }}>

        {/* ─── LEFT PANEL ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* §1 — Pipeline flow */}
          <Card title="① 生成流程" subtitle="lib/content/video/video-cost.ts VIDEO_PIPELINE_STEPS 驅動">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {VIDEO_PIPELINE_STEPS.map((step, idx) => (
                <FlowCard
                  key={step.id}
                  step={step}
                  index={idx}
                  costLine={costBreakdown.lines.find((l) => l.id === step.id)}
                  activeStep={isLoading ? genStep : undefined}
                />
              ))}
            </div>
          </Card>

          {/* §2 — Config controls */}
          <Card title="② 場景設定">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <KnobRow label="場景總數" hint={`${totalScenes} 場`} min={1} max={20} step={1} value={totalScenes} onChange={handleTotalChange} />
              <KnobRow
                label={`自訂 AI 圖（Flux），目前 ${customScenes}/${totalScenes}`}
                hint={`B-roll：${brollScenes}`}
                min={0} max={totalScenes} step={1}
                value={customScenes} onChange={setCustomScenes}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>生圖模型</span>
                <select value={imageModel} onChange={(e) => setImageModel(e.target.value)} style={inputStyle}>
                  {Object.entries(IMAGE_RATES).map(([id, r]) => (
                    <option key={id} value={id}>{r.label} — ${r.usd}/張</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* §3 — Cost breakdown */}
          <Card title="③ 成本明細">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "6px 0", fontWeight: 600 }}>步驟</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>USD</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>×</th>
                  <th style={{ padding: "6px 0", fontWeight: 600, textAlign: "right" }}>NT$</th>
                </tr>
              </thead>
              <tbody>
                {costBreakdown.lines.map((line) => (
                  <tr key={line.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "7px 0", color: "var(--text-primary)" }}>
                      <span style={{ marginRight: 6 }}>{line.icon}</span>{line.label}
                      {line.free && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#065f46", background: "#d1fae5", padding: "1px 5px", borderRadius: 4 }}>免費</span>}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 11.5 }}>{line.free ? "—" : USD(line.unitUsd)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)" }}>{line.count}</td>
                    <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 600, color: line.free ? "var(--text-muted)" : "var(--text-primary)" }}>{line.free ? "—" : NT(line.totalUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, borderTop: "2px solid var(--border-subtle)", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>每支合計</span>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)", marginLeft: 8 }}>({USD(costBreakdown.totalUsd)})</span>
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>{NT(costBreakdown.totalUsd)}</span>
            </div>
          </Card>
        </div>

        {/* ─── RIGHT PANEL ────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* §4 — Generate */}
          <Card title="④ 生成影片">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={labelStyle}>主題 / 關鍵字 <span style={{ color: "#dc2626" }}>*</span></label>
                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
                  placeholder="例：如何用 AI 提升 SEO 排名" style={inputStyle} disabled={isLoading} />
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={labelStyle}>語言</label>
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }} disabled={isLoading}>
                    {["繁體中文", "English", "簡體中文", "日文", "西班牙文"].map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={labelStyle}>文章標題（選用）</label>
                <input type="text" value={articleTitle} onChange={(e) => setArticleTitle(e.target.value)}
                  placeholder="留白 = 純主題生成" style={inputStyle} disabled={isLoading} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={labelStyle}>文章內文（選用 — 貼入 Markdown 或純文字）</label>
                <textarea value={articleContent} onChange={(e) => setArticleContent(e.target.value)}
                  placeholder="留白 = 以主題/標題生成腳本" rows={4}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} disabled={isLoading} />
              </div>

              <button onClick={handleGenerate} disabled={!canGenerate}
                style={{
                  padding: "11px 20px", borderRadius: 8, border: "none",
                  cursor: canGenerate ? "pointer" : "not-allowed",
                  background: canGenerate ? "var(--accent)" : "var(--border-subtle)",
                  color: canGenerate ? "#fff" : "var(--text-muted)",
                  fontSize: 14, fontWeight: 700, transition: "background 0.15s",
                }}>
                {isLoading ? "⏳ 生成中…" : "🎬 生成影片"}
              </button>

              {/* Progress tracker */}
              {isLoading && <ProgressTracker step={genStep} />}

              {/* Error */}
              {genStatus === "error" && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>生成失敗</div>
                  <div style={{ fontSize: 12.5, color: "#7f1d1d" }}>{genError}</div>
                  {genError.toLowerCase().includes("video-service") && (
                    <div style={{ marginTop: 6, fontSize: 11.5, color: "#991b1b" }}>提示：EU video-service 需正常運行（健康狀態請查 Repair Center）。</div>
                  )}
                </div>
              )}

              {/* Success result */}
              {genStatus === "done" && genResult && (
                <ResultPanel result={genResult} onClose={() => setGenStatus("idle")} />
              )}
            </div>
          </Card>

          {/* §5 — History */}
          <Card
            title="⑤ 最近生成記錄"
            action={<button onClick={loadHistory} disabled={historyLoading}
              style={{ fontSize: 11.5, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
              {historyLoading ? "載入中…" : "↻ 重新整理"}
            </button>}
          >
            {history.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "8px 0" }}>
                {historyLoading ? "載入中…" : "尚無影片記錄。生成第一支影片後會出現在這裡。"}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.length > 0 && (
                  <div className="flex items-center gap-3 mb-3">
                    <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedVideos.size === history.length && history.length > 0}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedVideos(new Set(history.map((v) => v.id)));
                          } else {
                            setSelectedVideos(new Set());
                          }
                        }}
                      />
                      全選
                    </label>
                    {selectedVideos.size > 0 && (
                      <button
                        onClick={deleteSelected}
                        disabled={deletingVideos}
                        className="px-3 py-1 rounded text-sm bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                      >
                        {deletingVideos ? "刪除中..." : `刪除 ${selectedVideos.size} 個`}
                      </button>
                    )}
                    <span className="text-xs text-neutral-500 ml-auto">
                      {selectedVideos.size > 0 ? `已選 ${selectedVideos.size}` : `共 ${history.length} 個`}
                    </span>
                  </div>
                )}
                {history.map((item) => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    active={selectedVideo?.id === item.id}
                    onSelect={() => setSelectedVideo(selectedVideo?.id === item.id ? null : item)}
                    checked={selectedVideos.has(item.id)}
                    onCheck={e => {
                      const next = new Set(selectedVideos);
                      if (e.target.checked) next.add(item.id);
                      else next.delete(item.id);
                      setSelectedVideos(next);
                    }}
                  />
                ))}
              </div>
            )}

            {/* Expanded video viewer */}
            {selectedVideo && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
                <VideoViewer
                  title={selectedVideo.title}
                  outputs={selectedVideo.formats}
                  primaryUrl={selectedVideo.object_url}
                  onClose={() => setSelectedVideo(null)}
                />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── ProgressTracker ──────────────────────────────────────────────────────────

function ProgressTracker({ step }: { step: string }) {
  const currentIdx = getCurrentStepIndex(step);
  return (
    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", marginBottom: 12 }}>🔄 正在生成…</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PROGRESS_STEPS.slice(0, -1).map((s, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800,
                background: done ? "#16a34a" : active ? "#2563eb" : "#e5e7eb",
                color: done || active ? "#fff" : "#9ca3af",
              }}>
                {done ? "✓" : idx + 1}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{
                  fontSize: 12.5, fontWeight: active ? 700 : 500,
                  color: done ? "#16a34a" : active ? "#1d4ed8" : "var(--text-muted)",
                }}>
                  {s.label}
                </span>
                {active && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "#3b82f6" }}>{step}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "#3b82f6" }}>
        可以關閉頁面，完成後影片會出現在下方「最近生成記錄」。
      </div>
    </div>
  );
}

// ─── ResultPanel ──────────────────────────────────────────────────────────────

function ResultPanel({ result, onClose }: { result: VideoOutputs; onClose: () => void }) {
  const primaryKey = "youtube_linkedin";
  const primaryUrl = result.outputs[primaryKey] ?? Object.values(result.outputs)[0] ?? "";

  return (
    <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#166534" }}>✅ 生成完成：{result.title}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#166534", fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      {/* Primary video player */}
      {primaryUrl && primaryUrl.startsWith("https://") && (
        <div style={{ marginBottom: 14 }}>
          <video
            controls
            src={primaryUrl}
            style={{ width: "100%", borderRadius: 8, background: "#000", maxHeight: 280 }}
          />
        </div>
      )}

      <VideoViewer title={result.title} outputs={result.outputs} primaryUrl={primaryUrl} />
    </div>
  );
}

// ─── VideoViewer ──────────────────────────────────────────────────────────────

function VideoViewer({ title, outputs, primaryUrl, onClose }: {
  title: string;
  outputs: Record<string, string>;
  primaryUrl?: string;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyUrl = (url: string, key: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  };

  return (
    <div>
      {onClose && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>×</button>
        </div>
      )}

      {/* Preview player */}
      {primaryUrl && primaryUrl.startsWith("https://") && (
        <video controls src={primaryUrl} style={{ width: "100%", borderRadius: 8, background: "#000", maxHeight: 200, marginBottom: 10 }} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {Object.entries(outputs).map(([key, url]) => {
          const meta = OUTPUT_LABELS[key];
          const isHttps = url.startsWith("https://");
          return (
            <div key={key} style={{ background: "#f8fafc", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                  {meta ? `${meta.icon} ${meta.label}` : key}
                </span>
                {meta && <span style={{ fontSize: 10, color: "var(--text-muted)", background: "#e5e7eb", padding: "1px 6px", borderRadius: 4 }}>{meta.ratio}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {isHttps ? (
                  <>
                    <a href={url} download target="_blank" rel="noreferrer"
                      style={{ flex: 1, padding: "5px 8px", background: "var(--accent)", color: "#fff", borderRadius: 6, textAlign: "center", fontSize: 11.5, fontWeight: 700, textDecoration: "none" }}>
                      ⬇ 下載
                    </a>
                    <button onClick={() => copyUrl(url, key)}
                      style={{ padding: "5px 8px", background: "#f1f5f9", border: "1px solid var(--border-subtle)", borderRadius: 6, fontSize: 11.5, cursor: "pointer", color: "var(--text-secondary)", fontWeight: 600 }}>
                      {copied === key ? "✓" : "複製"}
                    </button>
                  </>
                ) : (
                  <code style={{ fontSize: 10, wordBreak: "break-all", color: "var(--text-muted)", background: "#f1f5f9", padding: "4px 6px", borderRadius: 4 }}>{url}</code>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── HistoryRow ───────────────────────────────────────────────────────────────

function HistoryRow({ item, active, onSelect, checked, onCheck }: {
  item: VideoHistoryItem;
  active: boolean;
  onSelect: () => void;
  checked: boolean;
  onCheck: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const date = new Date(item.created_at);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  const formatCount = Object.keys(item.formats).length;

  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 12px", borderRadius: 8, cursor: "pointer",
        border: `1px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
        background: active ? "#eff6ff" : "#fff",
        transition: "border-color 0.1s, background 0.1s",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onCheck}
        className="mt-1 cursor-pointer"
        onClick={e => e.stopPropagation()}
      />
      <div style={{ width: 36, height: 36, borderRadius: 6, background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
        🎬
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          {dateStr} · {item.sceneCount || "?"} 場景 · {formatCount} 格式
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: active ? "var(--accent)" : "var(--text-muted)", fontWeight: 600 }}>
        {active ? "▲ 收起" : "▼ 展開"}
      </div>
    </div>
  );
}

// ─── FlowCard ─────────────────────────────────────────────────────────────────

function FlowCard({
  step, index, costLine, activeStep,
}: {
  step: (typeof VIDEO_PIPELINE_STEPS)[number];
  index: number;
  costLine?: { totalUsd: number; free: boolean; count: number };
  activeStep?: string;
}) {
  const muted = !step.enabled;
  // highlight the active pipeline step during generation
  // VIDEO_PIPELINE_STEPS: 0=script,1=image,2=broll,3=tts,4=render
  const isActive = activeStep !== undefined && !muted &&
    PROGRESS_STEPS.some((ps) => activeStep.includes(ps.match) && ps.key !== "__done__" &&
      (ps.key === "script" ? index === 0 :
       ps.key === "assets" ? index === 1 :
       ps.key === "render" ? index === 3 || index === 4 : false));

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 12px", borderRadius: 8,
      border: `1px solid ${isActive ? "var(--accent)" : muted ? "#e5e7eb" : "var(--border-subtle)"}`,
      background: isActive ? "#eff6ff" : muted ? "#f9fafb" : "#fff",
      opacity: muted ? 0.55 : 1,
      transition: "border-color 0.15s, background 0.15s",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        background: isActive ? "var(--accent)" : muted ? "#e5e7eb" : "var(--accent)",
        color: muted && !isActive ? "#9ca3af" : "#fff",
        fontSize: 11, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {isActive ? "●" : index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15 }}>{step.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: muted ? "var(--text-muted)" : "var(--text-primary)", textDecoration: muted ? "line-through" : "none" }}>
            {step.label}
          </span>
          {muted && <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>已停用</span>}
          {isActive && <span style={{ fontSize: 10, fontWeight: 700, color: "#2563eb", background: "#dbeafe", padding: "1px 6px", borderRadius: 4, animation: "pulse 1s infinite" }}>進行中</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 3 }}>
          {step.tool} · <span style={{ color: "var(--text-muted)" }}>{step.vendor}</span>
        </div>
        {step.note && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{step.note}</div>}
      </div>
      {costLine !== undefined && (
        <div style={{ flexShrink: 0 }}>
          {costLine.free
            ? <span style={{ background: "#d1fae5", color: "#065f46", padding: "2px 7px", borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>$0 免費</span>
            : <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 7px", borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>${costLine.totalUsd.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
          }
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border-subtle)", background: "#fafafa", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

function KnobRow({ label, hint, min, max, step, value, onChange }: {
  label: string; hint: string; min: number; max: number; step: number; value: number; onChange: (n: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{hint}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }} />
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" };

const inputStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8,
  border: "1px solid var(--border-subtle)",
  fontSize: 13, background: "#fff", color: "var(--text-primary)",
  width: "100%", boxSizing: "border-box",
};
