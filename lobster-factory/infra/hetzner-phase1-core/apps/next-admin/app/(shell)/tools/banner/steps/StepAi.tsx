"use client";
// AI 文案與設計 (staff only): topic, tone, the two models and the two AI buttons; the copy pairs to pick from.
import { useState, type MutableRefObject } from "react";
import {
  BANNER_AI_MODELS, DEFAULT_COPY_MODEL, DEFAULT_DESIGN_MODEL, DEFAULT_SCENE_COUNT, SCENE_COUNTS, aiFormatError, askJsonWithRetry,
  bannerCallNtd, compositePrompt, copyWords, designPlan, ntdLabel, readAiStream, sanitizeCopyVariants, scenePrompt, showsCopy,
  type BannerAiModel, type DesignCopy, type SizeSpec,
} from "../banner-design";
import { renderBannerLayers } from "../banner-layers";
import { guardLane, sameDrawInputs } from "../contrast-run";
import { applySemantic, productDrawn } from "../banner-layout";
import { bgForPrompt, bgStatsFromColors, guardDrawn, usablePalette, type GuardResult, type PxBox } from "../design-colors";
import { brandKitPatch } from "../kit/apply-kit";
import type { useBrandKit } from "../kit/useBrandKit";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";
import { STUDIO_MODEL_OPTIONS } from "@/lib/studio/model-options";
import {
  COPY_TONES, PRESETS, applyLayout, groundingOn, leaveSize, mainOf, measureBackground, presetLabel, sanitizeDesign, sceneBackground, selectedSizes,
  variantOf, withSharedBackground, withSizeBackgrounds, type BannerStaffApi, type CopyVariant, type PresetKey, type SizePatch, type State,
} from "../banner-state";
import { compositeModel, compositeSizes, drawnAreas, generateBgPicture, imageNtd } from "./StepCanvas";
import type { StepSlot } from "./order";
import { StepCard, type StepCtx } from "./ui";

/** One AI 一鍵設計 scene cell: drawing, drawn (the picture and the product picture composited into it, null = plain
 *  scene), or failed (the message, billed amount at most one picture). */
type SceneCell = { state: "wait" } | { state: "ok"; image: string; product: string | null } | { state: "err"; error: string };
/** The scene description every picture of one design shares (the AI's subject and vibe). */
const sceneOf = (st: State): string => [st.aiBgSubject.trim(), st.aiBgVibe.trim()].filter(Boolean).join(", ");

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
/** The elements drawn in textColor: the contrast guard measures the background under these boxes. */
const TEXT_ELEMS = ["headline", "subtext", "price", "trust"] as const;

/** Contrast on `st` as the renderer draws it: every picked size rendered for its text boxes, the background measured from
 *  `st` itself (never an earlier measurement), then guardDrawn. Free (browser only). A result is applied only through a
 *  guardLane (contrast-run.ts): to a design whose inputs are still the ones measured here, by the newest run. */
async function guardOnDrawn(st: State, kit: readonly string[] | null, roles?: { raw: Record<string, unknown>; palette: readonly string[] }): Promise<GuardResult> {
  const sel = selectedSizes(st), m = mainOf(st);
  const bg = await measureBackground(m, sel); // a picture that cannot be read fails the check (no stand-in background)
  const drawn = await Promise.all(sel.map(async (k) => {
    const doc = await renderBannerLayers(variantOf(st, k), PRESETS[k], { flat: true });
    return { w: doc.w, h: doc.h, boxes: TEXT_ELEMS.map((e) => doc.boxes[e]).filter((b): b is PxBox => !!b) };
  }));
  const g = guardDrawn(st, bg, drawn, kit, roles);
  if (g.unmet.length) console.warn("[banner] contrast not met after the guard:", g.unmet);
  return g;
}

