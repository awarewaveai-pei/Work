"use client";
// R4-D: the React side of scene-flow.ts -- the hook both entries (AI 一鍵設計, 畫面「AI 合成進場景」) hold, the candidate
// count buttons and the candidate grid with the priced 「生成其他 N 個尺寸」 button.
import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { DEFAULT_SCENE_COUNT, SCENE_COUNTS, ntdLabel } from "../banner-design";
import { PRESETS, mainOf, presetLabel, type PresetKey, type State } from "../banner-state";
import {
  EMPTY_VIEW, SIZE_DRAWING, guardOnDrawn, otherSizesLabel, otherSizesOf, sceneFlow, type FlowView, type OtherSizesMode,
} from "../scene-flow";

const modeFromUrl = (): OtherSizesMode =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("otherSizes") === "regenerate" ? "regenerate" : "extend";

export function useSceneFlow(o: { sRef: MutableRefObject<State>; setS: Dispatch<SetStateAction<State>>; kitColors: readonly string[] | null }) {
  const [view, setView] = useState<FlowView>(EMPTY_VIEW);
  const [count, setCount] = useState<number>(DEFAULT_SCENE_COUNT);
  const kit = useRef(o.kitColors);
  kit.current = o.kitColors;
  const [flow] = useState(() => sceneFlow({ current: () => o.sRef.current, apply: o.setS, view: setView, check: (st) => guardOnDrawn(st, kit.current) }));
  const [mode] = useState(modeFromUrl);
  const busy = view.cells.some((c) => c.state === "wait") || Object.values(view.sizeJobs).includes(SIZE_DRAWING);
  return { ...flow, view, count, setCount, busy, mode };
}
export type SceneFlowHandle = ReturnType<typeof useSceneFlow>;

/** 候選張數 buttons, each with its price. */
export function SceneCountRow({ flow, eachNtd }: { flow: SceneFlowHandle; eachNtd: number }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }} data-testid="banner-scene-count">
      <span style={{ fontSize: 12, minWidth: 56 }}>候選張數</span>
      {SCENE_COUNTS.map((n) => (
        <button key={n} type="button" className={flow.count === n ? "btn btn-primary" : "btn btn-ghost"}
          style={{ fontSize: 11, padding: "2px 7px", lineHeight: 1.3 }} onClick={() => flow.setCount(n)} data-testid={`banner-scene-count-${n}`}>
          {n} 張<span style={{ opacity: 0.75, marginLeft: 4 }}>{ntdLabel(n * eachNtd)}</span>
        </button>
      ))}
    </div>
  );
}

/** The candidates: a click previews one at the main size (free); the button below draws the other sizes (priced). */
export function ScenePicker({ flow, s }: { flow: SceneFlowHandle; s: State }) {
  const { cells, picked, sizeJobs, src } = flow.view;
  if (!cells.length || !src) return null;
  const main = PRESETS[mainOf(s).preset];
  const pickedCell = picked === null ? undefined : cells[picked];
  const others = otherSizesOf(s, pickedCell);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid="banner-scenes">
      <p className="form-hint" style={{ margin: 0 }}>{src.product
        ? "點一張預覽主尺寸（免費，商品已合成在場景裡，文字仍可編輯）。滿意再按下面的按鈕生成其他尺寸。"
        : "點一張當背景（免費；每個尺寸都用它裁切）。"}</p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`, gap: 6 }}>
        {cells.map((c, i) => c.state === "ok" ? (
          <button key={i} type="button" className="choice-card" aria-pressed={picked === i} data-testid={`banner-scene-${i}`} disabled={flow.busy}
            onClick={() => void flow.pick(i, c)} style={{ padding: 2 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.image} alt={`場景 ${i + 1}`} style={{ display: "block", width: "100%", aspectRatio: `${main.w} / ${main.h}`, objectFit: "cover", borderRadius: 4 }} />
          </button>
        ) : (
          <div key={i} className="choice-card" data-testid={`banner-scene-${i}`} style={{ fontSize: 11, minHeight: 60, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
            ...(c.state === "err" ? { color: "var(--badge-red-text)" } : {}) }}>
            {c.state === "wait" ? "生成中…" : c.error}
          </div>
        ))}
      </div>
      {pickedCell?.state === "ok" && others.length > 0 && (
        <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start", fontSize: 12 }} disabled={flow.busy}
          onClick={() => void flow.drawOthers(pickedCell, src, flow.mode)} data-testid="banner-scene-other-sizes">
          {otherSizesLabel(others.length, src.model, flow.mode)}
        </button>
      )}
      {Object.entries(sizeJobs).map(([k, msg]) => (
        <p key={k} className="form-hint" data-testid={`banner-scene-size-${k}`} style={{ margin: 0, ...(msg === SIZE_DRAWING ? {} : { color: "var(--badge-red-text)" }) }}>
          {presetLabel(k as PresetKey)}：{msg === SIZE_DRAWING ? "以選中的圖延伸成這個尺寸的比例中…" : `${msg}；這個尺寸暫用主尺寸的圖裁切`}
        </p>
      ))}
    </div>
  );
}
