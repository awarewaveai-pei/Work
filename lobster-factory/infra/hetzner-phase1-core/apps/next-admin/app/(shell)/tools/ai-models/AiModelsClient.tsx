"use client";

import { useState, useMemo } from "react";
import {
  TEXT_MODEL_COMPARISONS,
  CODING_TOOL_COMPARISONS,
  VIDEO_MODEL_COMPARISONS,
  TTS_MODEL_COMPARISONS,
  SEARCH_API_COMPARISONS,
  VIDEO_MODEL_SOURCES,
  TTS_MODEL_SOURCES,
  SEARCH_API_SOURCES,
  AI_MODEL_SOURCES,
  type TextModelComparison,
  type CodingToolComparison,
  type VideoModelComparison,
  type TtsModelComparison,
  type SearchApiComparison,
} from "@/lib/ai/model-comparison";
import {
  TAROT_MODEL_COMPARISONS,
  TAROT_MODEL_SOURCES,
  type TarotModelComparison,
} from "@/lib/tarot/model-comparison";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "text" | "image" | "coding" | "video" | "tts" | "search";
type SortKey = "default" | "cost" | "speed";
type SortDir = "asc" | "desc";
type SortMode = "default" | "cost" | "speed"; // kept for compat

type TaggedText = TextModelComparison & { _type: "text" };
type TaggedImage = TarotModelComparison & { _type: "image" };
type TaggedCoding = CodingToolComparison & { _type: "coding" };
type TaggedVideo = VideoModelComparison & { _type: "video" };
type TaggedTts = TtsModelComparison & { _type: "tts" };
type TaggedSearch = SearchApiComparison & { _type: "search" };
type AnyModel = TaggedText | TaggedImage | TaggedCoding | TaggedVideo | TaggedTts | TaggedSearch;

// ── Color maps ────────────────────────────────────────────────────────────────

const SPEED_STYLE: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "最快", color: "var(--badge-green-text)",       bg: "var(--badge-green-bg)" },
  2: { label: "快",   color: "var(--ai-text)",                 bg: "var(--ai-bg)" },
  3: { label: "中等", color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" },
  4: { label: "慢",   color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" },
  5: { label: "最慢", color: "var(--badge-red-text)",         bg: "var(--badge-red-bg)" },
};

const TEXT_SOURCE_LABEL: Record<string, string> = {
  openaiPricing: "OpenAI pricing",
  openaiGpt55: "GPT-5 page",
  codexPricing: "Codex page",
  claudeModels: "Claude models",
  claudePricing: "Claude pricing",
  claudeCode: "Claude Code",
  geminiModels: "Gemini models",
  geminiPricing: "Gemini pricing",
  geminiCodeAssist: "Code Assist",
  perplexityPricing: "Perplexity pricing",
  perplexityModels: "Perplexity models",
  xaiModels: "xAI models",
  grokBuild: "Grok Build",
};

const TWD = 32;

// Latency string → numeric rank (1=fastest). Shared by SearchCard and sortedSearch.
const LATENCY_RANK: Record<string, number> = {
  "< 200ms": 1, "< 500ms": 2, "< 1s": 3, "1–3s": 4, "> 3s": 5,
};

// ── Utility functions ─────────────────────────────────────────────────────────

function textCostStyle(c: number) {
  if (c === 0)  return { label: "免費", color: "var(--badge-green-text)",       bg: "var(--badge-green-bg)" };
  if (c < 0.5)  return { label: "$",    color: "var(--badge-green-text)",       bg: "var(--badge-green-bg)" };
  if (c < 2)    return { label: "$$",   color: "var(--ai-text)",                 bg: "var(--ai-bg)" };
  if (c < 4)    return { label: "$$$",  color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" };
  return              { label: "$$$$", color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" };
}

function imageCostStyle(c: number) {
  if (c < 0.03)  return { label: "$",    color: "var(--badge-green-text)",       bg: "var(--badge-green-bg)" };
  if (c < 0.07)  return { label: "$$",   color: "var(--ai-text)",                 bg: "var(--ai-bg)" };
  if (c < 0.12)  return { label: "$$$",  color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" };
  return               { label: "$$$$", color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" };
}

// ── Cost display ──────────────────────────────────────────────────────────────

// Real cost to generate 1,000 chars: ~500 input tokens (prompt) + 1,000 output tokens
const GEN1K_IN = 500;
const GEN1K_OUT = 1000;

export function gen1kCostTwd(costInputPer1M: number, costOutputPer1M: number) {
  return (GEN1K_IN * costInputPer1M + GEN1K_OUT * costOutputPer1M) / 1_000_000 * TWD;
}

function fmtTwd(n: number) {
  if (n < 0.005) return "< NT$0.01";
  if (n < 1) return `NT$${n.toFixed(2)}`;
  return `NT$${n.toFixed(1)}`;
}

// Top-of-card cost block — same layout as ImageCard cost block
function TextCostBlock({ costInputPer1M, costOutputPer1M }: { costInputPer1M: number; costOutputPer1M: number }) {
  const BLOCK: React.CSSProperties = {
    display:"flex", alignItems:"baseline", gap:8,
    padding:"8px 0 4px", borderBottom:"1px solid var(--card-border)", marginBottom:8,
  };
  if (costInputPer1M === 0 && costOutputPer1M === 0) {
    return (
      <div style={BLOCK}>
        <span style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)" }}>免費</span>
        <span style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)" }}>個人方案</span>
      </div>
    );
  }
  const total = gen1kCostTwd(costInputPer1M, costOutputPer1M);
  return (
    <div style={BLOCK}>
      <span style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)" }}>{fmtTwd(total)}</span>
      <span style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)" }}>/ 1,000字</span>
      <span style={{ marginLeft:"auto", fontSize:11.5, color:"var(--text-muted)", fontWeight:600 }}>
        US${costInputPer1M.toFixed(2)} in · US${costOutputPer1M.toFixed(2)} out / 1M
      </span>
    </div>
  );
}

// Breakdown rows shown inside InfoRow
function CostBreakdown({ costInputPer1M, costOutputPer1M }: { costInputPer1M: number; costOutputPer1M: number }) {
  if (costInputPer1M === 0 && costOutputPer1M === 0) return null;
  const inTwd  = (GEN1K_IN  * costInputPer1M)  / 1_000_000 * TWD;
  const outTwd = (GEN1K_OUT * costOutputPer1M) / 1_000_000 * TWD;
  const ROW: React.CSSProperties = { display:"flex", justifyContent:"space-between", fontSize:11.5, padding:"2px 0" };
  const LBL: React.CSSProperties = { color:"var(--text-muted)" };
  const VAL: React.CSSProperties = { color:"var(--text-secondary)", fontWeight:600 };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:1 }}>
      <div style={ROW}><span style={LBL}>✏️ 提示詞 ~{GEN1K_IN} tokens</span><span style={VAL}>{fmtTwd(inTwd)}</span></div>
      <div style={ROW}><span style={LBL}>📝 生成文字 ~{GEN1K_OUT} tokens</span><span style={VAL}>{fmtTwd(outTwd)}</span></div>
    </div>
  );
}

