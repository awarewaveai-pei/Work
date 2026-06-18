"use client";

import { useMemo, useState } from "react";
import { VIDEO_PIPELINE_STEPS, computeVideoCost } from "@/lib/content/video/video-cost";
import { IMAGE_RATES, DEFAULT_IMAGE_MODEL } from "@/lib/ai/cost-model";
import { usdToNtd } from "@/lib/ai/cost-calculator";

// ─── Formatters ───────────────────────────────────────────────────────────────

const NT = (usd: number) => {
  const n = usdToNtd(usd);
  return `NT$${n.toLocaleString("zh-TW", { maximumFractionDigits: n < 1 ? 4 : 0 })}`;
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

const OUTPUT_LABELS: Record<string, string> = {
  youtube_linkedin: "YouTube / LinkedIn (16:9)",
  tiktok_reels: "TikTok / Reels (9:16)",
  instagram_facebook: "Instagram / Facebook (1:1)",
  twitter_reddit_bluesky: "Twitter / Reddit / Bluesky (16:9 短版)",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VideoStudio() {
  // ── Config knobs ──
  const [totalScenes, setTotalScenes] = useState(6);
  const [customScenes, setCustomScenes] = useState(3);
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);

  // brollScenes = totalScenes − customScenes (clamped to ≥0)
  const brollScenes = Math.max(0, totalScenes - customScenes);

  const costBreakdown = useMemo(
    () =>
      computeVideoCost({
        totalScenes,
        customScenes: Math.min(customScenes, totalScenes),
        brollScenes,
        imageModel,
      }),
    [totalScenes, customScenes, brollScenes, imageModel],
  );

  // ── Generate form ──
  const [topic, setTopic] = useState("");
  const [articleTitle, setArticleTitle] = useState("");
  const [articleContent, setArticleContent] = useState("");
  const [language, setLanguage] = useState("繁體中文");
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genError, setGenError] = useState("");
  const [genResult, setGenResult] = useState<VideoOutputs | null>(null);

  // ── Generate handler ──
  async function handleGenerate() {
    if (!topic.trim()) return;
    setGenStatus("loading");
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

      const json = (await res.json()) as
        | { ok: true; video: { outputs: Record<string, string>; out_dir: string }; title: string }
        | { ok: false; status: number; error: string };

      if (!json.ok) {
        setGenStatus("error");
        setGenError(json.error);
        return;
      }

      setGenResult({ outputs: json.video.outputs, out_dir: json.video.out_dir, title: json.title });
      setGenStatus("done");
    } catch (e: unknown) {
      setGenStatus("error");
      setGenError(e instanceof Error ? e.message : "網路錯誤，請重試");
    }
  }

  // ── Clamp customScenes when totalScenes shrinks ──
  function handleTotalChange(n: number) {
    setTotalScenes(n);
    if (customScenes > n) setCustomScenes(n);
  }

  return (
    <div style={{ padding: "24px 28px", background: "var(--bg-canvas)", minHeight: "100vh" }}>
      {/* ═══ Layout: left panel (flow + cost) / right panel (generate) ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 520px) 1fr", gap: 24, alignItems: "start" }}>

        {/* ─── LEFT PANEL ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* §1 — Pipeline flow */}
          <Card title="① 生成流程（可擴充 / 可刪減）"
            subtitle="此清單由 lib/content/video/video-cost.ts VIDEO_PIPELINE_STEPS 驅動；新增或刪除步驟只需修改那份陣列。">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {VIDEO_PIPELINE_STEPS.map((step, idx) => (
                <FlowCard
                  key={step.id}
                  step={step}
                  index={idx}
                  costLine={costBreakdown.lines.find((l) => l.id === step.id)}
                />
              ))}
            </div>
          </Card>

          {/* §2 — Config controls */}
          <Card title="② 場景設定（影響成本試算）">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <KnobRow
                label="場景總數"
                hint={`${totalScenes} 場`}
                min={1} max={20} step={1}
                value={totalScenes}
                onChange={handleTotalChange}
              />
              <KnobRow
                label={`自訂 AI 圖（Flux），目前 ${customScenes}/${totalScenes}`}
                hint={`B-roll 場景：${brollScenes}`}
                min={0} max={totalScenes} step={1}
                value={customScenes}
                onChange={setCustomScenes}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>生圖模型</span>
                <select
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  style={{
                    padding: "6px 8px", borderRadius: 8,
                    border: "1px solid var(--border-subtle)",
                    fontSize: 13, background: "#fff", color: "var(--text-primary)",
                  }}
                >
                  {Object.entries(IMAGE_RATES).map(([id, r]) => (
                    <option key={id} value={id}>
                      {r.label} — ${r.usd}/張
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* §3 — Cost breakdown */}
          <Card title="③ 每支影片成本明細">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "6px 0", fontWeight: 600 }}>步驟</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>單價 USD</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>數量</th>
                  <th style={{ padding: "6px 0", fontWeight: 600, textAlign: "right" }}>小計 NT$</th>
                </tr>
              </thead>
              <tbody>
                {costBreakdown.lines.map((line) => (
                  <tr key={line.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "7px 0", color: "var(--text-primary)" }}>
                      <span style={{ marginRight: 6 }}>{line.icon}</span>
                      {line.label}
                      {line.free && (
                        <span style={{
                          marginLeft: 6, fontSize: 10, fontWeight: 700,
                          color: "#065f46", background: "#d1fae5",
                          padding: "1px 5px", borderRadius: 4,
                        }}>免費</span>
                      )}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: 11.5 }}>
                      {line.free ? "—" : USD(line.unitUsd)}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)" }}>
                      {line.count}
                    </td>
                    <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 600, color: line.free ? "var(--text-muted)" : "var(--text-primary)" }}>
                      {line.free ? "—" : NT(line.totalUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total */}
            <div style={{
              marginTop: 12, borderTop: "2px solid var(--border-subtle)",
              paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline",
            }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>每支影片合計</span>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)", marginLeft: 8 }}>({USD(costBreakdown.totalUsd)} USD)</span>
              </div>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--accent)" }}>
                {NT(costBreakdown.totalUsd)}
              </span>
            </div>

            <p style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
              ※ 圖片成本以規劃的自訂場景數計算（{customScenes} 張）。若 Pexels B-roll 找不到結果而降級到
              {" "}{costBreakdown.imageModelLabel}，實際成本略高。
            </p>
          </Card>
        </div>

        {/* ─── RIGHT PANEL ────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card title="④ 生成影片">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Topic */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  主題 / 關鍵字 <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="例：如何用 AI 提升 SEO 排名"
                  style={inputStyle}
                />
              </div>

              {/* Language */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>語言</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {["繁體中文", "English", "簡體中文", "日文", "西班牙文"].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Optional: article title */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  文章標題（選用 — 有文章則優先以文章為腳本基礎）
                </label>
                <input
                  type="text"
                  value={articleTitle}
                  onChange={(e) => setArticleTitle(e.target.value)}
                  placeholder="留白 = 純主題生成"
                  style={inputStyle}
                />
              </div>

              {/* Optional: article content */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  文章內文（選用 — 貼入 Markdown 或純文字）
                </label>
                <textarea
                  value={articleContent}
                  onChange={(e) => setArticleContent(e.target.value)}
                  placeholder="留白 = 以主題/標題生成腳本"
                  rows={5}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
                />
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!topic.trim() || genStatus === "loading"}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: !topic.trim() || genStatus === "loading" ? "var(--border-subtle)" : "var(--accent)",
                  color: !topic.trim() || genStatus === "loading" ? "var(--text-muted)" : "#fff",
                  fontSize: 14, fontWeight: 700, transition: "background 0.15s",
                }}
              >
                {genStatus === "loading" ? "生成中…（需 30–120 秒）" : "🎬 生成影片"}
              </button>

              {/* Status banner */}
              {genStatus === "loading" && (
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: "#1d4ed8" }}>
                  正在執行：腳本生成 → 素材準備 → 合成 → 輸出四個尺寸。請勿關閉頁面。
                </div>
              )}

              {genStatus === "error" && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 12.5, color: "#dc2626" }}>
                  <strong>生成失敗：</strong>{genError}
                  {genError.toLowerCase().includes("video-service") && (
                    <div style={{ marginTop: 6, color: "#7f1d1d", fontSize: 11.5 }}>
                      提示：Python video-service 需在 Phase 2 部署後才可使用。目前僅顯示流程與成本資訊。
                    </div>
                  )}
                </div>
              )}

              {genStatus === "done" && genResult && (
                <ResultPanel result={genResult} />
              )}
            </div>
          </Card>

          {/* Output format guide */}
          <Card title="輸出規格說明">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {Object.entries(OUTPUT_LABELS).map(([key, label]) => (
                <div key={key} style={{
                  background: "#f8fafc", border: "1px solid var(--border-subtle)",
                  borderRadius: 8, padding: "10px 14px",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 3 }}>{key}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-primary)" }}>{label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.6 }}>
              ffmpeg 在 Hetzner 伺服器本機合成，輸出路徑為伺服器端檔案路徑（非瀏覽器可直接下載的 URL）。
              Phase 2 將接入 R2 Storage 並提供直接下載連結。
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid var(--border-subtle)",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 18px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "#fafafa",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>
        )}
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

