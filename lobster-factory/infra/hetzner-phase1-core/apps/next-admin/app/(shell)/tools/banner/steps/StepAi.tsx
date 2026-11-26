"use client";
// AI 文案與設計 (staff only): topic, tone, the two models and the two AI buttons; the copy pairs to pick from.
import { useState, type MutableRefObject } from "react";
import { BANNER_AI_MODELS, DEFAULT_COPY_MODEL, DEFAULT_DESIGN_MODEL, aiFormatError, askJsonWithRetry, bannerCallNtd, designPlan, ntdLabel, readAiStream, type BannerAiModel, type SizeSpec } from "../banner-design";
import { bgForPrompt, bgStatsFromColors, resolveDesignColors, usablePalette } from "../design-colors";
import type { useBrandKit } from "../kit/useBrandKit";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";
import {
  COPY_TONES, PRESETS, leaveSize, mainOf, measureBackground, presetLabel, sanitizeDesign, selectedSizes, variantOf,
  type BannerStaffApi, type CopyVariant, type PresetKey, type State,
} from "../banner-state";
import type { StepSlot } from "./order";
import { StepCard, type StepCtx } from "./ui";

export default function StepAi({ slot, s, set, setS, staff, brand, saveOrg, saveOrgRef }: StepCtx & {
  slot: StepSlot; staff: BannerStaffApi; brand: ReturnType<typeof useBrandKit>;
  saveOrg: string | null; saveOrgRef: MutableRefObject<string | null>;
}) {
  const { canUse, why } = usePaidFeatures();
  const p = PRESETS[s.preset];
  const picked = selectedSizes(s);
  const multi = picked.length > 1;

  // ── AI 一鍵設計整張：LLM 回傳一個 State patch（renderer 直接吃 → 幾乎零渲染成本）──
  async function generateFullDesign() {
    // the brand colours must be the picked client's: never design while its kit is still loading
    if (!s.copyBrief.trim() || !staff || brand.status === "loading") return;
    setS((prev) => ({ ...prev, designing: true, error: null }));
    try {
      // 多尺寸 ticked: one call, shared words / colours + a layout per size (card C9); none = the single-size call as before
      const m = mainOf(s);
      const spec = (k: PresetKey): SizeSpec => ({ key: k, ratio: PRESETS[k].ratio, use: PRESETS[k].use, w: PRESETS[k].w, h: PRESETS[k].h });
      const sel = selectedSizes(s);
      const chosen = sel.length > 1 ? sel.map(spec) : [];
      const mp = PRESETS[m.preset];
      // C12: the background (measured here, free) and the palette the AI assigns from: the brand kit's colours when the
      // organization has one, else the background's colours
      const bg = await measureBackground(m, sel).catch(() => ({ ...bgStatsFromColors("color", m.bgColor), mode: m.bgMode }));
      const kitColors = brand.kit?.colors.length ? brand.kit.colors : null;
      const orgAtStart = saveOrg;
      const palette = usablePalette(bg, kitColors);
      const fields = {
        brief: s.copyBrief, label: presetLabel(m.preset), w: mp.w, h: mp.h,
        bg: bgForPrompt(bg), palette, brandKit: !!kitColors,
        ...(chosen.length ? { sizes: [spec(m.preset), ...chosen.filter((c) => c.key !== m.preset)] } : {}),
      };
      // C10: an answer that does not parse is asked once more; still broken = an error naming what was billed
      const got = await askJsonWithRetry(async () => {
        const res = await staff.scriptForge("design", fields, designModel);
        if (!res.ok || !res.body) throw new Error(`設計生成失敗（${res.status}）`);
        return readAiStream(res);
      }, () => setAiRetrying("design"));
      setAiRetrying(null);
      if ("raw" in got) throw new Error(aiFormatError(got, bannerCallNtd(designModel, "design", Math.max(1, chosen.length))));
      const raw = (got.value && typeof got.value === "object" ? got.value : {}) as Record<string, unknown>;
      // the client was changed while the AI answered: these colours are the previous client's -- not applied
      if (saveOrgRef.current !== orgAtStart) throw new Error("設計途中換了客戶：這次結果用的是前一個客戶的品牌色，沒有套用，請再按一次。");
      const patch = sanitizeDesign(raw);
      const plan = designPlan(raw, spec(m.preset), chosen);
      setS((prev) => {
        const base = leaveSize(prev);
        const next: State = {
          ...base, ...patch, ...plan.main,
          sizeOverrides: chosen.length ? { ...base.sizeOverrides, ...plan.overrides } : base.sizeOverrides,
        };
        // colours are shared by every size: the text must read where it sits at each of them
        const places = selectedSizes(next).map((k) => { const v = variantOf(next, k); return { pos: v.textPos, align: v.textAlignH }; });
        const content = {
          subtext: !!next.subtext.trim(), trust: next.trustType !== "none",
          priceNow: next.showPrice && !!next.priceNow, priceWas: next.showPrice && !!next.priceWas,
        };
        const col = resolveDesignColors(raw, next, bg, places, palette, kitColors, content);
        if (col.unmet.length) console.warn("[banner] contrast not met after the guard:", col.unmet);
        return { ...next, ...col.patch, designing: false, saved: false };
      });
    } catch (err) {
      setAiRetrying(null);
      setS((prev) => ({ ...prev, designing: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  // card C9: the model each AI button runs on (visible buttons, NT$ per call shown); defaults from the 2026-11-26 bake-off
  const [copyModel, setCopyModel] = useState<BannerAiModel>(DEFAULT_COPY_MODEL);
  const [designModel, setDesignModel] = useState<BannerAiModel>(DEFAULT_DESIGN_MODEL);
  // C10: the AI button whose answer did not parse and is being asked once more
  const [aiRetrying, setAiRetrying] = useState<"copy" | "design" | null>(null);
  const modelRow = (label: string, value: BannerAiModel, onPick: (v: BannerAiModel) => void, task: "copy" | "design") => (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }} data-testid={`banner-model-${task}`}>
      <span style={{ fontSize: 12, minWidth: 56 }}>{label}</span>
      {BANNER_AI_MODELS.map((mo) => (
        <button key={mo.value} type="button" className={value === mo.value ? "btn btn-primary" : "btn btn-ghost"}
          style={{ fontSize: 11, padding: "2px 7px", lineHeight: 1.3 }} onClick={() => onPick(mo.value)} data-testid={`banner-model-${task}-${mo.value}`}>
          {mo.label}<span style={{ opacity: 0.75, marginLeft: 4 }}>{ntdLabel(bannerCallNtd(mo.value, task, task === "design" ? selectedSizes(s).length : 1))}</span>
        </button>
      ))}
    </div>
  );

  async function generateCopy() {
    if (!s.copyBrief.trim() || !staff) return;
    setS((prev) => ({ ...prev, copyGenerating: true, copyVariants: [], copyStream: "", error: null }));
    try {
      const platform = `${p.use}（${p.where}）`;
      const fields = { platform, label: presetLabel(s.preset), w: p.w, h: p.h, tone: s.copyTone, brief: s.copyBrief };
      const got = await askJsonWithRetry(async () => {
        const res = await staff.scriptForge("copy", fields, copyModel);
        if (!res.ok || !res.body) throw new Error(`文案生成失敗（${res.status}）`);
        return readAiStream(res, (full) => setS((prev) => ({ ...prev, copyStream: full })));
      }, () => setAiRetrying("copy"));
      setAiRetrying(null);
      if ("raw" in got) throw new Error(aiFormatError(got, bannerCallNtd(copyModel, "copy")));
      const parsed = (got.value && typeof got.value === "object" ? got.value : {}) as { variants?: CopyVariant[] };
      const variants = Array.isArray(parsed.variants) ? parsed.variants : [];
      setS((prev) => ({ ...prev, copyGenerating: false, copyVariants: variants, copyStream: "" }));
    } catch (err) {
      setAiRetrying(null);
      setS((prev) => ({ ...prev, copyGenerating: false, copyStream: "", error: err instanceof Error ? err.message : String(err) }));
    }
  }

  return (
    <StepCard title={slot.title} step={slot.no} icon="✨" defaultOpen summary={s.copyBrief.trim().slice(0, 14) || "未填主題"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        <div className="form-row">
          <label className="form-label">主題</label>
          <textarea
            className="form-input"
            rows={2}
            placeholder="產品/服務一句話描述，例：有機冷壓橄欖油，主打健康家庭"
            value={s.copyBrief}
            onChange={(e) => set("copyBrief", e.target.value)}
            style={{ resize: "vertical", fontSize: 13 }}
          />
        </div>
        <div className="form-row">
          <label className="form-label">語氣</label>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {COPY_TONES.map((t) => (
              <button key={t}
                className={s.copyTone === t ? "btn btn-primary" : "btn btn-ghost"}
                style={{ fontSize: 12, padding: "3px 8px" }}
                onClick={() => set("copyTone", t)}
              >{t}</button>
            ))}
          </div>
        </div>
        {modelRow("文案模型", copyModel, setCopyModel, "copy")}
        {modelRow("設計模型", designModel, setDesignModel, "design")}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button title={why("video.script")} className="btn btn-primary" disabled={(s.copyGenerating || s.designing || !s.copyBrief.trim()) || !canUse("video.script")}
            onClick={generateCopy} data-testid="banner-ai-copy">
            {aiRetrying === "copy" ? "重試中…" : s.copyGenerating ? "生成中…" : `生成文案（${ntdLabel(bannerCallNtd(copyModel, "copy"))}）`}
          </button>
          <button title={why("video.script")} className="btn btn-primary" disabled={(s.designing || s.copyGenerating || !s.copyBrief.trim() || brand.status === "loading") || !canUse("video.script")}
            onClick={generateFullDesign} data-testid="banner-ai-design">
            {aiRetrying === "design" ? "重試中…" : s.designing ? "設計中…" : brand.status === "loading" ? "正在載入品牌色…" : `✨ AI 一鍵設計整張（${ntdLabel(bannerCallNtd(designModel, "design", picked.length))}）`}
          </button>
        </div>
        {brand.status === "error" && !brand.kit && (
          <p className="form-hint" data-testid="banner-kit-failed" style={{ margin: 0, color: "var(--badge-red-text)" }}>這個客戶的品牌色載入失敗：這次 AI 一鍵設計不套品牌色。</p>
        )}
        <p className="form-hint">「一鍵設計」讓 AI 直接配好標題/重點字/CTA/徽章/價格/配色/版面 — 再微調即可。{multi ? `已選 ${picked.length} 個尺寸：文案配色共用，每個尺寸各排一個版面。` : ""}</p>
        {s.copyGenerating && s.copyStream && (
          <div style={{ fontSize: 11, opacity: 0.5, fontFamily: "monospace", maxHeight: 40, overflow: "hidden" }}>
            {s.copyStream.slice(-80)}
          </div>
        )}
        {s.copyVariants.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            {s.copyVariants.map((v, i) => (
              <button key={i} type="button" className="choice-card" data-testid={`banner-copy-${i}`}
                aria-pressed={s.headline === v.headline && s.subtext === v.subtext}
                onClick={() => setS((prev) => ({ ...prev, headline: v.headline, subtext: v.subtext, saved: false, error: null }))}>
                <span className="choice-card-title">{v.headline}</span>
                <span className="choice-card-note">{v.subtext}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </StepCard>
  );
}