// ── Primitive components ──────────────────────────────────────────────────────

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 9px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, color, background: bg,
      lineHeight: "18px", whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", gap: 10, padding: "5px 0",
      borderBottom: "1px solid var(--bg-subtle)", alignItems: "flex-start",
    }}>
      <span style={{
        width: 58, flexShrink: 0,
        fontSize: 9.5, fontWeight: 800,
        letterSpacing: ".07em", textTransform: "uppercase",
        color: "var(--text-muted)", paddingTop: 2,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.55 }}>
        {children}
      </span>
    </div>
  );
}

function SrcLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{
      color: "var(--accent-text)", textDecoration: "none",
      border: "1px solid var(--card-border)", background: "var(--card-bg)",
      borderRadius: 999, padding: "2px 8px", fontSize: 10.5, whiteSpace: "nowrap",
    }}>
      {label}
    </a>
  );
}

// ── Card base styles ──────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  border: "1.5px solid var(--card-border)", borderRadius: 10,
  background: "var(--card-bg)", padding: "14px 16px",
  display: "flex", flexDirection: "column", gap: 0,
  transition: "box-shadow .15s, border-color .15s",
};
const CARD_SEL: React.CSSProperties = {
  ...CARD, borderColor: "var(--accent)",
  boxShadow: "0 0 0 3px var(--ai-bg)",
};