export default function StepAi({ slot, s, set, setS, sRef, staff, brand, saveOrg, saveOrgRef }: StepCtx & {
  slot: StepSlot; sRef: MutableRefObject<State>; staff: BannerStaffApi; brand: ReturnType<typeof useBrandKit>;
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
  const [sceneLane] = useState(lane);
  // R3-C: the scenes AI 一鍵設計 draws to pick from (not design state: pictures to choose, kept until the next design)
  const [sceneCount, setSceneCount] = useState<number>(DEFAULT_SCENE_COUNT);
  const [scenes, setScenes] = useState<SceneCell[]>([]);
  const [scenePicked, setScenePicked] = useState<number | null>(null);
  // the other picked sizes' pictures after a pick: "生成中…" while drawing, else the failure message
  const [sizeJobs, setSizeJobs] = useState<Partial<Record<PresetKey, string>>>({});
  // an uploaded picture is the user's: the design keeps it and draws no scenes
  const drawsScenes = !(mainOf(s).bgMode === "upload" && !!mainOf(s).bgImage);
  const hasProduct = !!mainOf(s).productImage;
  const sceneNtd = imageNtd(hasProduct ? compositeModel(s.aiBgModel) : s.aiBgModel);
  const otherSizes = hasProduct ? picked.length - 1 : 0; // a product scene is drawn again at each other size's ratio

  // ── AI 一鍵設計整張：LLM 回傳一個 State patch（renderer 直接吃 → 幾乎零渲染成本）──
  async function generateFullDesign() {
    // the brand colours must be the picked client's: never design while its kit is still loading
    if (!s.copyBrief.trim() || !staff || brand.status === "loading") return;
    setS((prev) => ({ ...prev, designing: true, error: null }));
    const scenesWanted = drawsScenes ? sceneCount : 0;
    setScenes([]); setScenePicked(null);
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
      if (applied && scenesWanted) void drawScenes(applied, scenesWanted);
    } catch (err) {
      setAiRetrying(null);
      setS((prev) => ({ ...prev, designing: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }

  // R3-C (operator 2026-11-27): `n` candidates for the applied design at the main size's ratio, the scene from the AI's
  // subject / vibe. With a product picture each candidate has the product composited into the product area the layout
  // engine reserves (composite model, product as reference), the text area kept clear; without one, a plain scene.
  // A failed one shows its error in its own cell.
  async function drawScenes(st: State, n: number) {
    setScenes(Array.from({ length: n }, () => ({ state: "wait" })));
    setSizeJobs({});
    const m = mainOf(st), k = m.preset, product = m.productImage;
    const model = product ? compositeModel(m.aiBgModel) : m.aiBgModel;
    const cell = (i: number, c: SceneCell) => setScenes((prev) => prev.map((x, j) => (j === i ? c : x)));
    try {
      const areas = await drawnAreas(variantOf(m, k), k);
      if (product && !areas.product) throw new Error("no_product_area");
      const prompt = product
        ? compositePrompt({ scene: sceneOf(m), productArea: areas.product!, textArea: areas.text })
        : scenePrompt({ subject: m.aiBgSubject, vibe: m.aiBgVibe, textArea: areas.text, productArea: null });
      await Promise.all(Array.from({ length: n }, async (_, i) => {
        try { cell(i, { state: "ok", product, image: await generateBgPicture({ model, prompt, aspect: PRESETS[k].aspect, refs: product ? [product] : [] }) }); }
        catch (err) { cell(i, { state: "err", error: `${errText(err)}（最多已計費${ntdLabel(imageNtd(model))}）` }); }
      }));
    } catch (err) {
      // the layout could not be read: nothing was sent, nothing billed
      setScenes(Array.from({ length: n }, () => ({ state: "err", error: `版面讀取失敗（${errText(err)}），未生成、未計費` })));
    }
  }
  // a candidate picked = the main size's background (contrast checked on it like a word set). With the product baked
  // in, every other picked size then gets its own picture of the same scene at its own ratio; without a product the
  // other sizes crop this one.
  // One pick = one claim on the scene lane: a newer pick supersedes it, so an older pick's late size pictures are dropped
  // and its next paid step is not sent; a pick whose main picture was not applied (check failed / superseded) stops.
  async function pickScene(i: number, cell: { image: string; product: string | null }) {
    const kitColors = brand.kit?.colors.length ? brand.kit.colors : null;
    const m = mainOf(sRef.current);
    const bg = sceneBackground(cell.image, cell.product, m.productImage);
    const token = sceneLane.claim();
    setScenePicked(i);
    setSizeJobs({});
    const check = (st: State) => guardOnDrawn(st, kitColors);
    const failed = (prev: State, err: unknown) => ({ ...prev, error: `對比檢查失敗（${errText(err)}）：沒有換成這張場景，請再點一次。` });
    // a plain scene under a product the program draws: grounding on
    const applied = await sceneLane.runAs(token, (prev) => ({
      ...withSharedBackground(prev, bg), ...(!bg.bgImageHasProduct && prev.productImage ? { grounding: groundingOn(prev.grounding) } : {}),
    }), check, (built, g) => ({ ...built, ...g.patch, error: null }), failed);
    const others = selectedSizes(sRef.current).filter((k) => k !== m.preset);
    if (!applied || !bg.bgImageHasProduct || !others.length || !sceneLane.isLatest(token)) return;
    setSizeJobs(Object.fromEntries(others.map((k) => [k, "生成中…"])));
    const { pics, errs } = await compositeSizes(sRef.current, others, { model: compositeModel(m.aiBgModel), scene: sceneOf(m), refs: [cell.product!] });
    if (!sceneLane.isLatest(token)) return; // a newer pick owns the sizes now
    setSizeJobs(errs);
    if (Object.keys(pics).length) {
      await sceneLane.runAs(token, (prev) => withSizeBackgrounds(prev, pics, true), check, (built, g) => ({ ...built, ...g.patch }), failed);
    }
  }
  const scenesBusy = scenes.some((c) => c.state === "wait") || Object.values(sizeJobs).includes("生成中…");

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
          <button title={why("video.script")} className="btn btn-primary" disabled={(s.designing || scenesBusy || s.copyGenerating || !s.copyBrief.trim() || brand.status === "loading") || !canUse("video.script")}
            onClick={generateFullDesign} data-testid="banner-ai-design">
            {aiRetrying === "design" ? "重試中…" : s.designing ? "設計中…" : scenesBusy ? "場景生成中…" : brand.status === "loading" ? "正在載入品牌色…"
              : `✨ AI 一鍵設計整張（${drawsScenes ? `設計 ${ntdLabel(bannerCallNtd(designModel, "design", picked.length))} ＋ 場景 ${sceneCount} 張${otherSizes ? ` ＋ 其他尺寸 ${otherSizes} 張` : ""}，每張 ${ntdLabel(sceneNtd)}` : ntdLabel(bannerCallNtd(designModel, "design", picked.length))}）`}
          </button>
        </div>
        {drawsScenes ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }} data-testid="banner-scene-count">
            <span style={{ fontSize: 12, minWidth: 56 }}>場景張數</span>
            {SCENE_COUNTS.map((n) => (
              <button key={n} type="button" className={sceneCount === n ? "btn btn-primary" : "btn btn-ghost"}
                style={{ fontSize: 11, padding: "2px 7px", lineHeight: 1.3 }} onClick={() => setSceneCount(n)} data-testid={`banner-scene-count-${n}`}>
                {n} 張<span style={{ opacity: 0.75, marginLeft: 4 }}>{ntdLabel((n + otherSizes) * sceneNtd)}</span>
              </button>
            ))}
            <span className="form-hint" style={{ margin: 0 }}>圖片模型：{STUDIO_MODEL_OPTIONS.find((mo) => mo.value === (hasProduct ? compositeModel(s.aiBgModel) : s.aiBgModel))?.label}（在「畫面」步驟換{hasProduct ? "；有商品圖時用會合成商品的模型" : ""}）</span>
          </div>
        ) : (
          <p className="form-hint" style={{ margin: 0 }}>背景是你上傳的圖片：一鍵設計保留它，不另生成場景。</p>
        )}
        {scenes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid="banner-scenes">
            <p className="form-hint" style={{ margin: 0 }}>{hasProduct
              ? `點一張當背景：商品已合成在場景裡，文字仍可編輯。${otherSizes ? `選定後其他 ${otherSizes} 個尺寸各依自己的比例生成同一場景（${otherSizes} × ${ntdLabel(sceneNtd)}）。` : ""}`
              : "點一張當背景（每個尺寸都用它裁切）。"}</p>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${scenes.length}, minmax(0, 1fr))`, gap: 6 }}>
              {scenes.map((c, i) => c.state === "ok" ? (
                <button key={i} type="button" className="choice-card" aria-pressed={scenePicked === i} data-testid={`banner-scene-${i}`}
                  onClick={() => void pickScene(i, c)} style={{ padding: 2 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.image} alt={`場景 ${i + 1}`} style={{ display: "block", width: "100%", aspectRatio: `${PRESETS[mainOf(s).preset].w} / ${PRESETS[mainOf(s).preset].h}`, objectFit: "cover", borderRadius: 4 }} />
                </button>
              ) : (
                <div key={i} className="choice-card" data-testid={`banner-scene-${i}`} style={{ fontSize: 11, minHeight: 60, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
                  ...(c.state === "err" ? { color: "var(--badge-red-text)" } : {}) }}>
                  {c.state === "wait" ? "生成中…" : c.error}
                </div>
              ))}
            </div>
            {Object.entries(sizeJobs).map(([k, msg]) => (
              <p key={k} className="form-hint" data-testid={`banner-scene-size-${k}`} style={{ margin: 0, ...(msg === "生成中…" ? {} : { color: "var(--badge-red-text)" }) }}>
                {presetLabel(k as PresetKey)}：{msg === "生成中…" ? "依這個尺寸的比例生成同一場景中…" : `${msg}；這個尺寸暫用主尺寸的圖裁切`}
              </p>
            ))}
          </div>
        )}
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
