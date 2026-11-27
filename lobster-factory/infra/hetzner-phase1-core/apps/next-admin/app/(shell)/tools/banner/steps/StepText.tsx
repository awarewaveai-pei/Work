"use client";
import type { TypeSizes } from "../banner-layers";
import { FIELD_RANGES } from "../field-ranges";
import { FONTS, FONT_PAIRS, WEIGHTS, applyLayout, type State, type TextAlignH, type TextPos } from "../banner-state";
import type { StepSlot } from "./order";
import { ShadowControls, StepCard, type StepCtx } from "./ui";

/** `drawnType`: the px the preview drew -- the sliders show them: the engine's sizes with 自動字級 on, and a size set by
 *  hand that the layout shrank to fit (marked 已縮). */
export default function StepText({ slot, s, set, setS, drawnType }: StepCtx & { slot: StepSlot; drawnType: TypeSizes | null }) {
  const shown = { headlineSize: drawnType?.headline ?? s.headlineSize, subtextSize: drawnType?.subtext ?? s.subtextSize };
  const shrunk = (k: "headlineSize" | "subtextSize") => !s.typeAuto && shown[k] < s[k];
  // from 自動字級, a moved px slider fixes both at the sizes on screen (the other one must not jump to a stale value);
  // by hand, only the moved one changes (the other keeps what was set, shrunk or not)
  const setPx = (k: "headlineSize" | "subtextSize", v: number) =>
    setS((prev) => ({ ...prev, ...(prev.typeAuto ? shown : {}), typeAuto: false, [k]: v, saved: false, error: null }));
  const place = (patch: Partial<State>) => setS((prev) => ({ ...applyLayout(prev, patch), saved: false, error: null }));
  return (
    <StepCard title={slot.title} step={slot.no} icon="✍" summary={s.headline.replace(/\*\*/g, "").trim().slice(0, 14) || "未填標題"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
        <div className="form-row">
          <label className="form-label">標題</label>
          <input className="form-input" type="text" placeholder="主標題…"
            value={s.headline} onChange={(e) => set("headline", e.target.value)} />
        </div>
        <div className="form-row">
          <label className="form-label">副標</label>
          <input className="form-input" type="text" placeholder="副標題或 CTA…"
            value={s.subtext} onChange={(e) => set("subtext", e.target.value)} />
        </div>
        <div className="form-row">
          <label className="form-label">字體配對</label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {FONT_PAIRS.map((fp) => {
              const active = s.headlineFont === fp.headline && s.fontFamily === fp.body;
              return (
                <button key={fp.label}
                  className={active ? "btn btn-primary" : "btn btn-ghost"}
                  style={{ fontSize: 11, padding: "2px 7px" }}
                  onClick={() => setS((prev) => ({ ...prev, headlineFont: fp.headline, fontFamily: fp.body, saved: false }))}>
                  {fp.label}
                </button>
              );
            })}
          </div>
        </div>
        {([["標題字體", "headlineFont", "headlineWeight"], ["內文字體", "fontFamily", "bodyWeight"]] as const).map(([label, fk, wk]) => (
          <div key={fk} className="form-row" style={{ flexWrap: "wrap" }}>
            <label className="form-label">{label}</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
              {FONTS.map((f) => (
                <button key={f.value} className={s[fk] === f.value ? "btn btn-primary" : "btn btn-ghost"} data-testid={`banner-${fk}-${f.label}`}
                  style={{ fontSize: 12, padding: "2px 8px", fontFamily: f.value }} onClick={() => set(fk, f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", width: "100%", marginTop: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.7, minWidth: 36 }}>字重</span>
              {WEIGHTS.map((w) => (
                <button key={w.value} className={s[wk] === w.value ? "btn btn-primary" : "btn btn-ghost"} data-testid={`banner-${wk}-${w.value}`}
                  style={{ fontSize: 12, padding: "2px 8px", fontWeight: w.value }} onClick={() => set(wk, w.value)}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="form-row">
          <label className="form-label">字色</label>
          <input type="color" value={s.textColor} onChange={(e) => set("textColor", e.target.value)}
            style={{ width: 44, height: 32, border: "none", cursor: "pointer", background: "none" }} />
        </div>
        <div className="form-row">
          <label className="form-label">重點字</label>
          <input type="color" value={s.accentColor} onChange={(e) => set("accentColor", e.target.value)}
            style={{ width: 44, height: 32, border: "none", cursor: "pointer", background: "none" }} />
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
            <input type="checkbox" checked={s.accentHighlight} onChange={(e) => set("accentHighlight", e.target.checked)} />
            螢光底
          </label>
          <span className="form-hint" style={{ marginLeft: 6 }}>標題用 **字** 標重點，例：省 **50%**</span>
        </div>
        <div className="form-row">
          <label className="form-label">標題字距</label>
          <input type="range" {...FIELD_RANGES.letterSpacing} value={s.letterSpacing}
            onChange={(e) => set("letterSpacing", Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }}>{s.letterSpacing}</span>
        </div>
        <div className="form-row">
          <label className="form-label">標題行距</label>
          <input type="range" {...FIELD_RANGES.headlineLineHeight} value={s.headlineLineHeight} data-testid="banner-headline-leading"
            onChange={(e) => set("headlineLineHeight", Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }}>{s.headlineLineHeight.toFixed(2)}</span>
        </div>
        <div className="form-row">
          <label className="form-label">內文字距</label>
          <input type="range" {...FIELD_RANGES.bodyLetterSpacing} value={s.bodyLetterSpacing} data-testid="banner-body-tracking"
            onChange={(e) => set("bodyLetterSpacing", Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }}>{s.bodyLetterSpacing}</span>
        </div>
        <div className="form-row">
          <label className="form-label">內文行距</label>
          <input type="range" {...FIELD_RANGES.bodyLineHeight} value={s.bodyLineHeight} data-testid="banner-body-leading"
            onChange={(e) => set("bodyLineHeight", Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }}>{s.bodyLineHeight.toFixed(2)}</span>
        </div>
        <div className="form-row" style={{ flexWrap: "wrap", gap: 12 }}>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={s.kinsoku} onChange={(e) => set("kinsoku", e.target.checked)} data-testid="banner-kinsoku" />
            避頭尾（，。」等不放行首，「（等不放行尾）
          </label>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={s.cjkSpacing} onChange={(e) => set("cjkSpacing", e.target.checked)} data-testid="banner-cjk-spacing" />
            中英數字之間自動空半格
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">字級</label>
          <button className={s.typeAuto ? "btn btn-primary" : "btn btn-ghost"} style={{ fontSize: 12, padding: "3px 10px" }}
            data-testid="banner-type-auto" aria-pressed={s.typeAuto}
            onClick={() => setS((prev) => ({ ...prev, typeAuto: true, saved: false, error: null }))}>自動字級</button>
          <span className="form-hint" style={{ marginLeft: 6 }}>{s.typeAuto ? "依尺寸與字數自動放到最大；拉下面滑桿改手動" : "手動字級；按「自動字級」回到自動"}</span>
        </div>
        {([["標題 px", "headlineSize"], ["副標 px", "subtextSize"]] as const).map(([label, k]) => (
          <div key={k} className="form-row">
            <label className="form-label">{label}</label>
            <input type="range" {...FIELD_RANGES[k]} value={shown[k]} data-testid={`banner-${k}`}
              onChange={(e) => setPx(k, Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 28 }} data-testid={`banner-${k}-shown`}
              title={shrunk(k) ? `設定 ${s[k]} px，放不下已縮到 ${shown[k]} px` : undefined}>
              {shown[k]}{shrunk(k) ? `（已縮，設定 ${s[k]}）` : ""}
            </span>
          </div>
        ))}
        <div className="form-row">
          <label className="form-label">垂直</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["top", "center", "bottom"] as TextPos[]).map((pos) => (
              <button key={pos}
                className={s.textPos === pos ? "btn btn-primary" : "btn btn-ghost"}
                style={{ fontSize: 12, padding: "3px 10px" }}
                data-testid={`banner-text-pos-${pos}`} onClick={() => place({ textPos: pos })}>
                {{ top: "上", center: "中", bottom: "下" }[pos]}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label className="form-label">水平</label>
          <div style={{ display: "flex", gap: 6 }}>
            {(["left", "center", "right"] as TextAlignH[]).map((a) => (
              <button key={a}
                className={s.textAlignH === a ? "btn btn-primary" : "btn btn-ghost"}
                style={{ fontSize: 12, padding: "3px 10px" }}
                data-testid={`banner-text-align-${a}`} onClick={() => place({ textAlignH: a })}>
                {{ left: "左", center: "中", right: "右" }[a]}
              </button>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label className="form-label">描邊陰影</label>
          <input type="checkbox" checked={s.textOutline}
            onChange={(e) => set("textOutline", e.target.checked)} />
          <span className="form-hint" style={{ marginLeft: 6 }}>文字在雜亂背景上也清楚</span>
        </div>
        <ShadowControls label="文字陰影（標題、副標、價格、評價一起）" unit="字的大小" testId="banner-text-shadow"
          value={s.textShadow} onChange={(v) => set("textShadow", v)} />
        <div className="form-row">
          <label className="form-label">文字底襯</label>
          <input type="checkbox" checked={s.textScrim}
            onChange={(e) => set("textScrim", e.target.checked)} />
          <span className="form-hint" style={{ marginLeft: 6 }}>文字後方半透明板（比整張暗化高級）</span>
          {s.textScrim && (
            <>
              <input type="range" {...FIELD_RANGES.textScrimOpacity} value={s.textScrimOpacity}
                onChange={(e) => set("textScrimOpacity", Number(e.target.value))} style={{ flex: 1, minWidth: 80 }} />
              <span style={{ fontSize: 12, opacity: 0.7, minWidth: 32 }}>{Math.round(s.textScrimOpacity * 100)}%</span>
            </>
          )}
        </div>
        <div className="form-row">
          <label className="form-label">暗化背景</label>
          <input type="checkbox" checked={s.dimOverlay}
            onChange={(e) => set("dimOverlay", e.target.checked)} />
          <span className="form-hint" style={{ marginLeft: 6 }}>整張壓暗</span>
          {s.dimOverlay && (
            <>
              <input type="range" {...FIELD_RANGES.dimOverlayOpacity} value={s.dimOverlayOpacity}
                onChange={(e) => set("dimOverlayOpacity", Number(e.target.value))} style={{ flex: 1, minWidth: 80 }} />
              <span style={{ fontSize: 12, opacity: 0.7, minWidth: 32 }}>{Math.round(s.dimOverlayOpacity * 100)}%</span>
            </>
          )}
        </div>
      </div>
    </StepCard>
  );
}
