// R4-D (operator 2026-11-27「照三點改」): the one scene flow behind AI 一鍵設計 and 畫面「AI 合成進場景」 --
// N priced candidates at the main size -> a click previews one at the main size (free) -> a priced button draws every
// other picked size from the picked picture. Invariants: money is spent only on a priced button; every size of one
// design is the same scene; both entries run this module (steps/SceneFlow.tsx is its React side).
import { roleHeader } from "@/lib/ops-role";
import { fetchAwaitingCodex } from "@/lib/studio/codex-wait";
import { STUDIO_MODEL_OPTIONS, modelCompositesProduct, type ModelAspectRatio, type StudioModel } from "@/lib/studio/model-options";
import { boxOnPicture, compositePrompt, extendPrompt, ntdLabel, scenePrompt, type PicArea } from "./banner-design";
import { bannerLayout, renderBannerLayers } from "./banner-layers";
import { reservedAreas } from "./banner-layout";
import { guardDrawn, type GuardResult, type PxBox } from "./design-colors";
import { guardLane, sameDrawInputs } from "./contrast-run";
import {
  PRESETS, groundingOn, mainOf, measureBackground, pictureAspect, sceneBackground, selectedSizes, variantOf, withSharedBackground, withSizeBackgrounds,
  type BakedPicture, type PresetKey, type State,
} from "./banner-state";

/** NT$ of one picture from `model` (the 圖片模型 button's price). */
export const imageNtd = (model: StudioModel): number => STUDIO_MODEL_OPTIONS.find((m) => m.value === model)?.costNt ?? 0;
const maxRefs = (model: StudioModel): number => STUDIO_MODEL_OPTIONS.find((m) => m.value === model)?.maxRefs ?? 0;

/** One picture from the studio route. Throws the route's message on failure. */
export async function generateBgPicture(o: { model: StudioModel; prompt: string; aspect: ModelAspectRatio; refs?: string[] }): Promise<string> {
  const res = await fetchAwaitingCodex("/api/tools/studio/generate", {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...roleHeader("operator") },
    body:    JSON.stringify({ model: o.model, prompt: o.prompt, referenceImages: o.refs ?? [], aspectRatio: o.aspect }),
  });
  const data = await res.json() as { ok: boolean; image?: string; error?: string };
  if (!data.ok || !data.image) throw new Error(data.error ?? "generation_failed");
  return data.image;
}
export type Generate = typeof generateBgPicture;

/** The layout engine's reserved areas (reservedAreas) on size `k` of the design, as shares of the picture `model` draws
 *  for that size, and that picture's ratio (pictureAspect). Invariant: the prompt's areas and the generated ratio come
 *  from this one call, so a 3:1 drawn at 21:9 is told 21:9 coordinates. */
export async function drawnAreas(v: State, k: PresetKey, model: StudioModel):
  Promise<{ text: PicArea | null; product: PicArea | null; aspect: ModelAspectRatio; visible: PicArea }> {
  const ps = PRESETS[k], aspect = pictureAspect(k, model);
  const { text, product } = reservedAreas(await bannerLayout(v, ps));
  return { text: text ? boxOnPicture(text, ps, aspect) : null, product: product ? boxOnPicture(product, ps, aspect) : null, aspect,
    visible: boxOnPicture({ x: 0, y: 0, w: ps.w, h: ps.h }, ps, aspect) };
}
export type DrawnAreas = typeof drawnAreas;

/** The model a product composite runs on: the picked one when it places a product as an object, else Nano Banana 2. */
export const compositeModel = (m: StudioModel): StudioModel => (modelCompositesProduct(m) ? m : "nano-banana-2");

/** How the other sizes are drawn. "extend" (default): the picked picture + the product as references, the same scene
 *  redrawn at each ratio. "regenerate": the product composited into the scene WORDS again (pre-R4-D) -- kept only for
 *  R4-C to compare both once; the page reads `?otherSizes=regenerate`. */
export type OtherSizesMode = "extend" | "regenerate";
/** The model other sizes run on: extending takes two references (picture, product), so a one-reference model
 *  (FLUX Kontext) hands it to Nano Banana 2. */
export const otherSizesModel = (model: StudioModel, mode: OtherSizesMode): StudioModel =>
  mode === "regenerate" || maxRefs(model) >= 2 ? model : "nano-banana-2";
/** The price on 「生成其他 N 個尺寸」: one picture per other size. */
export const otherSizesNtd = (n: number, model: StudioModel, mode: OtherSizesMode): number => n * imageNtd(otherSizesModel(model, mode));
export const otherSizesLabel = (n: number, model: StudioModel, mode: OtherSizesMode): string =>
  `生成其他 ${n} 個尺寸（${ntdLabel(otherSizesNtd(n, model, mode))}）`;

/** What the candidates are drawn from. `model` is already the one that runs (compositeModel with a product). */
export interface SceneSource { scene: string; product: string | null; model: StudioModel; styleRefs: string[] }
/** One candidate cell: drawing, drawn (the product picture it was drawn with, null = plain scene; its product area),
 *  or failed (the message with the at-most-billed amount). */
