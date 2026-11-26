// Card C9: the banner's two AI calls -- the model buttons (a subset of the shared text-model menu, with a per-call NT$
// estimate) and AI 一鍵設計整張 across several sizes: one call returns the shared words / colours plus one layout per chosen
// size; designPlan() turns that into the main size's layout and every other size's override. Pure (node-testable).
import { BANNER_COPY_VARIANTS, BANNER_DESIGN_COPY_VARIANTS } from "@/lib/script-forge/modules";
import { AI_TEXT_MODELS, type AiTextModel } from "@/lib/ai/text-model-options";
import { textCallCostUsd, toolCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { applySemantic, dropPositions, semanticElems } from "./banner-layout";
import type { BannerFields } from "./banner-layers";
import type { CopyVariant, PresetKey, SizePatch, State } from "./banner-state";

/** The models offered on the banner's AI buttons (operator 2026-11-26). Defaults from the bake-off on production
 *  (ai_call_logs, same brief, 2026-11-26): 一鍵設計 stays Claude Opus 5.5. 生成文案 = Claude Sonnet 5.5 (operator 2026-11-26,
 *  after the 12-model 塔羅牌 run: the only cheap one that writes 促銷; GPT-6.2 sol read like lifestyle copy). */
const BANNER_AI_MODEL_IDS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "gpt-6.2-sol"] as const satisfies readonly AiTextModel[];
export const BANNER_AI_MODELS = BANNER_AI_MODEL_IDS.map((value) => ({ value, label: AI_TEXT_MODELS.find((m) => m.value === value)!.label }));
export type BannerAiModel = (typeof BANNER_AI_MODEL_IDS)[number];
export const DEFAULT_COPY_MODEL: BannerAiModel = "claude-sonnet-5-5";
export const DEFAULT_DESIGN_MODEL: BannerAiModel = "claude-opus-5-5";
const COPY_VARIANTS = BANNER_COPY_VARIANTS;

/** Measured NT$ of one 生成文案 call per model when it asked for 5 pairs (production ai_call_logs, same brief, 2026-11-26;
 *  Sonnet was NT$0.14 on the 塔羅牌 run, the higher figure is kept). Each model answers at its own length, so one token guess
 *  cannot price them all; other calls are scaled from this by the cost table (more pairs = a longer answer). */
const COPY_MEASURED_NTD: Record<BannerAiModel, number> = { "claude-opus-5-5": 0.6, "claude-sonnet-5-5": 0.39, "gpt-6.2-sol": 0.1, "claude-haiku-5-5": 0.01 };
const typicalTokens = (task: "copy" | "design", sizes: number) => {
  const m = task === "design" && sizes > 1 ? sizes : 0; // one call whatever the size count; each size adds a layout
  // design: C12 +~350 for the background / palette part; R2-C +~200 in / ~65 out per word set (copyVariants)
  return task === "copy" ? { inputTokens: 900, outputTokens: 152 * (sizes || 5) }
    : { inputTokens: 1550 + 120 * m, outputTokens: 1100 + 65 * BANNER_DESIGN_COPY_VARIANTS + 250 * m };
};
/** About what one call costs, NT$: the measured copy price, scaled for the design call by the cost-table price of its
 *  typical prompt / answer against the copy call's. An estimate on the button, not the bill. */
export function bannerCallNtd(model: BannerAiModel, task: "copy" | "design", sizes = 1): number {
  const at = (t: "copy" | "design", n: number) => textCallCostUsd({ model, ...typicalTokens(t, n) });
  // the measurement is a 5-pair copy call; a copy call is priced at COPY_VARIANTS pairs
  return COPY_MEASURED_NTD[model] * (at(task, task === "copy" ? COPY_VARIANTS : sizes) / at("copy", 5));
}
/** NT$ of one product cut-out (Replicate 851-labs, cost-model TOOL_RATES "bg-remove", billed by the second). */
export const removeBgNtd = (): number => usdToNtd(toolCostUsd("bg-remove"));
/** A paid button's price, to NT$0.1: "約 NT$0.6"; under NT$0.05 "不到 NT$0.1". */
export function ntdLabel(v: number): string {
  return v < 0.05 ? "不到 NT$0.1" : `約 NT$${(Math.round(v * 10) / 10).toFixed(1)}`;
}

/** What the AI decides for one size: intent only (where the words / product / badge / logo go). Sizes, positions and
 *  every pixel are the layout engine's (banner-layout.ts), so a position button always works on an AI design. */
export interface LayoutPatch {
  textPos?: "top" | "center" | "bottom";
  textAlignH?: "left" | "center" | "right";
  productPos?: "center" | "left" | "right" | "bottom-right";
  badgePos?: "tl" | "tr";
  logoPos?: "bl" | "br" | "tl" | "tr";
}
export interface SizeSpec { key: string; ratio: string; use: string; w: number; h: number }

