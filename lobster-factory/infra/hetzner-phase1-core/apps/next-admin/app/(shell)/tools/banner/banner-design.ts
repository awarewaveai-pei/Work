// Card C9: the banner's two AI calls -- the model buttons (a subset of the shared text-model menu, with a per-call NT$
// estimate) and AI 一鍵設計整張 across several sizes: one call returns the shared words / colours plus one layout per chosen
// size; designPlan() turns that into the main size's layout and every other size's override. Pure (node-testable).
import { BANNER_COPY_VARIANTS } from "@/lib/script-forge/modules";
import { AI_TEXT_MODELS, type AiTextModel } from "@/lib/ai/text-model-options";
import { textCallCostUsd, toolCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { ELEM_KEYS, type ElemPositions } from "./banner-layers";

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
  return task === "copy" ? { inputTokens: 900, outputTokens: 152 * (sizes || 5) } : { inputTokens: 1350 + 120 * m, outputTokens: 1100 + 250 * m }; // C12: +~350 for the background / palette part
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
