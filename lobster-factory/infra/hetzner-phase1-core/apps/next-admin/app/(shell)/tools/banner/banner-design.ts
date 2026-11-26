// Card C9: the banner's two AI calls -- the model buttons (a subset of the shared text-model menu, with a per-call NT$
// estimate) and AI 一鍵設計整張 across several sizes: one call returns the shared words / colours plus one layout per chosen
// size; designPlan() turns that into the main size's layout and every other size's override. Pure (node-testable).
import { AI_TEXT_MODELS, isOpenAiTextModel, type AiTextModel } from "@/lib/ai/text-model-options";
import { textCallCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { ELEM_KEYS, type ElemPositions } from "./banner-layers";

/** The models offered on the banner's AI buttons (operator 2026-11-26); default Opus until the bake-off picks one. */
const BANNER_AI_MODEL_IDS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "gpt-6.2-sol"] as const satisfies readonly AiTextModel[];
export const BANNER_AI_MODELS = BANNER_AI_MODEL_IDS.map((value) => ({ value, label: AI_TEXT_MODELS.find((m) => m.value === value)!.label }));
export type BannerAiModel = (typeof BANNER_AI_MODEL_IDS)[number];
export const DEFAULT_BANNER_AI_MODEL: BannerAiModel = "claude-opus-5-5";

/** About what one call costs, NT$: typical prompt / answer sizes of the banner tasks at the cost table's rates (an OpenAI
 *  reasoning model also spends ~1,000 thinking tokens). An estimate shown on the button, not the bill. */
export function bannerCallNtd(model: BannerAiModel, task: "copy" | "design", sizes = 1): number {
  const multi = task === "design" && sizes > 1 ? sizes : 0;
  const inputTokens = (task === "copy" ? 600 : 900) + 150 * multi;
  const outputTokens = (task === "copy" ? 600 : 700) + 300 * multi + (isOpenAiTextModel(model) ? 1000 : 0);
  return usdToNtd(textCallCostUsd({ model, inputTokens, outputTokens }));
}
/** "約 NT$1.23" (two decimals under NT$1, one under NT$10, whole above). */
export function ntdLabel(v: number): string {
  return `約 NT$${v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v)}`;
}

/** The layout fields one size may get from the AI (a subset of BannerStudio SIZE_KEYS). */
export interface LayoutPatch {
  textPos?: "top" | "center" | "bottom";
  textAlignH?: "left" | "center" | "right";
  headlineSize?: number;
  subtextSize?: number;
  productPos?: "center" | "left" | "right" | "bottom-right";
  productScale?: number;
  positions?: ElemPositions;
}
export interface SizeSpec { key: string; ratio: string; use: string; w: number; h: number }

const enumOf = <T extends string>(v: unknown, allowed: readonly T[]) => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
const numIn = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);

/** One size's layout from the AI answer: unknown keys and out-of-range values dropped, sizes clamped to the canvas. */
export function sanitizeLayout(raw: unknown, size: { w: number; h: number }): LayoutPatch {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: LayoutPatch = {};
  const tp = enumOf(r.textPos, ["top", "center", "bottom"] as const); if (tp) out.textPos = tp;
  const ta = enumOf(r.textAlignH, ["left", "center", "right"] as const); if (ta) out.textAlignH = ta;
  const short = Math.min(size.w, size.h);
  const hs = numIn(r.headlineSize, 16, Math.round(short * 0.25)); if (hs !== undefined) out.headlineSize = Math.round(hs);
  const ss = numIn(r.subtextSize, 10, Math.round(short * 0.12)); if (ss !== undefined) out.subtextSize = Math.round(ss);
  const pp = enumOf(r.productPos, ["center", "left", "right", "bottom-right"] as const); if (pp) out.productPos = pp;
  const ps = numIn(r.productScale, 0.2, 1.2); if (ps !== undefined) out.productScale = ps;
  if (r.positions && typeof r.positions === "object") {
    const pos: ElemPositions = {};
    for (const k of ELEM_KEYS) {
      const p = (r.positions as Record<string, unknown>)[k] as { x?: unknown; y?: unknown } | undefined;
      const x = numIn(p?.x, 0, 1), y = numIn(p?.y, 0, 1);
      if (x !== undefined && y !== undefined) pos[k] = { x, y };
    }
    if (Object.keys(pos).length) out.positions = pos;
  }
  return out;
}

/** A sensible layout by shape when the AI left a size out: tall = words in the top third, product low; wide = words left,
 *  product right; square = centred stack. */
export function shapeLayout(size: { w: number; h: number }): LayoutPatch {
  const r = size.w / size.h;
  if (r < 0.9) return { textPos: "top", textAlignH: "center", productPos: "center", positions: { product: { x: 0.5, y: 0.66 } } };
  if (r > 1.25) return { textPos: "center", textAlignH: "left", productPos: "right" };
  return { textPos: "center", textAlignH: "center", productPos: "center" };
}

/** The AI answer's per-size layouts -> the main size's layout and an override for every other chosen size (a size the
 *  answer left out gets shapeLayout). No chosen sizes = no layouts at all: the single-size design as before. */
export function designPlan(raw: Record<string, unknown>, main: SizeSpec, chosen: readonly SizeSpec[]): { main: LayoutPatch; overrides: Record<string, LayoutPatch> } {
  if (!chosen.length) return { main: {}, overrides: {} };
  const layouts = raw.layouts && typeof raw.layouts === "object" ? (raw.layouts as Record<string, unknown>) : {};
  const layoutOf = (s: SizeSpec) => { const l = sanitizeLayout(layouts[s.key], s); return Object.keys(l).length ? l : shapeLayout(s); };
  const overrides: Record<string, LayoutPatch> = {};
  for (const s of chosen) if (s.key !== main.key) overrides[s.key] = layoutOf(s);
  return { main: layouts[main.key] ? sanitizeLayout(layouts[main.key], main) : {}, overrides };
}