export type SceneCell = { state: "wait" } | { state: "ok"; image: string; product: string | null; area: PicArea | null } | { state: "err"; error: string };
export type OkCell = Extract<SceneCell, { state: "ok" }>;
export interface FlowView { cells: SceneCell[]; picked: number | null; sizeJobs: Partial<Record<PresetKey, string>>; src: SceneSource | null }
export const EMPTY_VIEW: FlowView = { cells: [], picked: null, sizeJobs: {}, src: null };
export const SIZE_DRAWING = "生成中…";

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const TEXT_ELEMS = ["headline", "subtext", "price", "trust"] as const;

/** Contrast on `st` as the renderer draws it: every picked size rendered for its text boxes, the background measured from
 *  `st` itself, then guardDrawn. Free (browser only). Applied only through a guardLane (contrast-run.ts). */
export async function guardOnDrawn(st: State, kit: readonly string[] | null, roles?: { raw: Record<string, unknown>; palette: readonly string[] }): Promise<GuardResult> {
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

/** Every other picked size from the picked picture, in parallel. A failed size = its message with the at-most-billed amount. */
export async function drawOtherSizes(st: State, sizes: readonly PresetKey[], o: { src: SceneSource; picked: string; mode: OtherSizesMode },
  d: { generate: Generate; areas: DrawnAreas }): Promise<{ pics: Partial<Record<PresetKey, BakedPicture>>; errs: Partial<Record<PresetKey, string>> }> {
  const product = o.src.product!;
  const model = otherSizesModel(o.src.model, o.mode);
  const got = await Promise.all(sizes.map(async (k) => {
    try {
      const a = await d.areas(variantOf(st, k), k, model);
      if (!a.product) throw new Error("no_product_area");
      const zone = { scene: o.src.scene, productArea: a.product, textArea: a.text, visible: a.visible };
      const [prompt, refs] = o.mode === "extend"
        ? [extendPrompt(zone), [o.picked, product]]
        : [compositePrompt(zone), [product, ...o.src.styleRefs].slice(0, maxRefs(model))];
      return [k, { image: await d.generate({ model, prompt, aspect: a.aspect, refs }), area: a.product }] as const;
    } catch (err) {
      return [k, err instanceof Error ? err : new Error(String(err))] as const;
    }
  }));
  const pics: Partial<Record<PresetKey, BakedPicture>> = {}, errs: Partial<Record<PresetKey, string>> = {};
  for (const [k, v] of got) {
    if (!(v instanceof Error)) pics[k] = v;
    else errs[k] = `${v.message}（最多已計費${ntdLabel(imageNtd(model))}）`;
  }
  return { pics, errs };
}

/** What other sizes are paid against still holds: the main picture is the cell's picture with the product baked in, and
 *  that product is the one on the page now (a 換圖 after the pick must not pay for the old product). Checked when the
 *  button is offered and again before the paid pictures are applied. */
function stillPicked(st: State, cell: OkCell): boolean {
  const m = mainOf(st);
  return !!cell.product && cell.product === m.productImage && m.bgImage === cell.image && m.bgImageHasProduct;
}

/** The other picked sizes a picked cell can still be drawn at (stillPicked; a plain scene is cropped by every size for free). */
export function otherSizesOf(st: State, cell: SceneCell | undefined): PresetKey[] {
  if (!cell || cell.state !== "ok" || !stillPicked(st, cell)) return [];
  return selectedSizes(st).filter((k) => k !== mainOf(st).preset);
}

/** The flow's actions on the page's state (`current` / `apply`) and its own view. Picks and other-size runs share one
 *  guardLane: the newest claim wins (contrast-run.ts), so an older pick's late pictures are dropped. */
export function sceneFlow(deps: {
  current(): State; apply(fn: (prev: State) => State): void; view(fn: (v: FlowView) => FlowView): void;
  check(st: State): Promise<GuardResult>; generate?: Generate; areas?: DrawnAreas;
}) {
  const generate = deps.generate ?? generateBgPicture, areas = deps.areas ?? drawnAreas;
  const lane = guardLane<State, GuardResult>({ same: sameDrawInputs, current: deps.current, apply: deps.apply });
  const merge = (built: State, g: GuardResult): State => ({ ...built, ...g.patch, error: null });
  const failed = (what: string) => (prev: State, err: unknown): State => ({ ...prev, error: `對比檢查失敗（${errText(err)}）：${what}` });
  let drawId = 0, paidRuns = 0;
  // paid work holds `generating` (save / export / 清除設計 / the other entry's buttons wait); a pick is refused meanwhile,
  // so a free click can never supersede pictures already paid for
  const paid = async (job: () => Promise<void>) => {
    paidRuns++; deps.apply((prev) => ({ ...prev, generating: true }));
    try { await job(); } finally { if (--paidRuns === 0) deps.apply((prev) => ({ ...prev, generating: false })); }
  };

  /** Paid: `n` candidates for the main size of `st` (the product composited into its reserved area, or a plain scene). */
  function draw(st: State, n: number, src: SceneSource): Promise<void> { return paid(() => drawNow(st, n, src)); }
  async function drawNow(st: State, n: number, src: SceneSource): Promise<void> {
    const id = ++drawId;
    lane.claim(); // a pick still checking or other sizes still drawing belong to the old candidates
    deps.view(() => ({ cells: Array.from({ length: n }, () => ({ state: "wait" })), picked: null, sizeJobs: {}, src }));
    const cell = (i: number, c: SceneCell) => { if (id === drawId) deps.view((v) => ({ ...v, cells: v.cells.map((x, j) => (j === i ? c : x)) })); };
    const m = mainOf(st), k = m.preset;
    try {
      const a = await areas(variantOf(m, k), k, src.model);
      if (src.product && !a.product) throw new Error("no_product_area");
      const prompt = src.product
        ? compositePrompt({ scene: src.scene, productArea: a.product!, textArea: a.text, visible: a.visible })
        : scenePrompt({ subject: src.scene, vibe: "", textArea: a.text, productArea: null });
      const refs = src.product ? [src.product, ...src.styleRefs].slice(0, maxRefs(src.model)) : [];
      await Promise.all(Array.from({ length: n }, async (_, i) => {
        try { cell(i, { state: "ok", product: src.product, area: src.product ? a.product : null, image: await generate({ model: src.model, prompt, aspect: a.aspect, refs }) }); }
        catch (err) { cell(i, { state: "err", error: `${errText(err)}（最多已計費${ntdLabel(imageNtd(src.model))}）` }); }
      }));
    } catch (err) {
      // the layout could not be read: nothing was sent, nothing billed
      if (id === drawId) deps.view((v) => ({ ...v, cells: v.cells.map(() => ({ state: "err", error: `版面讀取失敗（${errText(err)}），未生成、未計費` })) }));
    }
  }

  /** Free: candidate `i` becomes the main size's background (every size crops it until 「生成其他尺寸」), contrast checked. */
  async function pick(i: number, cell: OkCell): Promise<boolean> {
    if (paidRuns) return false;
    const bg = sceneBackground(cell.image, cell.product, mainOf(deps.current()).productImage, cell.area);
    const token = lane.claim();
    let before: number | null = null;
    deps.view((v) => { before = v.picked; return { ...v, picked: i, sizeJobs: {} }; });
    // a plain scene under a product the program draws: grounding on
    const ok = await lane.runAs(token, (prev) => ({
      ...withSharedBackground(prev, bg), ...(!bg.bgImageHasProduct && prev.productImage ? { grounding: groundingOn(prev.grounding) } : {}),
    }), deps.check, merge, failed("沒有換成這張場景，請再點一次。"));
    if (!ok && lane.isLatest(token)) deps.view((v) => ({ ...v, picked: before }));
    return ok;
  }

  /** Paid: every other picked size from the picked cell (otherSizesOf), applied while the main picture is still it. */
  function drawOthers(cell: OkCell, src: SceneSource, mode: OtherSizesMode): Promise<void> {
    if (!otherSizesOf(deps.current(), cell).length) return Promise.resolve();
    return paid(() => drawOthersNow(cell, src, mode));
  }
  async function drawOthersNow(cell: OkCell, src: SceneSource, mode: OtherSizesMode): Promise<void> {
    const others = otherSizesOf(deps.current(), cell);
    const token = lane.claim();
    deps.view((v) => ({ ...v, sizeJobs: Object.fromEntries(others.map((k) => [k, SIZE_DRAWING])) }));
    const { pics, errs } = await drawOtherSizes(deps.current(), others, { src, picked: cell.image, mode }, { generate, areas });
    if (!lane.isLatest(token)) return; // a newer pick / draw owns the sizes now
    // what they were paid against changed while they were drawn (main picture / product replaced, size dropped):
    // those paid pictures are not applied -- say so per size
    const now = deps.current(), gone = !stillPicked(now, cell), live = selectedSizes(now);
    const billed = `（已計費${ntdLabel(imageNtd(otherSizesModel(src.model, mode)))}）`;
    const unused = Object.keys(pics).filter((k) => gone || !live.includes(k as PresetKey))
      .map((k) => [k, `${gone ? "主背景或商品已換" : "這個尺寸已取消"}，這張沒有套用${billed}`]);
    deps.view((v) => ({ ...v, sizeJobs: { ...errs, ...Object.fromEntries(unused) } }));
    if (gone || unused.length === Object.keys(pics).length) return;
    await lane.runAs(token, (prev) => {
      if (!stillPicked(prev, cell)) return prev;
      const sizes = others.filter((k) => selectedSizes(prev).includes(k));
      return withSizeBackgrounds(prev, Object.fromEntries(sizes.flatMap((k) => (pics[k] ? [[k, pics[k]]] : []))), sizes);
    }, deps.check, (built, g) => ({ ...built, ...g.patch }), failed("其他尺寸的圖沒有套用，請再按一次。"));
  }

  return { draw, pick, drawOthers, reset: () => { drawId++; lane.claim(); deps.view(() => EMPTY_VIEW); } };
}
export type SceneFlow = ReturnType<typeof sceneFlow>;
