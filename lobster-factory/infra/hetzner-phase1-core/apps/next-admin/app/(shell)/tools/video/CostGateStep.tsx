"use client";

import { computeVideoCost } from "@/lib/content/video/video-cost";
import { usdToNtd } from "@/lib/ai/cost-calculator";
import type { ProductionMode } from "./ModeSelectStep";

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };

const NT = (usd: number) => `NT$${usdToNtd(usd).toLocaleString("zh-TW", { maximumFractionDigits: usd < 0.01 ? 4 : 2 })}`;

/**
 * 這是「確認才能繼續」的粗估閘（用預設場景組成試算），不是最終帳單——④ 生成或選取素材
 * 那步的既有表單（素材模式/生圖模型/配音/比例）會依實際設定即時重算精確金額。這裡的目的
 * 只是讓使用者在填任何細節之前，先知道這條路線大概要花多少錢再決定要不要繼續。
 */
export default function CostGateStep({ mode, introCard, onConfirm }: { mode: ProductionMode; introCard: boolean; onConfirm: () => void }) {
  const estimate =
    mode === "quick_video" || mode === "short_drama"
      ? computeVideoCost({ totalScenes: 6, customScenes: 3, brollScenes: 3, ttsProvider: "edge", ttsChars: 600 })
      : null;

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>③ 費用預覽與確認</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
          確認可接受的費用範圍後才進下一步；實際設定（場景數、生圖模型、輸出比例）會在下一步即時更新精確金額。
        </div>
      </div>

      {estimate && (
        <div style={card}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>預設組成粗估（6 場景 / AI 生圖 3 場 / Edge 免費配音）</div>
          {estimate.lines.filter((l) => !l.free).map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: "var(--text-secondary)" }}>{l.icon} {l.label}</span>
              <span style={{ fontFamily: "monospace" }}>{NT(l.totalUsd)}</span>
            </div>
          ))}
          <div style={{ borderTop: "2px solid var(--border-subtle)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>粗估合計</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: "var(--accent-text)" }}>{NT(estimate.totalUsd)}</span>
          </div>
        </div>
      )}

      {mode === "footage_edit" && (
        <div style={{ ...card, color: "var(--badge-green-text)", background: "var(--badge-green-bg)", border: "1px solid var(--green)" }}>
          <b>$0 免費</b> — 上傳自己的素材＋Timeline 合成，沒有 AI 生成/配音費用。
        </div>
      )}

      {introCard && (
        <div style={{ ...card, color: "var(--text-secondary)" }}>
          片頭／廣告卡（Remotion）沒有自動試算——費用依 render service 實際用量計，送出渲染後才會知道確切金額。
        </div>
      )}

      <button
        type="button"
        onClick={onConfirm}
        style={{ padding: "12px 0", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--btn-primary-text)", fontWeight: 700, fontSize: 14, cursor: "pointer", width: 220 }}
      >
        確認，繼續 →
      </button>
    </div>
  );
}
