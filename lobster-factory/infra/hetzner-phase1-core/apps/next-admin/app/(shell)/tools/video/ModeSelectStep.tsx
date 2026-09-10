"use client";

export type ProductionMode = "quick_video" | "remotion" | "short_drama" | "footage_edit";

const card: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14 };

const MODES: { id: ProductionMode; label: string; desc: string; badge: string }[] = [
  { id: "quick_video", label: "快速影片", desc: "腳本 → AI 生圖／Pexels → 配音 → ffmpeg 合成。最快、最常用。", badge: "$0 起" },
  { id: "remotion", label: "Remotion 模板", desc: "手動套版型模板，Remotion 渲染。單一模板單支影片。", badge: "手動模板" },
  { id: "short_drama", label: "短劇", desc: "跟快速影片同一條生產線，但套用你在上一步建立的 Story Bible（角色/場景/連續性規則）。", badge: "需先建 Bible" },
  { id: "footage_edit", label: "實拍剪輯", desc: "上傳自己的影片素材，剪切點＋輸出時間軸，Timeline 合成。", badge: "$0" },
];

export default function ModeSelectStep({
  value,
  onSelect,
}: {
  value: ProductionMode | null;
  onSelect: (mode: ProductionMode) => void;
}) {
  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>② 選擇製作模式</div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
          決定這支影片走哪條生產線；下一步的費用預覽跟素材輸入會依此改變。
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {MODES.map((m) => {
          const active = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              style={{
                ...card,
                textAlign: "left",
                cursor: "pointer",
                border: `2px solid ${active ? "var(--accent)" : "var(--border-subtle)"}`,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: active ? "var(--accent)" : "var(--text-primary)" }}>{m.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", background: "var(--bg-subtle)", padding: "2px 8px", borderRadius: 999 }}>{m.badge}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>{m.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
