/**
 * Faithful print-file builder — apparel POD (Phase 1, "100% 忠實" 鐵律).
 *
 * The artist's rule: the design on the printed product must be PIXEL-IDENTICAL to
 * the generated artwork — no AI reinterpretation. AI super-resolution (upscaler.ts /
 * Real-ESRGAN) synthesises new detail → it CHANGES pixels → it violates that rule.
 * This module never invents content:
 *
 *   mode "original" — re-encode the design to PNG, same pixels (lossless). The print
 *                     file IS the artwork. 100% faithful; DPI follows the native size.
 *   mode "resample" — Lanczos (lanczos3) enlarge to a target long edge. Deterministic
 *                     interpolation only — no hallucinated detail. Faithful but softer.
 *
 * Real-ESRGAN stays available as an explicit, clearly-labelled "ai-enhance" option in
 * the publish route — NOT the default, because it is not faithful.
 *
 * Reality the UI must surface honestly: no AI image model outputs native print
 * resolution (max ≈ 2K / 2496px today). Bella 3001 DTG front print area ≈ 12×16 in,
 * so 300 DPI = 4800 px long edge. A 2496 px native design = ~156 DPI at full size
 * (right at Printful's 150 DPI floor). We report the achieved DPI, never a blanket
 * "300 DPI ✓" (same honesty contract as upscaler.ts, critic 2026-06-11).
 */
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { putDesignObject, getDesignsPublicBase } from "../storage/r2";
import { randomUUID } from "node:crypto";

/** Bella 3001 DTG front print area long edge, inches (Printfile 1 = 1800×2400 @150DPI = 12×16 in). */
export const APPAREL_PRINT_LONG_EDGE_IN = 16;
/** 300 DPI target long edge for the apparel front print (16 in × 300). */
export const PRINT_TARGET_LONG_EDGE = 4800;
const SHARP_LIMIT_INPUT_PIXELS = 80_000_000;
const MAX_OUTPUT_BYTES = 60 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

export type PrintFileMode = "original" | "resample";

/** DPI tagged into the PNG (pHYs) and used to size the PDF page. The print shop reads "300 DPI" and
 *  prints at the implied physical size = longEdgePx / 300 inches (honest: a 2496px native design is
 *  300 DPI at 8.3in, NOT a blanket "300 DPI at full 16in" — see dpiAtFullPrint for the full-area DPI). */
export const PRINT_DENSITY_DPI = 300;

export interface PrintFileResult {
  ok: true;
  printFileUrl: string;
  /** Same artwork as a print-ready PDF (PNG embedded at 300 DPI; page = artwork's physical size). */
  printFilePdfUrl: string;
  mode: PrintFileMode;
  byteSize: number;
  /** long edge of the produced print file, px */
  longEdgePx: number;
  /** long edge of the source design, px */
  inputLongEdgePx: number;
  /** effective DPI if printed at the full Bella 3001 front area (16 in long edge) */
  dpiAtFullPrint: number;
  /** meets the 300 DPI target (with the same 75% tolerance the wizard already uses) */
  meetsTarget: boolean;
}
export type PrintFileOutcome = PrintFileResult | { ok: false; error: string };

/** Effective DPI when an image of `longEdgePx` is printed across `APPAREL_PRINT_LONG_EDGE_IN`. */
export function dpiAtFullPrint(longEdgePx: number): number {
  return Math.round(longEdgePx / APPAREL_PRINT_LONG_EDGE_IN);
}

/**
 * Embed a faithful print PNG into a single-page PDF at the given DPI. The page is sized to the
 * artwork's PHYSICAL dimensions (px / dpi inches → ×72 PDF points), and the image fills it edge to
 * edge — so the embedded image renders at exactly `dpi` and prints true-to-size. Pixels are the same
 * faithful PNG (lossless FlateDecode inside the PDF); pdf-lib is already a dependency, no new infra.
 */
