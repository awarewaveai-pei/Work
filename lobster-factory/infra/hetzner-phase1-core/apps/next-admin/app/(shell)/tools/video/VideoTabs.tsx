"use client";

import { useRef, useState } from "react";
import VideoStudio from "./VideoStudio";
import ScriptForge from "./ScriptForge";
import type { ProductionInput, RemotionInput } from "./video-handoff";

// /tools/video 單頁雙區（原本是分頁，2026-06-26 整合為上下兩 section）：
//   Section 1（上）：📝 前製腳本（ScriptForge）— 用 AI 寫台詞、分鏡、字幕、標題
//   Section 2（下）：🎬 影片生產（VideoStudio）— 腳本 → AI 生圖 → 配音 → MP4
// 接力：ScriptForge「送去做影片」→ onSendToVideo(handoff) → 兩個引擎的 prefill 一起更新 + bump productionKey
//   → VideoStudio 以新 key 重新掛載、用 initial 重新 seed useState（VideoStudio 內部 seed 邏輯零改動）
//   → 平滑捲動到生產區。
// 為何用 key remount：VideoStudio 的 prefill 全走 useState 初始化（只在 mount 讀一次，見 VideoStudio.tsx:164/175/183/194-196）；
//   兩區常駐時不會自動 re-seed，換 key 強制 remount = 等同原本切分頁的重掛載行為。

const SECTION_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  padding: "14px 28px",
  background: "var(--bg-canvas)",
  borderBottom: "1px solid var(--border-subtle)",
};

export default function VideoTabs() {
  const [prefill, setPrefill] = useState<ProductionInput | undefined>(undefined);
  const [remotionPrefill, setRemotionPrefill] = useState<RemotionInput | undefined>(undefined);
  // 每次接力 +1 → 當作 VideoStudio 的 React key → 強制 remount 重新 seed prefill。
  const [productionKey, setProductionKey] = useState(0);
  const produceRef = useRef<HTMLDivElement>(null);

  // 接力後：bump key（觸發 remount）+ 捲動到生產區。produceRef 掛在常駐的外層 section，故捲動目標永遠存在。
  const goProduce = () => {
    setProductionKey((k) => k + 1);
    requestAnimationFrame(() =>
      produceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div>
      {/* ── Section 1：前製腳本 ── */}
      <section>
        <div style={SECTION_HEADER}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-text)" }}>📝 前製腳本</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>
            用 AI 寫台詞、分鏡、字幕、標題
          </span>
        </div>
        <ScriptForge
          onSendToVideo={(h) => {
            setPrefill(h.production);
            setRemotionPrefill(h.remotion);
            goProduce();
          }}
        />
      </section>

      {/* ── Section 2：影片生產 ── */}
      <section ref={produceRef} style={{ borderTop: "4px solid var(--border-subtle)" }}>
        <div style={SECTION_HEADER}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-text)" }}>🎬 影片生產</span>
          <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>
            腳本 → AI 生圖 → 配音 → MP4
          </span>
        </div>
        <VideoStudio key={productionKey} initial={prefill} remotionInitial={remotionPrefill} />
      </section>
    </div>
  );
}
