"use client";
// AI 文案與設計 (staff only): topic, tone, the two models and the two AI buttons; the copy pairs to pick from.
import { useState, type MutableRefObject } from "react";
import {
  BANNER_AI_MODELS, DEFAULT_COPY_MODEL, DEFAULT_DESIGN_MODEL, aiFormatError, askJsonWithRetry,
  bannerCallNtd, copyWords, designPlan, ntdLabel, readAiStream, sanitizeCopyVariants, showsCopy,
  type BannerAiModel, type DesignCopy, type SizeSpec,
} from "../banner-design";
import { guardLane, sameDrawInputs } from "../contrast-run";
import { applySemantic, productDrawn } from "../banner-layout";
import { bgForPrompt, bgStatsFromColors, usablePalette, type GuardResult } from "../design-colors";
import { brandKitPatch } from "../kit/apply-kit";
import type { useBrandKit } from "../kit/useBrandKit";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";
import { STUDIO_MODEL_OPTIONS } from "@/lib/studio/model-options";
import {
  COPY_TONES, PRESETS, applyLayout, groundingOn, leaveSize, mainOf, measureBackground, presetLabel, sanitizeDesign, selectedSizes,
  type BannerStaffApi, type CopyVariant, type PresetKey, type SizePatch, type State,
} from "../banner-state";
import { compositeModel, guardOnDrawn, imageNtd } from "../scene-flow";
import type { StepSlot } from "./order";
import { SceneCountRow, ScenePicker, type SceneFlowHandle } from "./SceneFlow";
import { StepCard, type StepCtx } from "./ui";

