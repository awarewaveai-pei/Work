/**
 * Web product image bake — RGB WebP for product pages / social / preview.
 *
 * Two presets (composable blocks; each tool picks what it needs):
 *   - web-tarot  : 667×1000, fit cover, NO padding   (Tarot keeps its 2:3 card shape)
 *   - web-square : 1000×1000, fit contain, white bg   (POD Studio square thumbnails)
 *
 * sRGB only — web is sRGB by definition. The print path (CMYK PDF) is to-print-file.ts.
 * Real sizing is the pixel box; screens ignore embedded density, so we set none.
 *
 * ⚠️ Density: do NOT call `.withMetadata({density})` — it attaches an sRGB ICC that
 * silently breaks CMYK in to-print-file.ts (verified [0-a] POC 2026-06-12, poc2).
 * `.withDensity()` would set DPI cleanly but needs sharp ≥0.35; this app is on 0.34.3
 * (transitive via Next). Since density is non-load-bearing here (pixel box = sizing,
 * PDF geometry = print sizing), we omit it entirely — version-robust + CMYK-safe.
 */
import sharp from "sharp";
import { applyColorGrade, type ColorGradeParams } from "./color-grade";

export type WebPreset = "web-tarot" | "web-square";

type WebPresetSpec = {
  width: number;
  height: number;
  fit: "cover" | "contain";
  /**
   * Opaque background. Used both for contain letterbox padding AND for the
   * final `.flatten()` that removes any source alpha — see toProductImage().
   * Required (not optional): web output must always be opaque white. A
   * de-backgrounded subject (bg-remover.ts emits transparent PNG upstream)
   * otherwise leaves transparent holes that show the page background, and a
   * contain preset with no background gets Sharp's default BLACK letterbox.
   */
  background: { r: number; g: number; b: number; alpha: number };
};

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

export const WEB_PRESETS: Record<WebPreset, WebPresetSpec> = {
  "web-tarot": { width: 667, height: 1000, fit: "cover", background: WHITE },
  "web-square": { width: 1000, height: 1000, fit: "contain", background: WHITE },
};

const WEBP_QUALITY = 80;
const SHARP_LIMIT_INPUT_PIXELS = 50_000_000;

/**
 * Bake one web WebP. `colorGrade` is optional and clamped/neutral-checked inside
 * `applyColorGrade` (each block no-op skipped). Returns the encoded WebP buffer.
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
    { fit: spec.fit, background: spec.background } // background = contain letterbox fill
  );

  // Composable color blocks (modulate → levels → gamma → sharpen); each neutral-skipped.
  if (colorGrade) img = applyColorGrade(img, colorGrade);

  // Flatten any SOURCE alpha onto the opaque background. resize's `background`
  // only fills letterbox padding, NOT pre-existing transparency — without this,
  // a bg-removed subject keeps transparent holes in the WebP (critic 2026-06-12).
  return img.flatten({ background: spec.background }).webp({ quality: WEBP_QUALITY }).toBuffer();
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
