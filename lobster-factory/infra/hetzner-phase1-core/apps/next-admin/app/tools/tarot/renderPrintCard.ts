// Client-only: compose a print-ready tarot card PNG from AI artwork on a <canvas>.
// Output: 898×1488 px = 76×126 mm @ 300 DPI (70×120 mm card + 3 mm bleed each side).
//
// Formal straight-line tarot layout, drawn entirely on canvas (no PNG frame assets):
//   parchment background · double straight-ruled border in the chosen colour ·
//   ROMAN NUMERAL (top) · artwork (centre, embedded directly) · CARD NAME (bottom).
// Three templates differ only by border/ink colour.

import type { TarotCard } from "./cards";

export const PRINT_W = 898;
export const PRINT_H = 1488;

// Parchment base — also shows in the top/bottom title margins around the artwork.
const BASE = "#f6efdf";

// Layout (px on the 898×1488 canvas). All elements sit safely inside the 35px (3mm) bleed.
// Artwork dominates the card (~76% of height) like a real Rider-Waite card: thin border,
// a slim Roman-numeral band on top, the picture nearly full, a slim name band at the bottom.
const LAYOUT = {
  frameMargin: 46, // outer border inset from card edge
  frameInner: 14, // gap from outer rule to the inner thin rule
  romanY: 128, // vertical centre of the Roman numeral (top band)
  artTop: 182, // artwork window top
  artBottom: 1312, // artwork window bottom
  artInset: 74, // artwork left/right inset from card edge
  artLinePad: 10, // gap between artwork edge and its keyline
  nameY: 1398, // vertical centre of the card name (bottom band)
};

export type CardTemplate = "gold" | "navy" | "wine";

interface FrameDef {
  key: CardTemplate;
  label: string;
  line: string; // border + keyline colour
  ink: string; // Roman numeral + card name colour
  bg: string; // parchment tint
}

export const CARD_TEMPLATES: FrameDef[] = [
  { key: "gold", label: "金線", line: "#b0892b", ink: "#6d531a", bg: "#f7f0df" },
  { key: "navy", label: "藏青", line: "#2c4570", ink: "#22324f", bg: "#f4f0e6" },
  { key: "wine", label: "酒紅", line: "#7e2533", ink: "#5c1a24", bg: "#f7eee5" },
];

const FRAME_BY_KEY: Record<string, FrameDef> = Object.fromEntries(CARD_TEMPLATES.map((t) => [t.key, t]));

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image_load_failed: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

/** Draw `img` to cover the rect (x,y,w,h), clipped — like CSS object-fit: cover. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const r = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (ir > r) {
    sw = img.height * r;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / r;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number): number {
  let px = startPx;
  do {
    ctx.font = `bold ${px}px Georgia, "Times New Roman", serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  } while (px > 12);
  return px;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas_toBlob_failed"))), "image/png");
  });
}

/**
 * Render one print-ready card: parchment background, double straight-ruled colour border,
 * Roman numeral on top, artwork embedded in the centre, card name on the bottom.
 */
export async function renderPrintCard(card: TarotCard, artDataUrl: string, template: CardTemplate = "gold"): Promise<Blob> {
  const art = await loadImage(artDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = PRINT_W;
  canvas.height = PRINT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_2d_unavailable");

  const def = FRAME_BY_KEY[template] ?? CARD_TEMPLATES[0];

  // Layer 1 — parchment background.
  ctx.fillStyle = def.bg ?? BASE;
  ctx.fillRect(0, 0, PRINT_W, PRINT_H);

  // Layer 2 — artwork embedded directly in the central window.
  const ax = LAYOUT.artInset;
  const aw = PRINT_W - LAYOUT.artInset * 2;
  const ay = LAYOUT.artTop;
  const ah = LAYOUT.artBottom - LAYOUT.artTop;
  drawCover(ctx, art, ax, ay, aw, ah);

  // Layer 3 — straight-line frame + text, all in the template colour.
  ctx.strokeStyle = def.line;

  // Outer double border (two concentric straight rectangles).
  const m = LAYOUT.frameMargin;
  ctx.lineWidth = 6;
  ctx.strokeRect(m, m, PRINT_W - m * 2, PRINT_H - m * 2);
  const mi = m + LAYOUT.frameInner;
  ctx.lineWidth = 2;
  ctx.strokeRect(mi, mi, PRINT_W - mi * 2, PRINT_H - mi * 2);

  // Thin keyline around the artwork window.
  const p = LAYOUT.artLinePad;
  ctx.lineWidth = 2;
  ctx.strokeRect(ax - p, ay - p, aw + p * 2, ah + p * 2);

  // Roman numeral (top) — large serif, centred.
  ctx.fillStyle = def.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const romanPx = fitFont(ctx, card.roman, PRINT_W * 0.4, 72);
  ctx.font = `bold ${romanPx}px Georgia, "Times New Roman", serif`;
  ctx.fillText(card.roman, PRINT_W / 2, LAYOUT.romanY);

  // Card name (bottom) — centred, auto-shrunk to fit.
  const namePx = fitFont(ctx, card.name, PRINT_W * 0.7, 52);
  ctx.font = `bold ${namePx}px Georgia, "Times New Roman", serif`;
  ctx.fillText(card.name, PRINT_W / 2, LAYOUT.nameY);

  return toBlob(canvas);
}
