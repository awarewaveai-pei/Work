"use client";
import { PRESETS, PRESET_GROUPS, editingSizeOf, enterSize, selectedSizes, toggleSizePick, type PresetKey } from "../banner-state";
import type { StepSlot } from "./order";
import { StepCard, type StepCtx } from "./ui";

export default function StepSize({ slot, s, setS }: StepCtx & { slot: StepSlot }) {
  const picked = selectedSizes(s);
  const multi = picked.length > 1;
  return (
    <StepCard title={slot.title} step={slot.no} icon="📐" summary={multi ? `${picked.length} 個 · 編輯 ${PRESETS[editingSizeOf(s)].ratio}` : PRESETS[s.preset].ratio}>
      {PRESET_GROUPS.map((grp) => (
        <div key={grp.key} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1, opacity: 0.5, marginBottom: 6 }}>
            {grp.label}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {(Object.keys(PRESETS) as PresetKey[])
              .filter((k) => PRESETS[k].shape === grp.key)
              .map((k) => {
                const ps = PRESETS[k];
                const isPicked = picked.includes(k), isEditing = editingSizeOf(s) === k;
                return (
                  <div key={k} style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
                  {/* paid generation is priced per picked size: the sizes wait for it (scene-flow.ts drawOthers) */}
                  <button data-testid={`banner-size-${k}`} aria-pressed={isPicked} disabled={s.generating}
                    className="choice-card" style={{ flex: 1, ...(isEditing && multi ? { outline: "2px solid var(--text-primary)", outlineOffset: 2 } : {}) }}
                    title={isPicked ? (picked.length > 1 ? "再按一下：不輸出這個尺寸" : "至少要留一個尺寸") : "按一下：加入要輸出的尺寸"}
                    onClick={() => setS((prev) => ({ ...toggleSizePick(prev, k), saved: false, error: null }))}>
                    <span className="choice-card-title">
                      {ps.ratio}{"star" in ps && ps.star ? " ★" : ""}
                      <span style={{ fontWeight: 400, marginLeft: 6 }}>{ps.use}</span>
                      <span className="choice-card-note" style={{ display: "inline", marginLeft: 6 }}>{ps.w}×{ps.h}</span>
                    </span>
                    <span className="choice-card-note">{ps.where}</span>
                    {isEditing && multi && <span className="choice-card-note" style={{ fontWeight: 700 }}>✎ 編輯中（預覽顯示這張）</span>}
                  </button>
                  {isPicked && !isEditing && (
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 6px", height: "auto" }} data-testid={`banner-size-edit-${k}`} disabled={s.generating}
                      onClick={() => setS((prev) => ({ ...enterSize(prev, k), saved: false }))}>改這張</button>
                  )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      <p className="form-hint" style={{ margin: "4px 0 0" }}>可以選好幾個尺寸一起做：按一下加入、再按一下取消。位置照比例換算、字依短邊縮放；按「改這張」或點預覽下方的縮圖單獨微調那個尺寸；全部下載在「匯出」。</p>
    </StepCard>
  );
}
