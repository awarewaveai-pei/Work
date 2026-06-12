/**
 * Web product image bake — RGB WebP for product pages / social / preview.
 *
 * Two presets (composable blocks; each tool picks what it needs):
 *   - web-tarot  : 667×1000, fit cover, NO padding   (Tarot keeps its 2:3 card shape)
 *   - web-square : 1000×1000, fit contain, white bg   (POD Studio square thumbnails)
 *
 * sRGB only — web is sRGB by definition. The print path (CMYK PDF) is to-print-file.ts.
 * Density is metadata-only at 72 (screens ignore it); real sizing is the pixel box.
 *
 * ⚠️ Use `.withDensity()` NOT `.withMetadata({density})` — the latter attaches an
 * sRGB ICC that round-trips fine for WebP here, but we standardise on withDensity so
 * the same habit holds in to-print-file.ts where withMetadata silently breaks CMYK
 * (verified [0-a] POC 2026-06-12). Keep the two pipelines consistent.
 */
import sharp from "sharp";
import { toSharpModulate, type ColorGradeParams } from "./color-grade";

export type WebPreset = "web-tarot" | "web-square";

type WebPresetSpec = {
  width: number;
  height: number;
  fit: "cover" | "contain";
  /** background for letterboxed (contain) area; omit for cover (no padding) */
  background?: { r: number; g: number; b: number; alpha: number };
};

export const WEB_PRESETS: Record<WebPreset, WebPresetSpec> = {
  "web-tarot": { width: 667, height: 1000, fit: "cover" },
  "web-square": {
    width: 1000,
    height: 1000,
    fit: "contain",
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
};

const WEBP_QUALITY = 80;
const WEB_DPI = 72;
const SHARP_LIMIT_INPUT_PIXELS = 50_000_000;

/**
 * Bake one web WebP. `colorGrade` is optional and clamped/neutral-checked inside
 * `toSharpModulate` (no-op skipped). Returns the encoded WebP buffer.
 */
export async function toProductImage(
  input: Buffer,
  preset: WebPreset,
  colorGrade?: ColorGradeParams
): Promise<Buffer> {
  const spec = WEB_PRESETS[preset];

  let img = sharp(input, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS }).resize(
    spec.width,
    spec.height,
    spec.fit === "contain" && spec.background
      ? { fit: "contain", background: spec.background }
      : { fit: spec.fit }
  );

  const mod = colorGrade && toSharpModulate(colorGrade);
  if (mod) img = img.modulate(mod);

  return img.webp({ quality: WEBP_QUALITY }).withDensity(WEB_DPI).toBuffer();
}

/** MVP convenience: encode the WebP as a data URL for direct <img src>. */
export async function toProductImageDataUrl(
  input: Buffer,
  preset: WebPreset,
  colorGrade?: ColorGradeParams
): Promise<string> {
  const buf = await toProductImage(input, preset, colorGrade);
  return `data:image/webp;base64,${buf.toString("base64")}`;
}