function FlowCard({
  step,
  index,
  costLine,
}: {
  step: (typeof VIDEO_PIPELINE_STEPS)[number];
  index: number;
  costLine?: { totalUsd: number; free: boolean; count: number };
}) {
  const muted = !step.enabled;
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "10px 12px",
      borderRadius: 8,
      border: `1px solid ${muted ? "#e5e7eb" : "var(--border-subtle)"}`,
      background: muted ? "#f9fafb" : "#fff",
      opacity: muted ? 0.55 : 1,
    }}>
      {/* Step number */}
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        background: muted ? "#e5e7eb" : "var(--accent)",
        color: muted ? "#9ca3af" : "#fff",
        fontSize: 11, fontWeight: 800,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginTop: 1,
      }}>
        {index + 1}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16 }}>{step.icon}</span>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: muted ? "var(--text-muted)" : "var(--text-primary)",
            textDecoration: muted ? "line-through" : "none",
          }}>
            {step.label}
          </span>
          {muted && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4 }}>
              已停用
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 3 }}>
          {step.tool} · <span style={{ color: "var(--text-muted)" }}>{step.vendor}</span>
        </div>
        {step.note && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{step.note}</div>
        )}
      </div>

      {/* Cost badge */}
      {costLine !== undefined && (
        <div style={{
          flexShrink: 0, textAlign: "right",
          fontSize: 11.5, fontWeight: 700,
          color: costLine.free ? "#065f46" : "var(--text-primary)",
        }}>
          {costLine.free ? (
            <span style={{ background: "#d1fae5", color: "#065f46", padding: "2px 7px", borderRadius: 4, fontSize: 10.5 }}>
              $0 免費
            </span>
          ) : (
            <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 7px", borderRadius: 4, fontSize: 10.5 }}>
              {`$${(costLine.totalUsd).toLocaleString("en-US", { maximumFractionDigits: 4 })}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function KnobRow({
  label,
  hint,
  min, max, step, value,
  onChange,
}: {
  label: string;
  hint: string;
  min: number; max: number; step: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{hint}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
    </div>
  );
}

function ResultPanel({ result }: { result: VideoOutputs }) {
  return (
    <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 10 }}>
        ✅ 生成完成：{result.title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(result.outputs).map(([key, path]) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#166534" }}>
              {OUTPUT_LABELS[key] ?? key}
            </span>
            <code style={{
              fontSize: 11, background: "#dcfce7", padding: "4px 8px",
              borderRadius: 4, wordBreak: "break-all", color: "#14532d",
            }}>
              {path}
            </code>
          </div>
        ))}
        <div style={{ marginTop: 6, fontSize: 11, color: "#166534" }}>
          輸出目錄：<code style={{ background: "#dcfce7", padding: "2px 6px", borderRadius: 4 }}>{result.out_dir}</code>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border-subtle)",
  fontSize: 13,
  background: "#fff",
  color: "var(--text-primary)",
  width: "100%",
  boxSizing: "border-box",
};
