"use client";

import { STYLE_CATALOG } from "@/app/tools/tarot/tarotStyles";
import { STUDIO_MODEL_OPTIONS, type StudioModel } from "@/lib/studio/model-options";

type Props = {
  model: StudioModel;
  style: string;
  onModelChange: (model: StudioModel) => void;
  onStyleChange: (style: string) => void;
};

const STYLE_GROUPS = Array.from(new Set(STYLE_CATALOG.map((item) => item.group)));
const MODEL_GROUPS = Array.from(new Set(STUDIO_MODEL_OPTIONS.map((item) => item.group)));

export default function ImageStyleControls({
  model,
  style,
  onModelChange,
  onStyleChange,
}: Props) {
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

      <label style={{ fontSize: 13 }}>
        圖片模型
        <select
          className="btn-secondary"
          style={{ width: "100%", marginTop: 4 }}
          value={model}
          onChange={(event) => onModelChange(event.target.value as StudioModel)}
        >
          {MODEL_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {STUDIO_MODEL_OPTIONS.filter((item) => item.group === group).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}（~NT${item.costNt}{item.maxRefs > 0 ? ` · ${item.maxRefs} 參考圖` : ""}）
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </>
  );
}
