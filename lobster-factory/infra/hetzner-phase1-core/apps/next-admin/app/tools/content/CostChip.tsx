"use client";

import { useState } from "react";

export interface CostLineItem {
  route: string;
  model: string;
  vendor: string;
  usd: number;
  kind: "text" | "image";
}

export interface SessionCost {
  lines: CostLineItem[];
  totalUsd: number;
  textUsd: number;
  imageUsd: number;
}

interface Props {
  cost: SessionCost | null;
}

const ROUTE_LABEL: Record<string, string> = {
  "content/article-generate":  "文章生成",
  "content/fetchRealSources":  "Perplexity 搜尋",
  "content/title":             "標題生成",
  "content/keywords":          "關鍵字",
  "content/outline":           "大綱",
  "content/market-analysis":   "市場分析",
  "content/seo-fix":           "SEO 修正",
  "content/syndicate":         "社群改寫",
  "content/humanize":          "人性化改寫",
  "content/image":             "圖片生成",
  "content/hero-image":        "首圖生成",
};

function routeLabel(route: string): string {
  return ROUTE_LABEL[route] ?? route;
}

function fmt(usd: number): string {
  if (usd === 0) return "$0.0000";
  if (usd < 0.00005) return `$${usd.toFixed(6)}`;
  if (usd < 0.01)    return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}

export function CostChip({ cost }: Props) {
  const [open, setOpen] = useState(false);

  if (!cost) return null;

  const textLines  = cost.lines.filter(l => l.kind === "text");
  const imageLines = cost.lines.filter(l => l.kind === "image");

  return (
    <div style={{ display: "inline-block", position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          padding: "4px 10px",
          fontSize: "12px", fontWeight: 600,
          background: "var(--bg-subtle)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-muted)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>本次費用</span>
        <span style={{ color: "var(--text-primary)" }}>{fmt(cost.totalUsd)}</span>
        <span style={{ fontSize: "10px", opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          minWidth: "320px", zIndex: 50,
          background: "var(--bg-card)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          overflow: "hidden",
        }}>
          {/* Text costs */}
          {textLines.length > 0 && (
            <>
              <div style={{ padding: "8px 12px 4px", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", background: "var(--bg-subtle)", borderBottom: "1px solid var(--card-border)" }}>
                LLM 文字  ·  {fmt(cost.textUsd)}
              </div>
              {textLines.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderBottom: "1px solid var(--card-border)", gap: "8px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: "var(--text-primary)" }}>{routeLabel(l.route)}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{l.model} · {l.vendor}</div>
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}>{fmt(l.usd)}</div>
                </div>
              ))}
            </>
          )}

          {/* Image costs */}
          {imageLines.length > 0 && (
            <>
              <div style={{ padding: "8px 12px 4px", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", background: "var(--bg-subtle)", borderBottom: "1px solid var(--card-border)" }}>
                圖片生成  ·  {fmt(cost.imageUsd)}
              </div>
              {imageLines.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", borderBottom: "1px solid var(--card-border)", gap: "8px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: "var(--text-primary)" }}>{routeLabel(l.route)}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{l.model}</div>
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", flexShrink: 0 }}>{fmt(l.usd)}</div>
                </div>
              ))}
            </>
          )}

          {/* Total row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--bg-subtle)" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>總計</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{fmt(cost.totalUsd)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
