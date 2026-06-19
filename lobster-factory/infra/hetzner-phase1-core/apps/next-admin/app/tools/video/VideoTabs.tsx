"use client";

import { useState } from "react";
import VideoStudio from "./VideoStudio";
import ScriptForge from "./ScriptForge";

// /tools/video 外層分頁：📝前製腳本（ScriptForge）↔ 🎬影片生產（VideoStudio）。
// 接力：ScriptForge 按「送去生產影片」→ onSendToProduction(prefill) → 切到生產分頁，
// VideoStudio 重新掛載並以 initial 預填 topic/標題/內文（draft 流程不變）。
// 用條件渲染（非 CSS 隱藏）確保切到生產時 VideoStudio 以最新 prefill 重新 seed useState。

interface ProductionPrefill {
  topic: string;
  articleTitle: string;
  articleContent: string;
}

const TABS = [
  { id: "script" as const, label: "📝 前製腳本", desc: "用 AI 寫台詞、分鏡、字幕、標題" },
  { id: "produce" as const, label: "🎬 影片生產", desc: "腳本 → AI 生圖 → 配音 → MP4" },
];

export default function VideoTabs() {
  const [tab, setTab] = useState<"script" | "produce">("script");
  const [prefill, setPrefill] = useState<ProductionPrefill | undefined>(undefined);

  return (
    <div>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "10px 28px 0",
          background: "var(--bg-canvas)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.desc}
              style={{
                padding: "10px 18px",
                border: "none",
                borderBottom: `3px solid ${active ? "var(--accent)" : "transparent"}`,
                background: "transparent",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? "var(--accent)" : "var(--text-secondary)",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {t.label}
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
                {t.desc}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "script" ? (
        <ScriptForge
          onSendToProduction={(p) => {
            setPrefill(p);
            setTab("produce");
          }}
        />
      ) : (
        <VideoStudio initial={prefill} />
      )}
    </div>
  );
}
