// R4 (T1 決定 2, agency-os/handoffs/2026-11-26-banner-pro-design/t1/T1-measure.md): the three composition groups. One
// table: the layout engine (geometry), a size's default layout (banner-state variantOf / INIT), the AI layout default
// (banner-design shapeLayout) and the composite prompt read it. Each preset names its group (banner-state PRESETS.group).

export type CompGroup = "phone" | "card" | "web";

export interface Composition {
  label: string;
  /** The size's default layout intent (where the words and the product go). */
  layout: { textPos: "top" | "center" | "bottom"; textAlignH: "left" | "center" | "right"; productPos: "center" | "left" | "right" | "bottom-right" };
  /** Product beside the text: the text's share of the width; the product's column is the rest. */
  textShare: number;
  /** Where the product's centre aims (shares of the canvas): phone = the lower third line's right crossing. */
  productAt: { x: number; y: number } | null;
  /** The proportions reserved for a product baked into the background when neither its area nor its picture is known. */
  productFrame: { w: number; h: number };
  /** Bands no automatic element may enter (shares of the height), by ratio: 9:16 = Meta Reels' top 14% / bottom 35%. */
  safe: Partial<Record<string, { top: number; bottom: number }>>;
}

export const COMPOSITION: Record<CompGroup, Composition> = {
  // 9:16, 2:3, 3:4, 4:5, 1:1 -- words in the top third, the product under them on the lower-right thirds crossing
  phone: {
    label: "手機直式", layout: { textPos: "top", textAlignH: "center", productPos: "bottom-right" }, textShare: 0.55,
    productAt: { x: 2 / 3, y: 2 / 3 }, productFrame: { w: 4, h: 5 }, safe: { "9:16": { top: 0.14, bottom: 0.35 } },
  },
  // 4:3, 16:9 社群, 1.91:1, 2:1 -- words left (~55%), product right
  card: { label: "卡片橫式", layout: { textPos: "center", textAlignH: "left", productPos: "right" }, textShare: 0.55, productAt: null, productFrame: { w: 4, h: 5 }, safe: {} },
  // 16:9 Hero, 3:1, 3:2 -- words left, product right; small type comes from displayW (field-ranges titleRange)
  web: { label: "網頁", layout: { textPos: "center", textAlignH: "left", productPos: "right" }, textShare: 0.55, productAt: null, productFrame: { w: 4, h: 5 }, safe: {} },
};

/** Long words: the text beside a product may widen to this share before the title goes under its range's floor. */
export const TEXT_SHARE_MAX = 0.65;

/** The size a layout is made for: canvas px, its ratio, the width it is shown at (CSS px) and its group. */
export interface LayoutSize { w: number; h: number; ratio: string; displayW: number; group: CompGroup }

/** The free band of the height (px) automatic elements keep inside: the margin, or the size's safe band where larger. */
export function safeBand(size: LayoutSize, padY: number): { top: number; bottom: number } {
  const s = COMPOSITION[size.group].safe[size.ratio];
  return { top: Math.max(padY, (s?.top ?? 0) * size.h), bottom: size.h - Math.max(padY, (s?.bottom ?? 0) * size.h) };
}
