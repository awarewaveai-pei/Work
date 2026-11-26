"use client";
import { TEMPLATES, applyLayout, openerPlaceholders, templatePatch, type State } from "../banner-state";
import type { StepSlot } from "./order";
import { StepCard, type StepCtx } from "./ui";

export default function StepTemplate({ slot, s, setS }: StepCtx & { slot: StepSlot }) {
  const applyTemplate = (patch: Partial<State>) =>
    setS((prev) => ({ ...applyLayout(prev, patch), saved: false, error: null }));
  return (
    <StepCard title={slot.title} step={slot.no} icon="🧩" summary="套用排好的版面">
      <p className="form-hint" style={{ marginBottom: 8, marginTop: 8 }}>套用後再填內容；只改版面/元素，不動你的文字與圖。</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {TEMPLATES.filter((t) => !t.group).map((t) => (
          <button key={t.key} className="btn btn-ghost"
            style={{ fontSize: 12, padding: "8px 6px", textAlign: "left", lineHeight: 1.3 }}
            onClick={() => applyTemplate(templatePatch(t, s.preset))}>
            <span style={{ fontSize: 15, marginRight: 4 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      {/* card R3: cards a video opens with (存到我的設計 -> the editor's 片頭 「從我的設計挑」) */}
      <p className="form-hint" style={{ margin: "10px 0 6px" }}>做影片開頭的標題卡：選一種版面 → 改字 → 存到我的設計，之後在影片剪輯的片頭選「橫幅字卡」使用</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {TEMPLATES.filter((t) => t.group === "opener").map((t) => (
          <button key={t.key} className="btn btn-ghost"
            style={{ fontSize: 12, padding: "8px 6px", textAlign: "left", lineHeight: 1.3 }}
            onClick={() => applyTemplate({ ...templatePatch(t, s.preset), ...openerPlaceholders(t.key, s) })}>
            <span style={{ fontSize: 15, marginRight: 4 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
    </StepCard>
  );
}
