// Client-only: compose a print-ready tarot card PNG from AI artwork on a <canvas>.
// Output: 898×1488 px = 76×126 mm @ 300 DPI (70×120 mm card + 3 mm bleed each side).

import type { TarotCard } from "./cards";

// 300 DPI, 1 mm = 11.811 px
export const PRINT_W = 898; // (70 + 6) mm
export const PRINT_H = 1488; // (120 + 6) mm
const BLEED = 36; // ~3 mm
const SAFE = 64; // safe inset from trim for the frame

export type CardTemplate = "classic" | "minimal" | "dark" | "none";

export const CARD_TEMPLATES: { key: CardTemplate; label: string }[] = [
  { key: "classic", label: "經典金框（用牌組色）" },
  { key: "minimal", label: "簡約白邊" },
  { key: "dark", label: "深色神秘（金字）" },
  { key: "none", label: "無框・純藝術滿版" },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("art_image_load_failed"));
    img.src = src;
  });
}

/** Draw `img` to cover the rect (x,y,w,h), clipped — like CSS object-fit: cover. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
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
  } while (px > 14);
  return px;
}

/** Per-template colors. `classic` follows the card's own palette; others are fixed. */
function templateColors(template: CardTemplate, card: TarotCard): { bg: string; border: string; text: string } {
  switch (template) {
    case "minimal":
      return { bg: "#faf7f0", border: "#3a3a3a", text: "#2a2a2a" };
    case "dark":
      return { bg: "#120a24", border: "#c9a84c", text: "#e8d5a3" };
    case "classic":
    default:
      return { bg: card.colors[1], border: card.colors[0], text: card.colors[0] };
  }
}

/**
 * Render one print-ready card. `artDataUrl` is the raw AI artwork (data: URL).
 * Returns a PNG Blob sized PRINT_W × PRINT_H, framed per the chosen template.
 */
export async function renderPrintCard(
  card: TarotCard,
  artDataUrl: string,
  template: CardTemplate = "classic",
): Promise<Blob> {
  const art = await loadImage(artDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = PRINT_W;
  canvas.height = PRINT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_2d_unavailable");

  // ── Template "none": full-bleed artwork, no frame or text ──────────────────
  if (template === "none") {
    drawCover(ctx, art, 0, 0, PRINT_W, PRINT_H);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas_toBlob_failed"))), "image/png");
    });
  }

  const { bg, border, text } = templateColors(template, card);

  // 1. Bleed background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, PRINT_W, PRINT_H);

  // 2. Art window — 2:3 portrait
  const winX = SAFE;
  const winW = PRINT_W - SAFE * 2;
  const winY = 150;
  const winH = Math.round(winW * 1.5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(winX, winY, winW, winH);
  ctx.clip();
  drawCover(ctx, art, winX, winY, winW, winH);
  ctx.restore();

  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.strokeRect(winX, winY, winW, winH);

  // 3. Outer border — double for classic/dark, single thin for minimal
  ctx.strokeStyle = border;
  if (template === "minimal") {
    ctx.lineWidth = 3;
    ctx.strokeRect(BLEED, BLEED, PRINT_W - BLEED * 2, PRINT_H - BLEED * 2);
  } else {
    ctx.lineWidth = 8;
    ctx.strokeRect(BLEED, BLEED, PRINT_W - BLEED * 2, PRINT_H - BLEED * 2);
    ctx.lineWidth = 2;
    ctx.strokeRect(BLEED + 16, BLEED + 16, PRINT_W - (BLEED + 16) * 2, PRINT_H - (BLEED + 16) * 2);
  }

  // 4. Roman numeral (top)
  ctx.fillStyle = text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 44px Georgia, "Times New Roman", serif`;
  ctx.fillText(card.roman, PRINT_W / 2, winY - 64);

  // 5. Card name (bottom)
  const nameMaxW = PRINT_W - SAFE * 2;
  const namePx = fitFont(ctx, card.name, nameMaxW, 52);
  ctx.font = `bold ${namePx}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = text;
  const nameY = winY + winH + (PRINT_H - BLEED - 16 - (winY + winH)) / 2;
  ctx.fillText(card.name, PRINT_W / 2, nameY);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas_toBlob_failed"))), "image/png");
  });
}
