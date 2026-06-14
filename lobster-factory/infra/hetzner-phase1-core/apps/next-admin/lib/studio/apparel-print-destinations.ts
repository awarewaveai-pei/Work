/**
 * Apparel print destinations — PURE data SSOT (Phase 3). NO sharp/node imports, so this
 * is safe to import from CLIENT components (the publish wizard reads the labels + specs).
 *
 * Two fulfilment routes for the same design, decided by the artist (2026-06-15):
 *   - printful   : international fulfilment. Printful prints from the file linked in the
 *                  publish chain; PNG, its printfile area is 12×16 in (16 in = long edge) @ up to 300 DPI.
 *   - tw-local   : Taiwan local print shop (DTG / screen / heat-transfer). The artist
 *                  downloads a print-ready file and sends it to the shop herself.
 *
 * ⚠️ The tw-local spec below is the DTG INDUSTRY DEFAULT (transparent-background PNG,
 * 300 DPI, 4800 px long edge), chosen because the artist's specific shop spec is not yet
 * known. When the shop provides its real requirements (file type / size / colour space /
 * CMYK), update THIS file — it is the single source of truth. The print-file builder
 * (print-file.ts) already produces a faithful PNG at the target long edge; this module
 * only declares the target + the human guidance.
 */

export type ApparelPrintDestinationId = "printful" | "tw-local";
export type ApparelPrintFormat = "png";

export interface ApparelPrintDestination {
  id: ApparelPrintDestinationId;
  /** UI label, e.g. "🇹🇼 台灣本地印刷廠". */
  label: string;
  format: ApparelPrintFormat;
  dpi: 300;
  /** target long edge in px (300 DPI × 16 in front print area = 4800). */
  longEdgePx: number;
  /** DTG/screen print want the garment colour to show through → transparent background. */
  transparentBackground: boolean;
  /** Whether the artist downloads the file (tw-local) or the system links it (printful). */
  delivery: "download" | "auto-link";
  /** Short human guidance shown in the wizard. */
  note: string;
}

export const APPAREL_PRINT_DESTINATIONS: Record<ApparelPrintDestinationId, ApparelPrintDestination> = {
  printful: {
    id: "printful",
    label: "🌎 Printful（國際履約）",
    format: "png",
    dpi: 300,
    longEdgePx: 4800,
    transparentBackground: true,
    delivery: "auto-link",
    note: "上架流程自動把印刷檔綁到 Printful 變體；Printful 直接印+寄。建議先去背（透明底）再產印刷檔。",
  },
  "tw-local": {
    id: "tw-local",
    label: "🇹🇼 台灣本地印刷廠（DTG／絹印）",
    format: "png",
    dpi: 300,
    longEdgePx: 4800,
    transparentBackground: true,
    delivery: "download",
    note: "下載印刷檔自行送印刷廠。預設為業界通用 DTG 規格（透明底 PNG、300DPI、最長邊 4800px）；拿到廠商實際規格後以 apparel-print-destinations.ts 為準更新。",
  },
};

export const DEFAULT_APPAREL_PRINT_DESTINATION: ApparelPrintDestinationId = "printful";
