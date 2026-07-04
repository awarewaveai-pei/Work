"use client";

import { STYLE_CATALOG } from "@/app/(shell)/tools/tarot/tarotStyles";
import { STUDIO_MODEL_OPTIONS, type StudioModel } from "@/lib/studio/model-options";

type Props = {
  selectedModels: Set<StudioModel>;
  style: string;
  onModelsChange: (models: Set<StudioModel>) => void;
  onStyleChange: (style: string) => void;
};

const STYLE_GROUPS = Array.from(new Set(STYLE_CATALOG.map((item) => item.group)));
const MODEL_GROUPS = Array.from(new Set(STUDIO_MODEL_OPTIONS.map((item) => item.group)));

export default function ImageStyleControls({
  selectedModels,
  style,
  onModelsChange,
  onStyleChange,
}: Props) {
  const isMulti = selectedModels.size > 1;

  return (
    <>
      <label style={{ fontSize: 13 }}>
        風格 Style
        <select
          className="btn-secondary"
          style={{ width: "100%", marginTop: 4 }}
          value={style}
          onChange={(event) => onStyleChange(event.target.value)}
        >
          <option value="">不指定</option>
          {STYLE_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {STYLE_CATALOG.filter((item) => item.group === group).map((item) => (
                <option key={item.zh} value={item.zh}>{item.zh}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div>
        <p style={{ fontSize: 13, marginBottom: 6 }}>
          圖片模型
          <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 6 }}>（點選 → 生成預覽；多選 → 同時比較）</span>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {MODEL_GROUPS.map((group) => (
            <div key={group}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                {group}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STUDIO_MODEL_OPTIONS.filter((item) => item.group === group).map((item) => {
                  const active = selectedModels.has(item.value);
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        onModelsChange((() => {
                          const next = new Set(selectedModels);
                          if (next.has(item.value)) {
                            if (next.size > 1) next.delete(item.value); // keep at least 1
                          } else {
                            next.add(item.value);
                          }
                          return next;
                        })());
                      }}
                      title={item.maxRefs > 0 ? `最多 ${item.maxRefs} 張參考圖` : "純文字生圖"}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 14,
                        fontSize: 12,
                        cursor: "pointer",
                        border: `1px solid ${active ? "#6366f1" : "var(--border, #333)"}`,
                        background: active ? "#6366f1" : "rgba(127,127,127,0.08)",
                        color: active ? "#fff" : "var(--text-muted, #888)",
                        fontWeight: active ? 600 : 400,
                        transition: "all 0.15s",
                      }}
                    >
                      {active && !isMulti ? "✓ " : active ? "☑ " : ""}
                      {item.label}
                      <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>NT${item.costNt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>
          {isMulti
            ? `已選 ${selectedModels.size} 個模型 → 點「生成」依序生成 ${selectedModels.size} 張比較圖`
            : (() => {
                const m = STUDIO_MODEL_OPTIONS.find((o) => selectedModels.has(o.value));
                return m?.maxRefs ? `此模型最多吃 ${m.maxRefs} 張參考圖` : "此模型不吃參考圖（純文字生圖）";
              })()}
        </p>
      </div>
    </>
  );
}
