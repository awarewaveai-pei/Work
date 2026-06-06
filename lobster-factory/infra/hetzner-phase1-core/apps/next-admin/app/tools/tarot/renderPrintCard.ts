// Client-only: compose a print-ready tarot card PNG from AI artwork on a <canvas>.
// Output: 898×1488 px = 76×126 mm @ 300 DPI (70×120 mm card + 3 mm bleed each side).
//
// 3 layers (bottom → top): base colour · generated artwork · transparent-centre frame PNG.
// The frame PNGs (public/tarot-frames/*.png) have their blank centre flood-filled to transparent,
// so the artwork shows through the centre while the ornate border + title panel overlay on top.

import type { TarotCard } from "./cards";

export const PRINT_W = 898;
export const PRINT_H = 1488;

// Bottom base colour — only ever visible if artwork has transparency (it doesn't); keeps edges clean.
const BASE = "#f4ecd8";
// Artwork window (fraction of card). Generous on purpose: each frame masks the overflow to its own
// transparent hole shape (e.g. the gothic arch), so one window fits every template.
const ART = { x: 0.05, y: 0.05, w: 0.9, h: 0.8 };

export type CardTemplate = "classic-rw" | "handdrawn" | "medieval" | "folk" | "parchment" | "gothic" | "none";

interface FrameDef {
  key: CardTemplate;
  label: string;
  file?: string; // under /public/tarot-frames/ (omitted for "none")
  titleY?: number; // vertical centre of the title text, as a fraction of card height
  titleColor?: string;
}

export const CARD_TEMPLATES: FrameDef[] = [
  { key: "classic-rw", label: "經典 Rider-Waite", file: "classic-rw.png", titleY: 0.945, titleColor: "#3a2a1a" },
  { key: "handdrawn", label: "手繪復古", file: "handdrawn.png", titleY: 0.935, titleColor: "#3a2a1a" },
  { key: "medieval", label: "中世紀手抄本", file: "medieval.png", titleY: 0.94, titleColor: "#3a2a1a" },
  { key: "folk", label: "民俗樸拙", file: "folk.png", titleY: 0.94, titleColor: "#5a3a2a" },
  { key: "parchment", label: "古董羊皮卷", file: "parchment.png", titleY: 0.94, titleColor: "#4a3420" },
  { key: "gothic", label: "哥德聖窗", file: "gothic.png", titleY: 0.925, titleColor: "#3a2a1a" },
  { key: "none", label: "無框・純藝術" },
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
 * Render one print-ready card with the 3-layer compose. `template = "none"` → full-bleed artwork.
 */
export async function renderPrintCard(card: TarotCard, artDataUrl: string, template: CardTemplate = "classic-rw"): Promise<Blob> {
  const art = await loadImage(artDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = PRINT_W;
  canvas.height = PRINT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_2d_unavailable");

  const def = FRAME_BY_KEY[template] ?? FRAME_BY_KEY["classic-rw"];

  // No-frame → full-bleed artwork.
  if (!def.file) {
    drawCover(ctx, art, 0, 0, PRINT_W, PRINT_H);
    return toBlob(canvas);
  }

  // Layer 1 — base colour.
  ctx.fillStyle = BASE;
  ctx.fillRect(0, 0, PRINT_W, PRINT_H);

  // Layer 2 — artwork in the central window (frame masks the overflow to its hole shape).
  drawCover(ctx, art, ART.x * PRINT_W, ART.y * PRINT_H, ART.w * PRINT_W, ART.h * PRINT_H);

  // Layer 3 — the transparent-centre frame on top (border + title panel overlay the artwork).
  // ?v cache-buster: frame files keep the same name across updates, so bump this when they change.
  const frame = await loadImage(`/tarot-frames/${def.file}?v=2`);
  ctx.drawImage(frame, 0, 0, PRINT_W, PRINT_H);

  // Card name into the title panel (drawn last → always crisp).
  if (def.titleY) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const px = fitFont(ctx, card.name, PRINT_W * 0.6, 40);
    ctx.font = `bold ${px}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = def.titleColor ?? "#2a2a1a";
    ctx.fillText(card.name, PRINT_W / 2, def.titleY * PRINT_H);
  }

  return toBlob(canvas);
}
