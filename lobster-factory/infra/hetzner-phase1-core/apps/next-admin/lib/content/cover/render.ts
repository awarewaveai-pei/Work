// Article-cover renderer (K24): layout B from layout.ts, drawn with Sharp + an SVG text layer (the host image has the
// Noto CJK fonts for librsvg, Dockerfile fontconfig/font-noto-cjk). The photo is cover-fitted into the picture area,
// never darkened and never under text; the band is a solid colour. Output WebP ≤200 KB by the two qualities toWebP uses.
import sharp from "sharp";
import { layoutCover, type CoverLayout } from "./layout";
import { parseCoverSettings, type CoverSettings } from "./settings";

const FONT_FAMILY: Record<CoverSettings["font"], string> = {
  sans: "'Noto Sans TC','Noto Sans SC','Noto Sans CJK TC',sans-serif",
  serif: "'Noto Serif TC','Noto Serif SC','Noto Serif CJK TC',serif",
};

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** The text layer only (full canvas size, transparent elsewhere). */
export function buildCoverSvg(l: CoverLayout, settings: CoverSettings): string {
  const s = parseCoverSettings(settings);   // colours go into attributes: never trust the caller's object
  const family = FONT_FAMILY[s.font];
  const text = (t: { text: string; x: number; y: number }, size: number, fill: string, weight: number) =>
    `<text x="${t.x}" y="${t.y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${xml(t.text)}</text>`;
  const parts = l.title.lines.map((t) => text(t, l.title.fontSize, s.titleColor, 700));
  if (l.subtitle) parts.push(text(l.subtitle.line, l.subtitle.fontSize, s.subtitleColor, 400));
  return `<svg width="${l.width}" height="${l.height}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/** A plain neutral gradient picture, for a preview without an image (nothing stored in the repo). */
export function neutralCoverBackground(width = 1200, height = 900): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9dde3"/><stop offset="1" stop-color="#9aa3ae"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Throws "cover_title_required" without a title; an unreadable background throws Sharp's error (the caller decides). */
export async function renderCover(
  background: Buffer,
  text: { title: string; subtitle?: string },
  settings: CoverSettings,
  size: { width: number; height: number } = { width: 1200, height: 900 },
): Promise<{ buffer: Buffer; mime: "image/webp" }> {
  const s = parseCoverSettings(settings);
  const l = layoutCover({ width: size.width, height: size.height, title: text.title, subtitle: text.subtitle });
  const photo = await sharp(background).rotate().resize(l.image.width, l.image.height, { fit: "cover", position: "centre" }).toBuffer();
  const svg = Buffer.from(buildCoverSvg(l, s));
  const compose = () =>
    sharp({ create: { width: l.width, height: l.height, channels: 3, background: s.bandColor } })
      .composite([{ input: photo, left: l.image.x, top: l.image.y }, { input: svg, left: 0, top: 0 }]);
  let buffer = await compose().webp({ quality: 80 }).toBuffer();
  if (buffer.length > 200_000) buffer = await compose().webp({ quality: 62 }).toBuffer();
  return { buffer, mime: "image/webp" };
}