const enumOf = <T extends string>(v: unknown, allowed: readonly T[]) => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

/** One size's layout from the AI answer: the intent fields with a known value; anything else (old answers' pixel sizes
 *  and positions included) is dropped. */
export function sanitizeLayout(raw: unknown): LayoutPatch {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: LayoutPatch = {};
  const tp = enumOf(r.textPos, ["top", "center", "bottom"] as const); if (tp) out.textPos = tp;
  const ta = enumOf(r.textAlignH, ["left", "center", "right"] as const); if (ta) out.textAlignH = ta;
  const pp = enumOf(r.productPos, ["center", "left", "right", "bottom-right"] as const); if (pp) out.productPos = pp;
  const bp = enumOf(r.badgePos, ["tl", "tr"] as const); if (bp) out.badgePos = bp;
  const lp = enumOf(r.logoPos, ["bl", "br", "tl", "tr"] as const); if (lp) out.logoPos = lp;
  return out;
}

/** A sensible layout by shape when the AI left a size out: tall = words on top, product under them; wide = words left,
 *  product right; square = centred stack. */
export function shapeLayout(size: { w: number; h: number }): LayoutPatch {
  const r = size.w / size.h;
  if (r < 0.9) return { textPos: "top", textAlignH: "center", productPos: "center" };
  if (r > 1.25) return { textPos: "center", textAlignH: "left", productPos: "right" };
  return { textPos: "center", textAlignH: "center", productPos: "center" };
}

/** The AI answer's per-size layouts -> the main size's layout and an override for every other chosen size (a size the
 *  answer left out gets shapeLayout). No chosen sizes = the single-size answer: its top-level intent fields, no overrides. */
export function designPlan(raw: Record<string, unknown>, main: SizeSpec, chosen: readonly SizeSpec[]): { main: LayoutPatch; overrides: Record<string, LayoutPatch> } {
  if (!chosen.length) return { main: sanitizeLayout(raw), overrides: {} };
  const layouts = raw.layouts && typeof raw.layouts === "object" ? (raw.layouts as Record<string, unknown>) : {};
  const layoutOf = (s: SizeSpec) => { const l = sanitizeLayout(layouts[s.key]); return Object.keys(l).length ? l : shapeLayout(s); };
  const overrides: Record<string, LayoutPatch> = {};
  for (const s of chosen) if (s.key !== main.key) overrides[s.key] = layoutOf(s);
  return { main: layouts[main.key] ? sanitizeLayout(layouts[main.key]) : {}, overrides };
}

// ── R2-C: the word sets and applying the design ──

/** One word set of AI 一鍵設計 (the 生成文案 list holds headline + subtext only; the other two are then absent). */
export interface DesignCopy extends CopyVariant { ctaText?: string; badgeText?: string }
/** Fields the design sets that State gets from R2-B2 (banner-state.ts); harmless once State has them. */
export type DesignState = State & Pick<BannerFields, "logoPos" | "typeAuto">;

const COPY_MAX = { headline: 60, subtext: 120, ctaText: 30, badgeText: 30 } as const;
/** The answer's copyVariants: objects with a headline, each field a trimmed string within its length, the same headline
 *  once, at most BANNER_DESIGN_COPY_VARIANTS. A field the AI left out stays absent (picking the set keeps that word). */
export function sanitizeCopyVariants(raw: unknown): DesignCopy[] {
  const out: DesignCopy[] = [];
  for (const v of Array.isArray(raw) ? raw : []) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const str = (k: keyof typeof COPY_MAX) => (typeof o[k] === "string" ? (o[k] as string).trim().slice(0, COPY_MAX[k]) : undefined);
    const headline = str("headline");
    if (!headline || out.some((c) => c.headline === headline)) continue;
    const c: DesignCopy = { headline, subtext: str("subtext") ?? "" };
    const cta = str("ctaText"), badge = str("badgeText");
    if (cta !== undefined) c.ctaText = cta;
    if (badge !== undefined) c.badgeText = badge;
    out.push(c);
    if (out.length >= BANNER_DESIGN_COPY_VARIANTS) break;
  }
  return out;
}
/** The words a set puts on the design (a field it does not carry is left as it is). */
export function copyWords(c: DesignCopy): Partial<State> {
  return {
    headline: c.headline, subtext: c.subtext,
    ...(c.ctaText !== undefined ? { ctaText: c.ctaText } : {}), ...(c.badgeText !== undefined ? { badgeText: c.badgeText } : {}),
  };
}
/** Whether the design shows exactly this set's words. */
export const showsCopy = (st: State, c: DesignCopy): boolean =>
  st.headline === c.headline && st.subtext === c.subtext &&
  (c.ctaText === undefined || st.ctaText === c.ctaText) && (c.badgeText === undefined || st.badgeText === c.badgeText);