/** The scene description every picture of one design shares (the AI's subject and vibe). */
const sceneOf = (st: State): string => [st.aiBgSubject.trim(), st.aiBgVibe.trim()].filter(Boolean).join(", ");

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function StepAi({ slot, s, set, setS, flow, sRef, staff, brand, saveOrg, saveOrgRef }: StepCtx & {
  slot: StepSlot; flow: SceneFlowHandle; sRef: MutableRefObject<State>; staff: BannerStaffApi; brand: ReturnType<typeof useBrandKit>;
  saveOrg: string | null; saveOrgRef: MutableRefObject<string | null>;
}) {
  const { canUse, why } = usePaidFeatures();
  const p = PRESETS[s.preset];
  const picked = selectedSizes(s);
  const multi = picked.length > 1;
  // one lane per action: a newer AI design / word-set pick supersedes an older one still being checked
  const lane = () => guardLane<State, GuardResult>({ same: sameDrawInputs, current: () => sRef.current, apply: setS });
  const [designLane] = useState(lane);
  const [copyLane] = useState(lane);
  // an uploaded picture is the user's: the design keeps it and draws no scenes
  const drawsScenes = !(mainOf(s).bgMode === "upload" && !!mainOf(s).bgImage);
  const hasProduct = !!mainOf(s).productImage;
  const sceneNtd = imageNtd(hasProduct ? compositeModel(s.aiBgModel) : s.aiBgModel);

  // ── AI 一鍵設計整張：LLM 回傳一個 State patch（renderer 直接吃 → 幾乎零渲染成本）──
  async function generateFullDesign() {
    // the brand colours must be the picked client's: never design while its kit is still loading
    if (!s.copyBrief.trim() || !staff || brand.status === "loading") return;
    // the design call and its scenes are ONE paid run (scene-flow.ts hold): no other paid scene work can take the slot
    // between them; refused (another paid run holds it) = nothing sent, nothing billed
    if (s.generating) return;
    const scenesWanted = drawsScenes ? flow.count : 0;
    await flow.hold(async (drawHere) => {
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
        const kit = brand.kit;
        const kitColors = kit?.colors.length ? kit.colors : null;
        const orgAtStart = saveOrg;
        const palette = usablePalette(bg, kitColors);
        // R2-C: the client's kit brings its fonts and logo; the logo is read while the AI answers
        const kitJob = kit ? brandKitPatch(kit, false) : Promise.resolve(null);
        const fields = {
          brief: s.copyBrief, label: presetLabel(m.preset), w: mp.w, h: mp.h,
          bg: bgForPrompt(bg), palette, brandKit: !!kitColors,
          hasProduct: !!m.productImage, productPos: m.productPos, hasLogo: !!(m.logoImage || kit?.logo),
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
        const kitPart = await kitJob;
        // the client was changed while the AI answered: these colours are the previous client's -- not applied
        if (saveOrgRef.current !== orgAtStart) throw new Error("設計途中換了客戶：這次結果用的是前一個客戶的品牌色，沒有套用，請再按一次。");
        const variants = sanitizeCopyVariants(raw.copyVariants);
        const plan = designPlan(raw, spec(m.preset), chosen);
        // the design on a given state: the answer, the first word set, the kit's fonts / logo and type sized automatically,
        // through applyLayout like any position button (a moved element loses its drag at every size that inherits the
        // move); then each chosen size's own layout onto its tweak, the same way
        const build = (prev: State): State => {
          const main = applyLayout(leaveSize(prev), {
            ...sanitizeDesign(raw), ...(variants[0] ? copyWords(variants[0]) : {}), ...(kitPart?.patch ?? {}),
            ...(variants.length ? { copyVariants: variants } : {}), ...plan.main, typeAuto: true,
          });
          const sizeOverrides = { ...main.sizeOverrides };
          for (const [k, l] of Object.entries(plan.overrides) as [PresetKey, SizePatch][]) sizeOverrides[k] = applySemantic(sizeOverrides[k] ?? {}, l);
          // a product the program draws over the design sits in it: contact shadow, reflection, tone match on
          return { ...main, sizeOverrides, ...(productDrawn(main) ? { grounding: groundingOn(main.grounding) } : {}) };
        };
        // contrast on what will be drawn: the latest state with the answer on it (a background changed while the AI answered
        // is measured again); the roles index the palette the prompt was given
        let applied = null as State | null; // set by the merge below (a closure: the cast keeps TS from narrowing it to null)
        await designLane.run(build, (st) => guardOnDrawn(st, kitColors, { raw, palette }),
          (built, col) => (applied = { ...built, ...col.patch, designing: false, saved: false, ...(kitPart?.logoError ? { error: kitPart.logoError } : {}) }),
          (prev, err) => ({ ...prev, designing: false, error: `對比檢查失敗（${errText(err)}）：這次設計沒有套用，請再按一次。` }));
        if (applied && scenesWanted) {
          const am = mainOf(applied);
          await drawHere(applied, scenesWanted, {
            scene: sceneOf(am), product: am.productImage, model: am.productImage ? compositeModel(am.aiBgModel) : am.aiBgModel, styleRefs: [],
          });
        }
      } catch (err) {
        setAiRetrying(null);
        setS((prev) => ({ ...prev, designing: false, error: err instanceof Error ? err.message : String(err) }));
      }
    });
  }

  // a word set swapped in: the new words' boxes are checked like an AI design (only colours that fail change); one
  // history step (words and any colour fix together)
  async function pickCopy(v: DesignCopy) {
    const kitColors = brand.kit?.colors.length ? brand.kit.colors : null;
    await copyLane.run((prev) => ({ ...prev, ...copyWords(v) }), (st) => guardOnDrawn(st, kitColors),
      (built, g) => ({ ...built, ...g.patch, saved: false, error: null }),
      (prev, err) => ({ ...prev, error: `對比檢查失敗（${errText(err)}）：沒有換成這組字，請再點一次。` }));
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
          <button title={why("video.script")} className="btn btn-primary" disabled={(s.designing || s.generating || flow.busy || s.copyGenerating || !s.copyBrief.trim() || brand.status === "loading") || !canUse("video.script")}
            onClick={generateFullDesign} data-testid="banner-ai-design">
            {aiRetrying === "design" ? "重試中…" : s.designing ? "設計中…" : flow.busy ? "場景生成中…" : brand.status === "loading" ? "正在載入品牌色…"
              : `✨ AI 一鍵設計整張（${drawsScenes ? `設計 ${ntdLabel(bannerCallNtd(designModel, "design", picked.length))} ＋ 場景候選 ${flow.count} 張，每張 ${ntdLabel(sceneNtd)}` : ntdLabel(bannerCallNtd(designModel, "design", picked.length))}）`}
          </button>
        </div>
        {drawsScenes ? (
          <>
            <SceneCountRow flow={flow} eachNtd={sceneNtd} />
            <span className="form-hint" style={{ margin: 0 }}>圖片模型：{STUDIO_MODEL_OPTIONS.find((mo) => mo.value === (hasProduct ? compositeModel(s.aiBgModel) : s.aiBgModel))?.label}（在「畫面」步驟換{hasProduct ? "；有商品圖時用會合成商品的模型" : ""}）</span>
          </>
        ) : (
          <p className="form-hint" style={{ margin: 0 }}>背景是你上傳的圖片：一鍵設計保留它，不另生成場景。</p>
        )}
        <ScenePicker flow={flow} s={s} />
        {brand.status === "error" && !brand.kit && (
          <p className="form-hint" data-testid="banner-kit-failed" style={{ margin: 0, color: "var(--badge-red-text)" }}>這個客戶的品牌色載入失敗：這次 AI 一鍵設計不套品牌色。</p>
        )}
        <p className="form-hint">「一鍵設計」讓 AI 直接配好標題/重點字/CTA/徽章/價格/配色/版面，另附 5 組文案可換；選的客戶有品牌套組時一併套用字體與 logo。{multi ? `已選 ${picked.length} 個尺寸：文案配色共用，每個尺寸各排一個版面。` : ""}</p>
        {s.copyGenerating && s.copyStream && (
          <div style={{ fontSize: 11, opacity: 0.5, fontFamily: "monospace", maxHeight: 40, overflow: "hidden" }}>
            {s.copyStream.slice(-80)}
          </div>
        )}
        {s.copyVariants.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
            <p className="form-hint" style={{ margin: 0 }}>點一組就換上這組字；版面不變，字變長時會自動確保看得清楚。</p>
            {(s.copyVariants as DesignCopy[]).map((v, i) => (
              <button key={i} type="button" className="choice-card" data-testid={`banner-copy-${i}`}
                aria-pressed={showsCopy(s, v)}
                onClick={() => void pickCopy(v)}>
                <span className="choice-card-title">{v.headline.replaceAll("**", "")}</span>
                <span className="choice-card-note">{v.subtext}</span>
                {(v.ctaText || v.badgeText) && (
                  <span className="choice-card-note">{[v.ctaText && `按鈕：${v.ctaText}`, v.badgeText && `徽章：${v.badgeText}`].filter(Boolean).join("　")}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </StepCard>
  );
}
