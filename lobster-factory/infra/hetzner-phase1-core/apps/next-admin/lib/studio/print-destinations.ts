/**
 * Print destinations — PURE data + geometry (plan §10.0 SSOT). NO sharp / pdf-lib /
 * node imports, so this module is safe to import from CLIENT components (OutputTrackBar
 * needs the labels + ids). The bake pipeline (to-print-file.ts) and the Ghostscript pass
 * (ghostscript-pdfx.ts) import their data from here; they add the server-only machinery.
 *
 * ⚠️ Keep this file dependency-free. Importing sharp/pdf-lib here would drag node:crypto /
 * node:events into the browser bundle and break `next build` (real failure, 2026-06-13).
 */

export type ColorSpaceTarget = "cmyk" | "srgb";
export type PrintFileFormat = "pdf" | "png";
export type PrintDestinationId = "tw-local" | "mpc" | "tgc" | "printninja";

export type IccProfileName =
  | "JapanColor2001Coated" // 台灣 / 日 / 亞洲
  | "USWebCoatedSWOP" // 美國
  | "CoatedFOGRA39"; // 歐洲

export type PrintDestination = {
  id: PrintDestinationId;
  /** UI label, e.g. "🇹🇼 本地印刷廠" */
  label: string;
  /** finished size [w,h] in mm, e.g. [70,120] (TW local) / [70,121] (intl de-facto) */
  trimMm: [number, number];
  /** bleed per edge in mm (3 or 3.175) */
  bleedMm: number;
  /** safe margin in mm (3 or 5) — advisory for the editor, not used in geometry here */
  safeMm: number;
  dpi: 300;
  colorSpace: ColorSpaceTarget;
  /** only meaningful when colorSpace='cmyk' AND needsOutputIntent (scenario A) */
  iccProfile?: IccProfileName;
  format: PrintFileFormat;
  /** cmyk + ICC → true → Ghostscript PDF/X-1a pass */
  needsOutputIntent: boolean;
};

/**
 * Verified destination specs (web-researcher 2026-06-12, plan §10.0).
 * Intl de-facto tarot standard = 70×121mm; TW local = 70×120mm.
 */
export const PRINT_DESTINATIONS: Record<PrintDestinationId, PrintDestination> = {
  "tw-local": {
    id: "tw-local",
    label: "🇹🇼 本地印刷廠",
    trimMm: [70, 120],
    bleedMm: 3,
    safeMm: 3,
    dpi: 300,
    colorSpace: "cmyk",
    iccProfile: "JapanColor2001Coated",
    format: "pdf",
    needsOutputIntent: true,
  },
  mpc: {
    id: "mpc",
    label: "MakePlayingCards (US)",
    trimMm: [70, 121],
    bleedMm: 3.175,
    safeMm: 3,
    dpi: 300,
    colorSpace: "cmyk",
    iccProfile: "USWebCoatedSWOP",
    format: "pdf",
    needsOutputIntent: true,
  },
  tgc: {
    id: "tgc",
    label: "The Game Crafter (US)",
    trimMm: [70, 121],
    bleedMm: 3,
    safeMm: 3,
    dpi: 300,
    colorSpace: "srgb", // ⚠️ TGC accepts RGB only — CMYK is rejected
    format: "png",
    needsOutputIntent: false,
  },
  printninja: {
    id: "printninja",
    label: "PrintNinja offset (大量)",
    trimMm: [70, 121],
    bleedMm: 3,
    safeMm: 5,
    dpi: 300,
    colorSpace: "cmyk",
    iccProfile: "USWebCoatedSWOP",
    format: "pdf",
    needsOutputIntent: true, // multi-page deck in full; this MVP bakes a single card
  },
};

const MM_PER_INCH = 25.4;

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}
export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * 72;
}

export type PrintGeometry = {
  /** artwork incl. bleed = MediaBox / BleedBox (px for the raster resize) */
  bleedPx: [number, number];
  /** artwork incl. bleed = MediaBox / BleedBox (pt for the PDF page) */
  bleedPt: [number, number];
  /** finished size = TrimBox (pt) */
  trimPt: [number, number];
  /** TrimBox offset inside MediaBox = bleed (pt) */
  bleedOffsetPt: number;
};

/** Compute px/pt geometry for a destination (trim + bleed). Plan §10.1. */
export function getPrintGeometry(d: PrintDestination): PrintGeometry {
  const [tw, th] = d.trimMm;
  const bleedW = tw + d.bleedMm * 2;
  const bleedH = th + d.bleedMm * 2;
  return {
    bleedPx: [mmToPx(bleedW, d.dpi), mmToPx(bleedH, d.dpi)],
    bleedPt: [mmToPt(bleedW), mmToPt(bleedH)],
    trimPt: [mmToPt(tw), mmToPt(th)],
    bleedOffsetPt: mmToPt(d.bleedMm),
  };
}