/**
 * The AI design's layout onto the main design, through applySemantic: every element a position field moves loses its
 * drag, at the main size and at every tweaked size that inherits the field. Each chosen size's own layout goes onto its
 * existing tweak the same way (its other tweaks stay). `st` is the main design (not inside a size tweak).
 */
export function applyDesignLayout(st: DesignState, main: Partial<DesignState>, overrides: Record<string, LayoutPatch>): DesignState {
  const next = applySemantic(st, main);
  const moved = semanticElems(main);
  type Key = PresetKey;
  type Tweak = SizePatch & LayoutPatch;
  const sizeOverrides: Partial<Record<Key, Tweak>> = {};
  for (const [k, o] of Object.entries(st.sizeOverrides) as [Key, Tweak][]) {
    // a size that sets the field itself keeps its drags for the elements that field moves
    const inherits = moved.filter((e) => !semanticElems(o).includes(e));
    sizeOverrides[k] = o.positions ? { ...o, positions: dropPositions(o.positions, inherits) } : o;
  }
  for (const [k, l] of Object.entries(overrides) as [Key, LayoutPatch][]) sizeOverrides[k] = applySemantic<Tweak>(sizeOverrides[k] ?? {}, l);
  return { ...next, sizeOverrides };
}

// ── C10: reading the AI's JSON answer ──
// Production 2026-11-26: a full, billed 2,055-token design answer failed JSON.parse once and worked on the next press.
// Invariant: an answer that holds one complete object is usable; only a really broken one fails, and it is kept to look at.

/** The stream's trailing markers (app/api/tools/script-forge/route.ts): a receipt and an error line. */
const STREAM_MARKERS = ["\n[SF_BUDGET]", "[SF_BUDGET]", "\n[ERROR]", "[ERROR]"];

/** The first complete JSON object / array in `text` (strings and escapes respected), or null when it never closes. */
function firstBalanced(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") { if (stack.pop() !== c) return null; if (!stack.length) return text.slice(start, i + 1); }
  }
  return null;
}
/** Small repairs outside / inside strings: trailing commas dropped, raw line breaks and tabs inside strings escaped. */
function repairJson(s: string): string {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) { esc = false; out += c; continue; }
      if (c === "\\") { esc = true; out += c; continue; }
      if (c === '"') { inStr = false; out += c; continue; }
      out += c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : c;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === ",") { const rest = s.slice(i + 1).match(/^\s*([}\]])/); if (rest) continue; }
    out += c;
  }
  return out;
}
export type AiJson = { ok: true; value: unknown } | { ok: false; error: string };
/** Parse the AI's answer: markers and code fences cut, the first complete object taken, common slips repaired. */
export function parseAiJson(text: string): AiJson {
  let body = text;
  let streamError = "";
  for (const m of STREAM_MARKERS) {
    const i = body.indexOf(m);
    if (i >= 0) { if (m.includes("ERROR")) streamError = text.slice(text.indexOf(m) + m.length).split("\n")[0].trim(); body = body.slice(0, i); }
  }
  body = body.replace(/```(?:json)?/gi, "");
  const found = firstBalanced(body);
  if (!found) return { ok: false, error: streamError || "no complete JSON object" };
  for (const candidate of [found, repairJson(found)]) {
    try { return { ok: true, value: JSON.parse(candidate) }; } catch { /* try the repaired one */ }
  }
  return { ok: false, error: streamError || "JSON.parse failed" };
}

/** Ask, parse; an answer that does not parse is asked once more (same model, same fields). `raw` = the last answer text. */
export async function askJsonWithRetry(call: () => Promise<string>, onRetry?: () => void):
  Promise<{ ok: true; value: unknown; calls: number } | { ok: false; error: string; calls: number; raw: string }> {
  let raw = "";
  for (let calls = 1; calls <= 2; calls++) {
    if (calls === 2) onRetry?.();
    raw = await call();
    const parsed = parseAiJson(raw);
    if ("value" in parsed) return { ok: true, value: parsed.value, calls };
    if (calls === 2) return { ok: false, error: "error" in parsed ? parsed.error : "JSON.parse failed", calls, raw };
  }
  return { ok: false, error: "unreachable", calls: 2, raw };
}

/** The whole streamed answer text; `onChunk` sees it grow (the copy card shows the tail while it streams). */
export async function readAiStream(res: Response, onChunk?: (full: string) => void): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onChunk?.(full);
  }
  return full + dec.decode();
}
/** The message after a retried answer still did not parse; the raw answer (first 2,000 characters) goes to the console. */
export function aiFormatError(got: { error: string; calls: number; raw: string }, ntdPerCall: number): string {
  console.error("[banner] AI answer did not parse:", got.error, got.raw.slice(0, 2000));
  return `AI 回傳格式錯誤（已重試一次），本次已計費${ntdLabel(ntdPerCall * got.calls)}`;
}
