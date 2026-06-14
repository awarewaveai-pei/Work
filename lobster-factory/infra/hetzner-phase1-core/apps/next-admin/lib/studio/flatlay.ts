/**
 * Faithful flat-lay compositor (Phase 2b).
 *
 * The artist's rule: a flat-lay product shot must show her REAL design, never an AI
 * redraw. So this places the actual design buffer onto a background with sharp — scaled
 * and centred only, never reinterpreted. This is the "真實設計 overlay" track that runs
 * ALONGSIDE the existing AI flat-lay (MockupStudio / Nano Banana), per the artist's
 * dual-track decision (2026-06-15).
 *
 * Background options:
 *   - solid colour (default) — clean, deterministic.
 *   - a background IMAGE buffer — e.g. an AI-generated DECORATIVE scene with NO design in
 *     it (the operator generates that separately in Studio). The real design overlays it,
 *     so the decoration is AI but the design stays faithful.
 *
 * Output: sRGB WebP (a display/product image, ~100-200KB) — NOT a print file. The design
 * is composited unchanged (deterministic scale + place); no model reinterprets it.
 */
import sharp from "sharp";

const SHARP_LIMIT_INPUT_PIXELS = 80_000_000;
const WEBP_QUALITY = 82;

export interface FlatlayOptions {
  /** Output canvas edge (square), px. Default 1200. */
  size?: number;
  /** Fraction of the canvas left as margin around the design (0–0.4). Default 0.12. */
  paddingPct?: number;
  /** Solid background colour when no background image is given. Default near-white. */
  bgColor?: { r: number; g: number; b: number };
  /** Optional background image (e.g. an AI decorative scene). Covers the canvas. */
  bgImageBuffer?: Buffer;
}

export type FlatlayResult = { ok: true; buffer: Buffer } | { ok: false; error: string };

/** Compose a faithful flat-lay: real design centred on a background. */
export async function composeFlatlay(designBuffer: Buffer, opts: FlatlayOptions = {}): Promise<FlatlayResult> {
  const size = Math.max(400, Math.min(4000, Math.round(opts.size ?? 1200)));
  const padding = Math.max(0, Math.min(0.4, opts.paddingPct ?? 0.12));
  const inner = Math.round(size * (1 - padding * 2));
  const bgColor = opts.bgColor ?? { r: 245, g: 243, b: 238 };

  try {
    // 1) Background canvas — either the supplied image (cover) or a solid fill.
    // Precedence: a supplied background IMAGE wins over bgColor (the solid fill is the fallback).
    let background: Buffer;
    if (opts.bgImageBuffer) {
      background = await sharp(opts.bgImageBuffer, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS })
        .resize(size, size, { fit: "cover", position: "centre" })
        .toBuffer();
    } else {
      background = await sharp({
        create: { width: size, height: size, channels: 3, background: bgColor },
      })
        .png()
        .toBuffer();
    }

    // 2) Scale the REAL design to fit the inner box — fit:"inside" preserves aspect and
    //    never enlarges past its own resolution origin beyond the box (no reinterpretation).
    //    Deliberately NOT flattened: a de-backgrounded (transparent) design must float on the
    //    bg — do NOT add .flatten() here (that would fill the holes and break the flat-lay).
    const design = await sharp(designBuffer, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS })
      .resize(inner, inner, { fit: "inside", withoutEnlargement: false })
      .toBuffer();

    // 3) Composite the design centred over the background, encode WebP for product display.
    const out = await sharp(background, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS })
      .composite([{ input: design, gravity: "centre" }])
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    return { ok: true, buffer: out };
  } catch {
    return { ok: false, error: "flatlay_compose_failed" };
  }
}

/** Parse "#rrggbb" / "rrggbb" into an {r,g,b}. Returns null on malformed input. */
export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
