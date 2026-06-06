// Client-only: compose a print-ready tarot card PNG from AI artwork on a <canvas>.
// Output: 898×1488 px = 76×126 mm @ 300 DPI (70×120 mm card + 3 mm bleed each side).
//
// Templates are AI-generated empty frame PNGs (public/tarot-frames/*.png): an ornate border
// with a blank centre + blank title panel. We draw the frame, then composite the artwork into
// the frame's blank-centre rect, then write the card name into the title panel.

import type { TarotCard } from "./cards";

export const PRINT_W = 898;
export const PRINT_H = 1488;

export type CardTemplate =
  | "classic-rw"
  | "handdrawn"
  | "medieval"
  | "folk"
  | "parchment"
  | "gothic"
  | "none";

interface FrameDef {
  key: CardTemplate;
  label: string;
  /** file under /public/tarot-frames/ (omitted for "none"). */
  file?: string;
  /** blank-centre artwork rect, as fractions of the card. */
  art?: { x: number; y: number; w: number; h: number };
  /** vertical centre of the title text, as a fraction of card height. */
  titleY?: number;
  titleColor?: string;
}

export const CARD_TEMPLATES: FrameDef[] = [
  { key: "classic-rw", label: "經典 Rider-Waite", file: "classic-rw.png", art: { x: 0.085, y: 0.07, w: 0.83, h: 0.76 }, titleY: 0.915, titleColor: "#3a2a1a" },
  { key: "handdrawn", label: "手繪復古", file: "handdrawn.png", art: { x: 0.1, y: 0.085, w: 0.8, h: 0.73 }, titleY: 0.895, titleColor: "#3a2a1a" },
  { key: "medieval", label: "中世紀手抄本", file: "medieval.png", art: { x: 0.1, y: 0.085, w: 0.8, h: 0.73 }, titleY: 0.905, titleColor: "#3a2a1a" },
  { key: "folk", label: "民俗樸拙", file: "folk.png", art: { x: 0.12, y: 0.12, w: 0.76, h: 0.67 }, titleY: 0.905, titleColor: "#5a3a2a" },
  { key: "parchment", label: "古董羊皮卷", file: "parchment.png", art: { x: 0.105, y: 0.085, w: 0.79, h: 0.72 }, titleY: 0.905, titleColor: "#4a3420" },
  { key: "gothic", label: "哥德聖窗", file: "gothic.png", art: { x: 0.19, y: 0.205, w: 0.62, h: 0.585 }, titleY: 0.89, titleColor: "#3a2a1a" },
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
 * Render one print-ready card: the chosen frame template with the artwork composited into its
 * blank centre and the card name in the title panel. `template = "none"` → full-bleed artwork.
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
  if (!def.file || !def.art) {
    drawCover(ctx, art, 0, 0, PRINT_W, PRINT_H);
    return toBlob(canvas);
  }

  const ax = def.art.x * PRINT_W;
  const ay = def.art.y * PRINT_H;
  const aw = def.art.w * PRINT_W;
  const ah = def.art.h * PRINT_H;

  // 1. artwork fills the centre window (slight overflow so the border edge later sits on the art)
  const pad = 10;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax - pad, ay - pad, aw + pad * 2, ah + pad * 2);
  ctx.clip();
  drawCover(ctx, art, ax - pad, ay - pad, aw + pad * 2, ah + pad * 2);
  ctx.restore();

  // 2. border ON TOP of the art — the frame with its blank centre cleared to transparent,
  // so the ornate border + title panel always overlay the artwork (never get covered by it).
  const frame = await loadImage(`/tarot-frames/${def.file}`);
  const overlay = document.createElement("canvas");
  overlay.width = PRINT_W;
  overlay.height = PRINT_H;
  const octx = overlay.getContext("2d");
  if (!octx) throw new Error("canvas_2d_unavailable");
  octx.drawImage(frame, 0, 0, PRINT_W, PRINT_H);
  octx.clearRect(ax, ay, aw, ah); // punch a transparent window where the art shows through
  ctx.drawImage(overlay, 0, 0);

  // 3. card name in the title panel (drawn last → always crisp, never covered)
  if (def.titleY) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const px = fitFont(ctx, card.name, aw * 0.92, 42);
    ctx.font = `bold ${px}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = def.titleColor ?? "#2a2a1a";
    ctx.fillText(card.name, PRINT_W / 2, def.titleY * PRINT_H);
  }

  return toBlob(canvas);
}