function CardHeader({ selected, onToggle, vendor, name, sub, badges, nameSize = 15 }: {
  selected: boolean; onToggle: () => void;
  vendor: string; name: string; sub?: string;
  badges: React.ReactNode;
  nameSize?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
      <input
        type="checkbox" checked={selected} onChange={onToggle}
        title="選取此模型以比較"
        style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: "var(--accent)", flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".07em", color: "var(--text-muted)", textTransform: "uppercase" }}>
            {vendor}
          </span>
          {badges}
        </div>
        <div style={{ fontSize: nameSize, fontWeight: 800, color: "var(--text-primary)" }}>{name}</div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function ProCon({ strengths, tradeoffs }: { strengths: string; tradeoffs: string }) {
  return (
    <div style={{
      background: "var(--bg-subtle)", borderRadius: 7, padding: "10px 12px",
      marginBottom: 10, display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <span style={{ fontSize: 14, lineHeight: "18px", flexShrink: 0 }}>✅</span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{strengths}</span>
      </div>
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
        <span style={{ fontSize: 14, lineHeight: "18px", flexShrink: 0 }}>⚠️</span>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{tradeoffs}</span>
      </div>
    </div>
  );
}

// ── Model cards ───────────────────────────────────────────────────────────────

function TextCard({ m, sel, onToggle }: { m: TextModelComparison; sel: boolean; onToggle: () => void }) {
  const spd = SPEED_STYLE[m.speedRank];
  const cst = textCostStyle(m.costInputPer1M);
  return (
    <div style={sel ? CARD_SEL : CARD}>
      <CardHeader
        selected={sel} onToggle={onToggle}
        vendor={m.vendor} name={m.model} sub={m.surface}
        badges={<><Chip {...spd} /><Chip {...cst} /></>}
      />
      <TextCostBlock costInputPer1M={m.costInputPer1M} costOutputPer1M={m.costOutputPer1M} />
      <div style={{ marginBottom: 10 }}>
        <InfoRow label="最適合">{m.bestFor}</InfoRow>
        <InfoRow label="風格">{m.style}</InfoRow>
        <InfoRow label="明細"><CostBreakdown costInputPer1M={m.costInputPer1M} costOutputPer1M={m.costOutputPer1M} /></InfoRow>
        <InfoRow label="Context">{m.context}</InfoRow>
      </div>
      <ProCon strengths={m.strengths} tradeoffs={m.tradeoffs} />
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {m.sourceKeys.map((k) => {
          const url = AI_MODEL_SOURCES[k as keyof typeof AI_MODEL_SOURCES];
          return url ? <SrcLink key={k} href={url} label={TEXT_SOURCE_LABEL[k] ?? k} /> : null;
        })}
      </div>
    </div>
  );
}

function ImageCard({ m, sel, onToggle }: { m: TarotModelComparison; sel: boolean; onToggle: () => void }) {
  const spd = SPEED_STYLE[m.speedRank];
  const cst = imageCostStyle(m.costUsd);
  const tierColor: Record<string, { bg: string; color: string }> = {
    preview:   { bg: "#f1f5f9", color: "#64748b" },
    balanced:  { bg: "#dbeafe", color: "#1e40af" },
    quality:   { bg: "#fce7f3", color: "#9d174d" },
    character: { bg: "#ede9fe", color: "#6d28d9" },
    editing:   { bg: "#d1fae5", color: "#065f46" },
  };
  const tc = tierColor[m.tier] ?? tierColor.preview;
  return (
    <div style={sel ? CARD_SEL : CARD}>
      <CardHeader
        selected={sel} onToggle={onToggle}
        vendor={m.provider}
        name={m.label}
        nameSize={22}
        badges={
          <>
            <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:999, fontSize:10.5, fontWeight:700, ...tc }}>{m.tier}</span>
            <Chip {...spd} />
            <Chip {...cst} />
          </>
        }
      />
      {/* cost block — secondary to name */}
      <div style={{ display:"flex", alignItems:"baseline", gap:8, padding:"8px 0 4px", borderBottom:"1px solid var(--card-border)", marginBottom:8 }}>
        <span style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)" }}>
          NT${Math.round(m.costUsd * TWD * 10) / 10}
        </span>
        <span style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)" }}>/ 張</span>
        <span style={{ marginLeft:"auto", fontSize:11.5, color:"var(--text-muted)", fontWeight:600 }}>US${m.costUsd.toFixed(3)}</span>
      </div>
      <div style={{ marginBottom: 10 }}>
        <InfoRow label="最適合">{m.bestFor}</InfoRow>
        <InfoRow label="避開">{m.avoidFor}</InfoRow>
        <InfoRow label="參考圖">{m.appReferenceLimit} · {m.referenceInput}</InfoRow>
        <InfoRow label="文字渲染">{m.textRendering}</InfoRow>
        <InfoRow label="Seed">{m.seedSupport}</InfoRow>
      </div>
      <ProCon strengths={m.strengths} tradeoffs={m.tradeoffs} />
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {m.sourceKeys.map((k) => {
          const url = TAROT_MODEL_SOURCES[k as keyof typeof TAROT_MODEL_SOURCES];
          return url ? <SrcLink key={k} href={url} label={k} /> : null;
        })}
      </div>
    </div>
  );
}

function CodingCard({ m, sel, onToggle }: { m: CodingToolComparison; sel: boolean; onToggle: () => void }) {
  const spd = SPEED_STYLE[m.speedRank];
  const cst = textCostStyle(m.costInputPer1M);
  return (
    <div style={sel ? CARD_SEL : CARD}>
      <CardHeader
        selected={sel} onToggle={onToggle}
        vendor={m.vendor}
        name={m.tool}
        sub={`${m.model} · ${m.surface}`}
        badges={<><Chip {...spd} /><Chip {...cst} /></>}
      />
      <TextCostBlock costInputPer1M={m.costInputPer1M} costOutputPer1M={m.costOutputPer1M} />
      <div style={{ marginBottom: 10 }}>
        <InfoRow label="最適合">{m.bestFor}</InfoRow>
        <InfoRow label="工作流">{m.workflowStyle}</InfoRow>
        <InfoRow label="明細"><CostBreakdown costInputPer1M={m.costInputPer1M} costOutputPer1M={m.costOutputPer1M} /></InfoRow>
        <InfoRow label="Context">{m.context}</InfoRow>
      </div>
      <ProCon strengths={m.strengths} tradeoffs={m.tradeoffs} />
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {m.sourceKeys.map((k) => {
          const url = AI_MODEL_SOURCES[k as keyof typeof AI_MODEL_SOURCES];
          return url ? <SrcLink key={k} href={url} label={TEXT_SOURCE_LABEL[k] ?? k} /> : null;
        })}
      </div>
    </div>
  );
}

