/**
 * Print-file bake — destination-driven composable blocks (plan §10.0–§10.2 SSOT).
 *
 * Each print destination is a block; the pipeline branches on three fields:
 *   - colorSpace : 'cmyk' → Sharp .toColorspace('cmyk').jpeg(q100)   (tw-local/mpc/printninja)
 *                  'srgb' → keep sRGB PNG                            (TGC — CMYK is rejected!)
 *   - format     : 'pdf'  → pdf-lib embed + MediaBox/BleedBox/TrimBox geometry
 *                  'png'  → Sharp PNG buffer direct (TGC sRGB path)
 *   - needsOutputIntent : true → Ghostscript ICC pass (deploy-gated, ./ghostscript-pdfx)
 *
 * ⚠️ Density: CMYK NEVER sets density. `.withMetadata({density})` attaches an sRGB
 * ICC that silently converts CMYK back to 3ch RGB (broken — [0-a] POC poc2, 2026-06-12).
 * `.withDensity()` needs sharp ≥0.35; this app is on 0.34.5 (Next transitive) which
 * lacks it. Density is non-load-bearing: physical size = PDF MediaBox/TrimBox points,
 * effective DPI = px ÷ physical size. We omit density entirely — version-robust + CMYK-safe.
 *
 * ⚠️ pdf-lib embedJpg auto-adds `/Decode[1 0 1 0 1 0 1 0]` for 4ch CMYK (correct — libvips
 * writes APP14 transform=0). Do NOT add it manually (would double-invert). See plan §10.4.
 */
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { applyColorGrade, type ColorGradeParams } from "./color-grade";
import { applyOutputIntent } from "./ghostscript-pdfx";
import { getPrintGeometry, type PrintDestination } from "./print-destinations";

// Re-export the pure data layer so existing server importers (route.ts, tests) keep
// importing destination types/const from here unchanged. Client components must import
// from ./print-destinations directly (this module pulls in sharp — not browser-safe).
export {
  PRINT_DESTINATIONS,
  getPrintGeometry,
  mmToPx,
  mmToPt,
} from "./print-destinations";
export type {
  ColorSpaceTarget,
  PrintFileFormat,
  PrintDestinationId,
  PrintDestination,
  PrintGeometry,
} from "./print-destinations";

const SHARP_LIMIT_INPUT_PIXELS = 50_000_000;

export type PrintFileResult = { buffer: Buffer; mime: string };

/**
 * Bake one print file for a destination. `colorGrade` is optional and routed through
 * `toSharpModulate` (neutral-skipped, garbage→neutral defense — same contract as [1-c]).
 *
 * Branches per plan §10.2: resize → colorSpace block → format block → outputIntent block.
 */
export async function toPrintFile(
  input: Buffer,
  dest: PrintDestination,
  colorGrade?: ColorGradeParams
): Promise<PrintFileResult> {
  const g = getPrintGeometry(dest);

  // resize to bleed box first, then modulate (cheaper at target resolution).
  let img = sharp(input, { limitInputPixels: SHARP_LIMIT_INPUT_PIXELS }).resize(
    g.bleedPx[0],
    g.bleedPx[1],
    { fit: "cover" }
  );
  // Composable color blocks (modulate → levels → gamma → sharpen); each neutral-skipped.
  if (colorGrade) img = applyColorGrade(img, colorGrade);

  // Flatten any SOURCE alpha onto white paper. The upstream producer bg-remover.ts
  // emits a TRANSPARENT RGBA PNG; without this the TGC sRGB/PNG branch keeps 4ch
  // transparent holes, and the CMYK/JPEG branch drops alpha implicitly (sharp-version
  // dependent). White = the print substrate. Mirrors to-product-image.ts:70 (critic
  // Major, 2026-06-13). fit:'cover' adds no letterbox, so only source alpha matters.
  img = img.flatten({ background: { r: 255, g: 255, b: 255 } });

  // ── colorSpace block ── (NO density — see file header)
  let imgBuf: Buffer;
  if (dest.colorSpace === "cmyk") {
    imgBuf = await img.toColorspace("cmyk").jpeg({ quality: 100 }).toBuffer();
  } else {
    imgBuf = await img.png().toBuffer();
  }

  // ── format block ──
  if (dest.format === "png") {
    return { buffer: imgBuf, mime: "image/png" }; // TGC sRGB PNG direct
  }

  const pdf = await PDFDocument.create();
  const embedded =
    dest.colorSpace === "cmyk" ? await pdf.embedJpg(imgBuf) : await pdf.embedPng(imgBuf);
  const page = pdf.addPage(g.bleedPt);
  page.drawImage(embedded, { x: 0, y: 0, width: g.bleedPt[0], height: g.bleedPt[1] });
  page.setMediaBox(0, 0, g.bleedPt[0], g.bleedPt[1]);
  page.setBleedBox(0, 0, g.bleedPt[0], g.bleedPt[1]);
  page.setTrimBox(g.bleedOffsetPt, g.bleedOffsetPt, g.trimPt[0], g.trimPt[1]);
  let pdfBuf: Buffer = Buffer.from(await pdf.save());

  // ── needsOutputIntent block ── (Ghostscript ICC pass; deploy-gated stub for now)
  if (dest.needsOutputIntent && dest.iccProfile) {
    pdfBuf = await applyOutputIntent(pdfBuf, dest.iccProfile);
  }
  return { buffer: pdfBuf, mime: "application/pdf" };
}
