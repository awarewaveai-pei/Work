"use client";

// Slider-driven monthly cost estimator (client island). Pure: all maths in lib/ai/cost-calculator,
// no network. Three composable dimensions (operator asked for 都要):
//   1. 量級滑桿 — 每月文章 / 圖片 (headline knobs)
//   2. 每客戶 — client sites × per-client article+image bundle (報價視角)
//   3. 進階 — per-feature call counts (humanize/seo-fix/… 細分)
// + infra baseline toggle + image-model select. Live NT$/USD breakdown.

import { useMemo, useState } from "react";
import { estimateMonthly, usdToNtd } from "@/lib/ai/cost-calculator";
import { IMAGE_RATES, TEXT_FEATURES, DEFAULT_IMAGE_MODEL } from "@/lib/ai/cost-model";

const NT = (usd: number) => { const n = usdToNtd(usd); return `NT$${n.toLocaleString("zh-TW", { maximumFractionDigits: n < 1 ? 4 : 0 })}`; };
const USD = (usd: number) => `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" };
const NUM: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" };

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <div style={FIELD}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={LABEL}>{props.label}</span>
        <span style={NUM}>{props.value.toLocaleString()}{props.suffix ?? ""}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
    </div>
  );
}

export function CostEstimator() {
  // Dimension 1 — volume
  const [articles, setArticles] = useState(20);
  const [imagesPerArticle, setImagesPerArticle] = useState(3);
  const [extraImages, setExtraImages] = useState(50);
  const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
  // Dimension 2 — per client
  const [clients, setClients] = useState(0);
  const [articlesPerClient, setArticlesPerClient] = useState(4);
  const [imagesPerClient, setImagesPerClient] = useState(8);
  // Dimension 3 — advanced per-feature extras
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [perFeatureCalls, setPerFeatureCalls] = useState<Record<string, number>>({});
  // Studio tool runs
  const [bgRuns, setBgRuns] = useState(0);
  const [upscaleRuns, setUpscaleRuns] = useState(0);
  const [inpaintRuns, setInpaintRuns] = useState(0);
  // Baseline
  const [includeInfra, setIncludeInfra] = useState(true);

  const est = useMemo(
    () =>
      estimateMonthly({
        articles,
        imagesPerArticle,
        images: extraImages,
        imageModel,
        clients,
        articlesPerClient,
        imagesPerClient,
        perFeatureCalls,
        toolRuns: { "bg-remove": bgRuns, upscale: upscaleRuns, inpaint: inpaintRuns },
        includeInfra,
      }),
    [articles, imagesPerArticle, extraImages, imageModel, clients, articlesPerClient, imagesPerClient, perFeatureCalls, bgRuns, upscaleRuns, inpaintRuns, includeInfra],
  );

  // Advanced extras: only the features NOT auto-derived from the article knob (article/outline/
  // title/keywords are already expanded by estimateMonthly).
  const ADVANCED_FEATURES = TEXT_FEATURES.filter((f) => !["article", "outline", "title", "keywords"].includes(f.key));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 360px) 1fr", gap: 24, alignItems: "start" }}>
      {/* ── Controls ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.4 }}>① 內容量級 / 月</div>
        <Slider label="文章篇數" value={articles} min={0} max={500} step={5} onChange={setArticles} />
        <Slider label="每篇圖片數" value={imagesPerArticle} min={0} max={10} step={1} onChange={setImagesPerArticle} />
        <Slider label="額外圖片 (塔羅/POD/獨立)" value={extraImages} min={0} max={2000} step={10} onChange={setExtraImages} />
        <div style={FIELD}>
          <span style={LABEL}>圖片模型</span>
          <select value={imageModel} onChange={(e) => setImageModel(e.target.value)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border-subtle)", fontSize: 13 }}>
            {Object.entries(IMAGE_RATES).map(([id, r]) => (
              <option key={id} value={id}>{r.label} — ${r.usd}/張</option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.4, marginTop: 6 }}>② 每客戶 (報價) / 月</div>
        <Slider label="客戶網站數" value={clients} min={0} max={50} step={1} onChange={setClients} />
        <Slider label="每客戶文章" value={articlesPerClient} min={0} max={30} step={1} onChange={setArticlesPerClient} />
        <Slider label="每客戶圖片" value={imagesPerClient} min={0} max={60} step={1} onChange={setImagesPerClient} />

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.4, marginTop: 6 }}>③ 編修工具 / 月</div>
        <Slider label="AI 去背 次數" value={bgRuns} min={0} max={500} step={5} onChange={setBgRuns} />
        <Slider label="升頻 次數" value={upscaleRuns} min={0} max={500} step={5} onChange={setUpscaleRuns} />
        <Slider label="去物件 次數" value={inpaintRuns} min={0} max={500} step={5} onChange={setInpaintRuns} />

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>
          <input type="checkbox" checked={includeInfra} onChange={(e) => setIncludeInfra(e.target.checked)} />
          含基建月費 baseline
        </label>

        <button
          onClick={() => setShowAdvanced((v) => !v)}
          style={{ background: "none", border: "none", color: "var(--accent-text)", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", padding: 0 }}
        >
          {showAdvanced ? "▾ 收起進階逐功能" : "▸ 進階：逐功能呼叫次數"}
        </button>
        {showAdvanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4, borderTop: "1px dashed var(--border-subtle)" }}>
            {ADVANCED_FEATURES.map((f) => (
              <Slider
                key={f.key}
                label={f.label}
                value={perFeatureCalls[f.key] ?? 0}
                min={0}
                max={500}
                step={5}
                onChange={(n) => setPerFeatureCalls((prev) => ({ ...prev, [f.key]: n }))}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Result ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "linear-gradient(135deg, var(--accent) 0%, #6d28d9 100%)", color: "var(--btn-primary-text)", borderRadius: 14, padding: "22px 26px" }}>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 4 }}>估算月費總計</div>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>{NT(est.totalUsd)}</div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 2 }}>{USD(est.totalUsd)} USD / 月</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <Stat label="文字 AI" usd={est.textUsd} />
          <Stat label="圖片" usd={est.imageUsd} />
          <Stat label="編修工具" usd={est.toolUsd} />
          <Stat label="基建" usd={est.infraUsd} />
        </div>

        <BreakdownTable title="文字 AI 明細" lines={est.textLines} />
        {est.imageLines.length > 0 && <BreakdownTable title="圖片明細" lines={est.imageLines} />}
        {includeInfra && est.infraLines.length > 0 && <BreakdownTable title="基建月費" lines={est.infraLines} unitIsMonthly />}
      </div>
    </div>
  );
}

function Stat({ label, usd }: { label: string; usd: number }) {
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{NT(usd)}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{USD(usd)}</div>
    </div>
  );
}

function BreakdownTable({ title, lines, unitIsMonthly }: { title: string; lines: { key: string; label: string; unitUsd: number; count: number; totalUsd: number }[]; unitIsMonthly?: boolean }) {
  if (lines.length === 0) return null;
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
            <th style={{ padding: "8px 16px", fontWeight: 600 }}>項目</th>
            <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>{unitIsMonthly ? "月費 USD" : "單價 USD"}</th>
            <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>數量</th>
            <th style={{ padding: "8px 16px", fontWeight: 600, textAlign: "right" }}>小計 NT$</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td style={{ padding: "8px 16px", color: "var(--text-primary)" }}>{l.label}</td>
              <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--text-secondary)" }}>${l.unitUsd.toFixed(l.unitUsd < 0.1 ? 4 : 2)}</td>
              <td style={{ padding: "8px 16px", textAlign: "right", color: "var(--text-secondary)" }}>{l.count.toLocaleString()}</td>
              <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600, color: "var(--text-primary)" }}>{NT(l.totalUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