async function buildPrintPdf(pngBuffer: Buffer, widthPx: number, heightPx: number, dpi: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(pngBuffer);
  const wPt = (widthPx / dpi) * 72;
  const hPt = (heightPx / dpi) * 72;
  const page = pdf.addPage([wPt, hPt]);
  page.drawImage(png, { x: 0, y: 0, width: wPt, height: hPt });
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

/**
 * Build a faithful print file from a My Designs asset URL.
 * SSRF guard: only the designs bucket's own public origin is fetchable (same rule
 * the studio/publish routes enforce). targetLongEdge only applies to mode "resample".
 */
export async function buildFaithfulPrintFile(
  designUrl: string,
  opts: { mode: PrintFileMode; targetLongEdge?: number } = { mode: "original" },
): Promise<PrintFileOutcome> {
  const base = getDesignsPublicBase() + "/";
  if (!designUrl.startsWith(base)) {
    return { ok: false, error: "designUrl must be a My Designs asset URL" };
  }

  const controller = new AbortController();
  const killer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let inputBuffer: Buffer;
    try {
      // redirect:"manual" fails closed so a 3xx cannot bounce off the allowlisted origin.
      const res = await fetch(designUrl, { signal: controller.signal, redirect: "manual" });
      if (!res.ok) return { ok: false, error: `fetch_input_failed_${res.status}` };
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > MAX_OUTPUT_BYTES) return { ok: false, error: "input_too_large" };
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_OUTPUT_BYTES) return { ok: false, error: "input_too_large" };
      inputBuffer = Buffer.from(ab);
    } catch {
      return { ok: false, error: controller.signal.aborted ? "print_file_timeout" : "fetch_input_network_error" };
    }

    let meta: sharp.Metadata;
    try {
      meta = await sharp(inputBuffer, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS }).metadata();
    } catch {
      return { ok: false, error: "image_decode_failed" };
    }
    const inputLongEdgePx = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (inputLongEdgePx <= 0) return { ok: false, error: "image_dimensions_unknown" };

    // Track BOTH dimensions (not just the long edge) so the PDF page can be sized to the artwork's
    // true physical size at 300 DPI. The PNG carries a 300-DPI pHYs tag (withMetadata) — pixels are
    // unchanged (faithful), only the density metadata is set.
    let outBuffer: Buffer;
    let outW: number;
    let outH: number;
    if (opts.mode === "resample") {
      const target = opts.targetLongEdge ?? PRINT_TARGET_LONG_EDGE;
      // Never DOWNscale a print file here — that would throw away the artist's pixels.
      // If the native design already meets the target, fall through to faithful passthrough.
      if (inputLongEdgePx >= target) {
        outW = meta.width ?? inputLongEdgePx;
        outH = meta.height ?? inputLongEdgePx;
        outBuffer = await sharp(inputBuffer, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS })
          .withMetadata({ density: PRINT_DENSITY_DPI })
          .png()
          .toBuffer();
      } else {
        const scale = target / inputLongEdgePx;
        outW = Math.round((meta.width ?? inputLongEdgePx) * scale);
        outH = Math.round((meta.height ?? inputLongEdgePx) * scale);
        // lanczos3 = deterministic interpolation, NO synthesised detail (unlike Real-ESRGAN).
        outBuffer = await sharp(inputBuffer, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS })
          .resize(outW, outH, { kernel: "lanczos3" })
          .withMetadata({ density: PRINT_DENSITY_DPI })
          .png()
          .toBuffer();
      }
    } else {
      // "original" — lossless PNG re-encode; pixels unchanged from the artwork.
      outW = meta.width ?? inputLongEdgePx;
      outH = meta.height ?? inputLongEdgePx;
      outBuffer = await sharp(inputBuffer, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS })
        .withMetadata({ density: PRINT_DENSITY_DPI })
        .png()
        .toBuffer();
    }
    const longEdgePx = Math.max(outW, outH);

    if (outBuffer.byteLength > MAX_OUTPUT_BYTES) return { ok: false, error: "output_too_large" };

    // Build the PDF twin (PNG embedded at 300 DPI). A PDF failure must not lose the PNG, but the
    // operator asked for BOTH — so fail loud rather than silently shipping a PNG-only result.
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await buildPrintPdf(outBuffer, outW, outH, PRINT_DENSITY_DPI);
    } catch {
      return { ok: false, error: "pdf_build_failed" };
    }
    if (pdfBuffer.byteLength > MAX_OUTPUT_BYTES) return { ok: false, error: "pdf_output_too_large" };

    // Pair the PNG + PDF under ONE uuid so the two downloads are obviously the same print file.
    const now = new Date();
    const dir = `print/${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const id = randomUUID();
    const putPng = await putDesignObject(`${dir}/${id}.png`, outBuffer, "image/png");
    if (!putPng.ok) return { ok: false, error: (putPng as { ok: false; error: string }).error };
    const putPdf = await putDesignObject(`${dir}/${id}.pdf`, pdfBuffer, "application/pdf");
    if (!putPdf.ok) return { ok: false, error: (putPdf as { ok: false; error: string }).error };

    const dpi = dpiAtFullPrint(longEdgePx);
    return {
      ok: true,
      printFileUrl: putPng.publicUrl,
      printFilePdfUrl: putPdf.publicUrl,
      mode: opts.mode,
      byteSize: putPng.byteSize,
      longEdgePx,
      inputLongEdgePx,
      dpiAtFullPrint: dpi,
      meetsTarget: longEdgePx >= PRINT_TARGET_LONG_EDGE * 0.75,
    };
  } finally {
    clearTimeout(killer);
  }
}