function VideoCard({ m, sel, onToggle }: { m: VideoModelComparison; sel: boolean; onToggle: () => void }) {
  const spd = SPEED_STYLE[m.speedRank];
  const cstUsd = m.costPerSecUsd * 5; // 5-second clip
  const cst = m.costPerSecUsd === 0 ? { label: "訂閱制", color: "var(--ai-text)", bg: "var(--ai-bg)" }
    : cstUsd < 0.05 ? { label: "$", color: "var(--badge-green-text)", bg: "var(--badge-green-bg)" }
    : cstUsd < 0.15 ? { label: "$$", color: "var(--ai-text)", bg: "var(--ai-bg)" }
    : cstUsd < 0.30 ? { label: "$$$", color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" }
    : { label: "$$$$", color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" };
  return (
    <div style={sel ? CARD_SEL : CARD}>
      <CardHeader
        selected={sel} onToggle={onToggle}
        vendor={m.vendor} name={m.model} sub={m.surface}
        badges={<><Chip {...spd} /><Chip {...cst} /></>}
      />
      <div style={{ display:"flex", alignItems:"baseline", gap:8, padding:"8px 0 4px", borderBottom:"1px solid var(--card-border)", marginBottom:8 }}>
        {m.costPerSecUsd === 0
          ? <span style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)" }}>訂閱包含</span>
          : <>
              <span style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)" }}>
                NT${(m.costPerSecUsd * TWD).toFixed(2)}
              </span>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)" }}>/ 秒</span>
              <span style={{ marginLeft:"auto", fontSize:11.5, color:"var(--text-muted)", fontWeight:600 }}>
                US${m.costPerSecUsd.toFixed(4)}/s · 最長 {m.maxDurationSec}s
              </span>
            </>
        }
      </div>
      <div style={{ marginBottom:10 }}>
        <InfoRow label="最適合">{m.bestFor}</InfoRow>
        <InfoRow label="風格">{m.style}</InfoRow>
        <InfoRow label="費用說明">{m.costNote}</InfoRow>
        <InfoRow label="解析度">{m.outputRes}</InfoRow>
      </div>
      <ProCon strengths={m.strengths} tradeoffs={m.tradeoffs} />
      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
        {m.sourceKeys.map((k) => {
          const url = VIDEO_MODEL_SOURCES[k as keyof typeof VIDEO_MODEL_SOURCES];
          return url ? <SrcLink key={k} href={url} label={k} /> : null;
        })}
      </div>
    </div>
  );
}

function TtsCard({ m, sel, onToggle }: { m: TtsModelComparison; sel: boolean; onToggle: () => void }) {
  const spd = SPEED_STYLE[m.speedRank];
  const cst = m.costPer1kCharsUsd === 0 ? { label: "免費", color: "var(--badge-green-text)", bg: "var(--badge-green-bg)" }
    : m.costPer1kCharsUsd < 0.01 ? { label: "$", color: "var(--badge-green-text)", bg: "var(--badge-green-bg)" }
    : m.costPer1kCharsUsd < 0.05 ? { label: "$$", color: "var(--ai-text)", bg: "var(--ai-bg)" }
    : { label: "$$$", color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" };
  const qualityColor: Record<string, string> = { 基礎:"#64748b", 良好:"#1e40af", 優:"#065f46", 最佳:"#9d174d" };
  return (
    <div style={sel ? CARD_SEL : CARD}>
      <CardHeader
        selected={sel} onToggle={onToggle}
        vendor={m.vendor} name={m.model} sub={m.surface}
        badges={
          <>
            <Chip {...spd} />
            <Chip {...cst} />
            <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 8px", borderRadius:999, fontSize:10.5, fontWeight:700, color:qualityColor[m.quality] ?? "#64748b", background:"var(--bg-subtle)" }}>{m.quality}</span>
          </>
        }
      />
      <div style={{ display:"flex", alignItems:"baseline", gap:8, padding:"8px 0 4px", borderBottom:"1px solid var(--card-border)", marginBottom:8 }}>
        {m.costPer1kCharsUsd === 0
          ? <span style={{ fontSize:15, fontWeight:700, color:"var(--badge-green-text)" }}>免費</span>
          : <>
              <span style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)" }}>
                NT${(m.costPer1kCharsUsd * TWD).toFixed(2)}
              </span>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)" }}>/ 1k 字</span>
              <span style={{ marginLeft:"auto", fontSize:11.5, color:"var(--text-muted)", fontWeight:600 }}>
                US${m.costPer1kCharsUsd.toFixed(3)}/1k chars
              </span>
            </>
        }
      </div>
      <div style={{ marginBottom:10 }}>
        <InfoRow label="最適合">{m.bestFor}</InfoRow>
        <InfoRow label="語言">{m.languages}</InfoRow>
        <InfoRow label="音色">{m.voiceCount}{m.cloning && <span style={{ marginLeft:6, fontSize:10, fontWeight:700, color:"var(--badge-green-text)", background:"var(--badge-green-bg)", padding:"1px 6px", borderRadius:4 }}>音色複製</span>}</InfoRow>
        <InfoRow label="費用說明">{m.costNote}</InfoRow>
      </div>
      <ProCon strengths={m.strengths} tradeoffs={m.tradeoffs} />
      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
        {m.sourceKeys.map((k) => {
          const url = TTS_MODEL_SOURCES[k as keyof typeof TTS_MODEL_SOURCES];
          return url ? <SrcLink key={k} href={url} label={k} /> : null;
        })}
      </div>
    </div>
  );
}

function SearchCard({ m, sel, onToggle }: { m: SearchApiComparison; sel: boolean; onToggle: () => void }) {
  const spd = SPEED_STYLE[LATENCY_RANK[m.latency] ?? 3];
  const cst = m.costPer1kQueriesUsd === 0 ? { label: "免費", color: "var(--badge-green-text)", bg: "var(--badge-green-bg)" }
    : m.costPer1kQueriesUsd < 2 ? { label: "$", color: "var(--badge-green-text)", bg: "var(--badge-green-bg)" }
    : m.costPer1kQueriesUsd < 4 ? { label: "$$", color: "var(--ai-text)", bg: "var(--ai-bg)" }
    : { label: "$$$", color: "var(--build-risk-medium-text)", bg: "var(--build-risk-medium-bg)" };
  return (
    <div style={sel ? CARD_SEL : CARD}>
      <CardHeader
        selected={sel} onToggle={onToggle}
        vendor={m.vendor} name={m.product} sub={m.surface}
        badges={<><Chip {...spd} /><Chip {...cst} /></>}
      />
      <div style={{ display:"flex", alignItems:"baseline", gap:8, padding:"8px 0 4px", borderBottom:"1px solid var(--card-border)", marginBottom:8 }}>
        {m.costPer1kQueriesUsd === 0
          ? <span style={{ fontSize:15, fontWeight:700, color:"var(--badge-green-text)" }}>免費額度</span>
          : <>
              <span style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)" }}>
                NT${(m.costPer1kQueriesUsd * TWD).toFixed(0)}
              </span>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)" }}>/ 1k 次</span>
              <span style={{ marginLeft:"auto", fontSize:11.5, color:"var(--text-muted)", fontWeight:600 }}>
                US${m.costPer1kQueriesUsd.toFixed(2)}/1k queries
              </span>
            </>
        }
      </div>
      <div style={{ marginBottom:10 }}>
        <InfoRow label="最適合">{m.bestFor}</InfoRow>
        <InfoRow label="風格">{m.style}</InfoRow>
        <InfoRow label="回傳類型">{m.resultsType}</InfoRow>
        <InfoRow label="費用說明">{m.costNote}</InfoRow>
      </div>
      <ProCon strengths={m.strengths} tradeoffs={m.tradeoffs} />
      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
        {m.sourceKeys.map((k) => {
          const url = SEARCH_API_SOURCES[k as keyof typeof SEARCH_API_SOURCES];
          return url ? <SrcLink key={k} href={url} label={k} /> : null;
        })}
      </div>
    </div>
  );
}

// ── Compare modal ─────────────────────────────────────────────────────────────

function CompareModal({ models, onClose }: { models: AnyModel[]; onClose: () => void }) {
  const type = models[0]._type;
  type RowDef = { label: string; get: (m: AnyModel) => string };

  const rows: RowDef[] = type === "text" ? [
    { label: "供應商", get: (m) => (m as TaggedText).vendor },
    { label: "最適合", get: (m) => (m as TaggedText).bestFor },
    { label: "風格",   get: (m) => (m as TaggedText).style },
    { label: "成本",   get: (m) => (m as TaggedText).cost },
    { label: "速度",   get: (m) => (m as TaggedText).speed },
    { label: "Context",get: (m) => (m as TaggedText).context },
    { label: "優勢",   get: (m) => (m as TaggedText).strengths },
    { label: "限制",   get: (m) => (m as TaggedText).tradeoffs },
  ] : type === "image" ? [
    { label: "供應商",  get: (m) => (m as TaggedImage).provider },
    { label: "每張成本",get: (m) => `US$${(m as TaggedImage).costUsd.toFixed(3)} / NT$${Math.round((m as TaggedImage).costUsd * TWD * 10) / 10}` },
    { label: "速度",    get: (m) => (m as TaggedImage).speed },
    { label: "最適合",  get: (m) => (m as TaggedImage).bestFor },
    { label: "避開",    get: (m) => (m as TaggedImage).avoidFor },
    { label: "參考圖",  get: (m) => (m as TaggedImage).appReferenceLimit },
    { label: "文字渲染",get: (m) => (m as TaggedImage).textRendering },
    { label: "Seed",    get: (m) => (m as TaggedImage).seedSupport },
    { label: "優勢",    get: (m) => (m as TaggedImage).strengths },
    { label: "限制",    get: (m) => (m as TaggedImage).tradeoffs },
  ] : type === "video" ? [
    { label: "供應商",   get: (m) => (m as TaggedVideo).vendor },
    { label: "最適合",   get: (m) => (m as TaggedVideo).bestFor },
    { label: "風格",     get: (m) => (m as TaggedVideo).style },
    { label: "每秒成本", get: (m) => `US$${(m as TaggedVideo).costPerSecUsd.toFixed(4)} / NT$${((m as TaggedVideo).costPerSecUsd * TWD).toFixed(2)}` },
    { label: "最長時長", get: (m) => `${(m as TaggedVideo).maxDurationSec}s` },
    { label: "解析度",   get: (m) => (m as TaggedVideo).outputRes },
    { label: "優勢",     get: (m) => (m as TaggedVideo).strengths },
    { label: "限制",     get: (m) => (m as TaggedVideo).tradeoffs },
  ] : type === "tts" ? [
    { label: "供應商",   get: (m) => (m as TaggedTts).vendor },
    { label: "最適合",   get: (m) => (m as TaggedTts).bestFor },
    { label: "語言",     get: (m) => (m as TaggedTts).languages },
    { label: "音色數",   get: (m) => (m as TaggedTts).voiceCount },
    { label: "音色複製", get: (m) => (m as TaggedTts).cloning ? "✅ 支援" : "❌ 不支援" },
    { label: "每1k字",  get: (m) => `US$${(m as TaggedTts).costPer1kCharsUsd.toFixed(3)}` },
    { label: "品質",     get: (m) => (m as TaggedTts).quality },
    { label: "優勢",     get: (m) => (m as TaggedTts).strengths },
    { label: "限制",     get: (m) => (m as TaggedTts).tradeoffs },
  ] : type === "search" ? [
    { label: "供應商",   get: (m) => (m as TaggedSearch).vendor },
    { label: "最適合",   get: (m) => (m as TaggedSearch).bestFor },
    { label: "風格",     get: (m) => (m as TaggedSearch).style },
    { label: "回傳類型", get: (m) => (m as TaggedSearch).resultsType },
    { label: "延遲",     get: (m) => (m as TaggedSearch).latency },
    { label: "每1k次",  get: (m) => `US$${(m as TaggedSearch).costPer1kQueriesUsd.toFixed(2)}` },
    { label: "優勢",     get: (m) => (m as TaggedSearch).strengths },
    { label: "限制",     get: (m) => (m as TaggedSearch).tradeoffs },
  ] : [
    { label: "供應商", get: (m) => (m as TaggedCoding).vendor },
    { label: "最適合", get: (m) => (m as TaggedCoding).bestFor },
    { label: "工作流", get: (m) => (m as TaggedCoding).workflowStyle },
    { label: "成本",   get: (m) => (m as TaggedCoding).cost },
    { label: "速度",   get: (m) => (m as TaggedCoding).speed },
    { label: "Context",get: (m) => (m as TaggedCoding).context },
    { label: "優勢",   get: (m) => (m as TaggedCoding).strengths },
    { label: "限制",   get: (m) => (m as TaggedCoding).tradeoffs },
  ];

  const names = models.map((m) =>
    m._type === "text"   ? (m as TaggedText).model :
    m._type === "image"  ? (m as TaggedImage).label :
    m._type === "video"  ? (m as TaggedVideo).model :
    m._type === "tts"    ? (m as TaggedTts).model :
    m._type === "search" ? (m as TaggedSearch).product :
    (m as TaggedCoding).tool
  );

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background:"var(--card-bg)", borderRadius:12, width:"100%", maxWidth: Math.min(models.length * 300 + 160, 1200), maxHeight:"88vh", overflow:"auto", padding:24, boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:800 }}>模型比較 · {names.join(" vs ")}</h2>
          <button onClick={onClose} style={{ border:"none", background:"var(--bg-subtle)", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:13, fontWeight:600 }}>關閉 ✕</button>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width:80 }}>屬性</th>
                {names.map((n) => <th key={n} style={TH}><div style={{ fontWeight:800 }}>{n}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.label} style={{ background: i % 2 === 0 ? "var(--card-bg)" : "var(--bg-subtle)" }}>
                  <td style={{ ...TD, fontWeight:700, color:"var(--text-muted)", fontSize:10.5, textTransform:"uppercase", letterSpacing:".06em" }}>{row.label}</td>
                  {models.map((m, j) => <td key={j} style={TD}>{row.get(m)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const TH: React.CSSProperties = {
  padding:"10px 14px", textAlign:"left",
  background:"var(--bg-subtle)", borderBottom:"2px solid var(--border)",
  fontSize:12, fontWeight:700, color:"var(--text-secondary)",
  position:"sticky", top:0,
};
const TD: React.CSSProperties = {
  padding:"10px 14px", borderBottom:"1px solid var(--bg-subtle)",
  fontSize:12.5, color:"var(--text-secondary)", lineHeight:1.55, verticalAlign:"top",
};

// ── Controls bar ──────────────────────────────────────────────────────────────

function Controls({ sortKey, sortDir, onSort, selCount, onCompare, onClear }: {
  sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
  selCount: number; onCompare: () => void; onClear: () => void;
}) {
  const base: React.CSSProperties = { padding:"5px 13px", borderRadius:6, fontSize:12, fontWeight:600, border:"1px solid var(--card-border)", cursor:"pointer" };
  const on: React.CSSProperties = { ...base, background:"var(--accent)", color:"var(--btn-primary-text)", borderColor:"var(--accent)" };
  const off: React.CSSProperties = { ...base, background:"var(--card-bg)", color:"var(--text-muted)" };
  const arrow = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, flexWrap:"wrap" }}>
      <span style={{ fontSize:10.5, fontWeight:800, letterSpacing:".07em", textTransform:"uppercase", color:"var(--text-muted)" }}>排序</span>
      <button style={sortKey==="default" ? on : off} onClick={() => onSort("default")}>預設</button>
      <button style={sortKey==="cost"    ? on : off} onClick={() => onSort("cost")}>成本{arrow("cost")}</button>
      <button style={sortKey==="speed"   ? on : off} onClick={() => onSort("speed")}>速度{arrow("speed")}</button>
      {selCount > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
          <span style={{ fontSize:12, color:"var(--text-muted)" }}>已選 {selCount} 個（最多 4）</span>
          <button
            onClick={onCompare} disabled={selCount < 2}
            style={{ ...base, background: selCount>=2 ? "var(--accent)" : "var(--border)", color: selCount>=2 ? "var(--btn-primary-text)" : "var(--text-muted)", borderColor: selCount>=2 ? "var(--accent)" : "var(--border)", cursor: selCount>=2 ? "pointer" : "not-allowed" }}
          >比較 ⇄</button>
          <button style={off} onClick={onClear}>清除</button>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function AiModelsClient() {
  const [tab, setTab] = useState<Tab>("text");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selText,   setSelText]   = useState<Set<string>>(new Set());
  const [selImage,  setSelImage]  = useState<Set<string>>(new Set());
  const [selCoding, setSelCoding] = useState<Set<string>>(new Set());
  const [selVideo,  setSelVideo]  = useState<Set<string>>(new Set());
  const [selTts,    setSelTts]    = useState<Set<string>>(new Set());
  const [selSearch, setSelSearch] = useState<Set<string>>(new Set());
  const [cmpOpen, setCmpOpen] = useState(false);

  function handleSort(k: SortKey) {
    if (k === "default") { setSortKey("default"); setSortDir("asc"); return; }
    if (k === sortKey) { setSortDir((d) => d === "asc" ? "desc" : "asc"); }
    else { setSortKey(k); setSortDir("asc"); }
  }

  const curSel =
    tab === "text"   ? selText   :
    tab === "image"  ? selImage  :
    tab === "coding" ? selCoding :
    tab === "video"  ? selVideo  :
    tab === "tts"    ? selTts    : selSearch;
  const setCurSel =
    tab === "text"   ? setSelText   :
    tab === "image"  ? setSelImage  :
    tab === "coding" ? setSelCoding :
    tab === "video"  ? setSelVideo  :
    tab === "tts"    ? setSelTts    : setSelSearch;

  function toggle(id: string) {
    setCurSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }

  const dir = sortDir === "asc" ? 1 : -1;

  const sortedText = useMemo(() => {
    const r = [...TEXT_MODEL_COMPARISONS];
    if (sortKey === "cost")  r.sort((a, b) => (gen1kCostTwd(a.costInputPer1M, a.costOutputPer1M) - gen1kCostTwd(b.costInputPer1M, b.costOutputPer1M)) * dir);
    if (sortKey === "speed") r.sort((a, b) => (a.speedRank - b.speedRank) * dir);
    return r;
  }, [sortKey, sortDir]);

  const sortedImage = useMemo(() => {
    const r = [...TAROT_MODEL_COMPARISONS];
    if (sortKey === "cost")  r.sort((a, b) => (a.costUsd - b.costUsd) * dir);
    if (sortKey === "speed") r.sort((a, b) => (a.speedRank - b.speedRank) * dir);
    return r;
  }, [sortKey, sortDir]);

  const sortedCoding = useMemo(() => {
    const r = [...CODING_TOOL_COMPARISONS];
    if (sortKey === "cost")  r.sort((a, b) => (gen1kCostTwd(a.costInputPer1M, a.costOutputPer1M) - gen1kCostTwd(b.costInputPer1M, b.costOutputPer1M)) * dir);
    if (sortKey === "speed") r.sort((a, b) => (a.speedRank - b.speedRank) * dir);
    return r;
  }, [sortKey, sortDir]);

  const sortedVideo = useMemo(() => {
    const r = [...VIDEO_MODEL_COMPARISONS];
    if (sortKey === "cost")  r.sort((a, b) => (a.costPerSecUsd - b.costPerSecUsd) * dir);
    if (sortKey === "speed") r.sort((a, b) => (a.speedRank - b.speedRank) * dir);
    return r;
  }, [sortKey, sortDir]);

  const sortedTts = useMemo(() => {
    const r = [...TTS_MODEL_COMPARISONS];
    if (sortKey === "cost")  r.sort((a, b) => (a.costPer1kCharsUsd - b.costPer1kCharsUsd) * dir);
    if (sortKey === "speed") r.sort((a, b) => (a.speedRank - b.speedRank) * dir);
    return r;
  }, [sortKey, sortDir]);

  const sortedSearch = useMemo(() => {
    const r = [...SEARCH_API_COMPARISONS];
    if (sortKey === "cost")  r.sort((a, b) => (a.costPer1kQueriesUsd - b.costPer1kQueriesUsd) * dir);
    if (sortKey === "speed") r.sort((a, b) => ((LATENCY_RANK[a.latency] ?? 3) - (LATENCY_RANK[b.latency] ?? 3)) * dir);
    return r;
  }, [sortKey, sortDir]);

  const cmpModels = useMemo((): AnyModel[] => {
    if (tab === "text")   return TEXT_MODEL_COMPARISONS.filter((m) => selText.has(m.model)).map((m) => ({ ...m, _type: "text" as const }));
    if (tab === "image")  return TAROT_MODEL_COMPARISONS.filter((m) => selImage.has(m.id)).map((m) => ({ ...m, _type: "image" as const }));
    if (tab === "video")  return VIDEO_MODEL_COMPARISONS.filter((m) => selVideo.has(m.model)).map((m) => ({ ...m, _type: "video" as const }));
    if (tab === "tts")    return TTS_MODEL_COMPARISONS.filter((m) => selTts.has(m.model)).map((m) => ({ ...m, _type: "tts" as const }));
    if (tab === "search") return SEARCH_API_COMPARISONS.filter((m) => selSearch.has(m.product)).map((m) => ({ ...m, _type: "search" as const }));
    return CODING_TOOL_COMPARISONS.filter((m) => selCoding.has(m.tool)).map((m) => ({ ...m, _type: "coding" as const }));
  }, [tab, selText, selImage, selCoding, selVideo, selTts, selSearch]);

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding:"7px 18px", borderRadius:7, fontSize:13, fontWeight:700,
    border:"none", cursor:"pointer",
    background: active ? "var(--accent)" : "var(--bg-subtle)",
    color: active ? "var(--btn-primary-text)" : "var(--text-muted)",
  });

  function changeTab(t: Tab) { setTab(t); setSortKey("default"); setSortDir("asc"); setCmpOpen(false); }

  return (
    <>
      {/* Tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        <button style={tabBtn(tab==="text")}   onClick={() => changeTab("text")}>文字生成 {TEXT_MODEL_COMPARISONS.length}</button>
        <button style={tabBtn(tab==="image")}  onClick={() => changeTab("image")}>圖片生成 {TAROT_MODEL_COMPARISONS.length}</button>
        <button style={tabBtn(tab==="coding")} onClick={() => changeTab("coding")}>Coding 工具 {CODING_TOOL_COMPARISONS.length}</button>
        <button style={tabBtn(tab==="video")}  onClick={() => changeTab("video")}>影片生成 {VIDEO_MODEL_COMPARISONS.length}</button>
        <button style={tabBtn(tab==="tts")}    onClick={() => changeTab("tts")}>語音/TTS {TTS_MODEL_COMPARISONS.length}</button>
        <button style={tabBtn(tab==="search")} onClick={() => changeTab("search")}>搜尋 API {SEARCH_API_COMPARISONS.length}</button>
      </div>

      {/* Controls */}
      <Controls
        sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
        selCount={curSel.size}
        onCompare={() => setCmpOpen(true)}
        onClear={() => setCurSel(new Set())}
      />

      {/* Hint */}
      {curSel.size === 0 && (
        <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 12px" }}>
          ☑ 勾選最多 4 個模型後可點「比較 ⇄」並排對照
        </p>
      )}

      {/* Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(310px, 1fr))", gap:14 }}>
        {tab === "text"   && sortedText.map((m)   => <TextCard   key={m.model}   m={m} sel={selText.has(m.model)}      onToggle={() => toggle(m.model)} />)}
        {tab === "image"  && sortedImage.map((m)  => <ImageCard  key={m.id}      m={m} sel={selImage.has(m.id)}        onToggle={() => toggle(m.id)} />)}
        {tab === "coding" && sortedCoding.map((m) => <CodingCard key={m.tool}    m={m} sel={selCoding.has(m.tool)}     onToggle={() => toggle(m.tool)} />)}
        {tab === "video"  && sortedVideo.map((m)  => <VideoCard  key={m.model}   m={m} sel={selVideo.has(m.model)}     onToggle={() => toggle(m.model)} />)}
        {tab === "tts"    && sortedTts.map((m)    => <TtsCard    key={m.model}   m={m} sel={selTts.has(m.model)}       onToggle={() => toggle(m.model)} />)}
        {tab === "search" && sortedSearch.map((m) => <SearchCard key={m.product} m={m} sel={selSearch.has(m.product)}  onToggle={() => toggle(m.product)} />)}
      </div>

      {/* Compare modal */}
      {cmpOpen && cmpModels.length >= 2 && (
        <CompareModal models={cmpModels} onClose={() => setCmpOpen(false)} />
      )}
    </>
  );
}
