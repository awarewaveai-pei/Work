import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import {
  toPrintFile,
  getPrintGeometry,
  PRINT_DESTINATIONS,
  type PrintDestination,
} from "../to-print-file";
import { OutputIntentNotDeployedError } from "../ghostscript-pdfx";

// small RGB test image (skin block) as input
async function testInput(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 240, g: 180, b: 150 } },
  })
    .png()
    .toBuffer();
}

// TRANSPARENT RGBA input — mirrors bg-remover.ts upstream output. Used to prove the
// source alpha is flattened to white on BOTH branches (critic Major, 2026-06-13).
async function testInputRGBA(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
}

// CMYK destination WITHOUT the deploy-gated OutputIntent — lets us exercise the
// CMYK→pdf-lib branch (DeviceCMYK + boxes) without needing Ghostscript locally.
const CMYK_NO_INTENT: PrintDestination = {
  id: "tw-local",
  label: "test cmyk no-intent",
  trimMm: [70, 120],
  bleedMm: 3,
  safeMm: 3,
  dpi: 300,
  colorSpace: "cmyk",
  iccProfile: "JapanColor2001Coated",
  format: "pdf",
  needsOutputIntent: false, // skip gs gate for the geometry/colorspace assertions
};

describe("getPrintGeometry (mm → px/pt)", () => {
  it("tw-local 70×120 + 3mm bleed matches POC expected geometry", () => {
    const g = getPrintGeometry(PRINT_DESTINATIONS["tw-local"]);
    expect(g.bleedPx).toEqual([898, 1488]); // round(76/25.4*300), round(126/25.4*300)
    expect(g.bleedPt[0]).toBeCloseTo(215.433, 2);
    expect(g.bleedPt[1]).toBeCloseTo(357.165, 2);
    expect(g.trimPt[0]).toBeCloseTo(198.425, 2);
    expect(g.trimPt[1]).toBeCloseTo(340.157, 2);
    expect(g.bleedOffsetPt).toBeCloseTo(8.5039, 3);
  });

  it("tgc 70×121 + 3mm bleed → 898×1500 px", () => {
    const g = getPrintGeometry(PRINT_DESTINATIONS.tgc);
    expect(g.bleedPx).toEqual([898, 1500]);
  });
});

describe("PRINT_DESTINATIONS SSOT", () => {
  it("tgc is sRGB PNG (CMYK is rejected by The Game Crafter)", () => {
    expect(PRINT_DESTINATIONS.tgc.colorSpace).toBe("srgb");
    expect(PRINT_DESTINATIONS.tgc.format).toBe("png");
    expect(PRINT_DESTINATIONS.tgc.needsOutputIntent).toBe(false);
  });
  it("cmyk destinations carry an ICC profile + needOutputIntent", () => {
    for (const id of ["tw-local", "mpc", "printninja"] as const) {
      const d = PRINT_DESTINATIONS[id];
      expect(d.colorSpace).toBe("cmyk");
      expect(d.format).toBe("pdf");
      expect(d.needsOutputIntent).toBe(true);
      expect(d.iccProfile).toBeTruthy();
    }
  });
});

describe("toPrintFile — CMYK PDF branch (real sharp + pdf-lib bake)", () => {
  it("embeds DeviceCMYK + /Decode and sets MediaBox/BleedBox/TrimBox", async () => {
    const { buffer, mime } = await toPrintFile(await testInput(), CMYK_NO_INTENT);
    expect(mime).toBe("application/pdf");

    // raw-buffer assertions: image XObject stays uncompressed (streams can't go in
    // object streams), so /DeviceCMYK + /Decode are plaintext-greppable regardless.
    const raw = buffer.toString("latin1");
    expect(raw.includes("/DeviceCMYK")).toBe(true);
    expect(raw.includes("/DeviceRGB")).toBe(false); // not converted back to RGB
    expect(raw.includes("/Decode")).toBe(true); // libvips APP14 t=0 → pdf-lib auto /Decode

    // box assertions via API (robust to object-stream compression)
    const doc = await PDFDocument.load(buffer);
    const page = doc.getPage(0);
    const media = page.getMediaBox();
    const trim = page.getTrimBox();
    const bleed = page.getBleedBox();
    expect(media.width).toBeCloseTo(215.433, 1);
    expect(media.height).toBeCloseTo(357.165, 1);
    expect(bleed.width).toBeCloseTo(215.433, 1);
    expect(trim.x).toBeCloseTo(8.5039, 1); // TrimBox offset = bleed
    expect(trim.y).toBeCloseTo(8.5039, 1);
    expect(trim.width).toBeCloseTo(198.425, 1);
    expect(trim.height).toBeCloseTo(340.157, 1);
  });

  it("garbage colorGrade (NaN/undefined) does not corrupt the bake [defense-in-depth]", async () => {
    const { buffer, mime } = await toPrintFile(await testInput(), CMYK_NO_INTENT, {
      hue: NaN,
      saturation: undefined,
      brightness: "x",
    } as unknown as never);
    expect(mime).toBe("application/pdf");
    expect(buffer.toString("latin1").includes("/DeviceCMYK")).toBe(true);
  });
});

describe("toPrintFile — sRGB PNG branch (TGC)", () => {
  it("tgc → sRGB PNG buffer, 3 channels, sized to bleed box", async () => {
    const { buffer, mime } = await toPrintFile(await testInput(), PRINT_DESTINATIONS.tgc);
    expect(mime).toBe("image/png");
    const m = await sharp(buffer).metadata();
    expect(m.format).toBe("png");
    expect(m.space).toBe("srgb");
    expect(m.channels).toBe(3);
    expect(m.width).toBe(898);
    expect(m.height).toBe(1500);
  });

  it("transparent RGBA input is flattened to OPAQUE white — no alpha holes [critic Major]", async () => {
    // bg-remover.ts emits transparent RGBA; TGC PNG must be opaque (3ch), not show
    // page background through removed areas. Pre-fix this produced 4ch RGBA (false-green).
    const { buffer } = await toPrintFile(await testInputRGBA(), PRINT_DESTINATIONS.tgc);
    const m = await sharp(buffer).metadata();
    expect(m.channels).toBe(3);
    expect(m.hasAlpha).toBe(false);
    const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]); // flattened to white
  });
});

describe("toPrintFile — transparent RGBA on CMYK branch", () => {
  it("RGBA input flattens (no alpha) on the CMYK bake too", async () => {
    const { buffer, mime } = await toPrintFile(await testInputRGBA(), CMYK_NO_INTENT);
    expect(mime).toBe("application/pdf");
    expect(buffer.toString("latin1").includes("/DeviceCMYK")).toBe(true);
    // embedded CMYK image must not carry a soft-mask / alpha (would print as a hole)
    expect(buffer.toString("latin1").includes("/SMask")).toBe(false);
  });
});

describe("toPrintFile — OutputIntent deploy gate", () => {
  it("a real needsOutputIntent destination throws OutputIntentNotDeployedError", async () => {
    // tw-local needsOutputIntent=true; gs is deploy-gated → must throw, NOT silently
    // emit a non-PDF/X file a printer would reject.
    await expect(toPrintFile(await testInput(), PRINT_DESTINATIONS["tw-local"])).rejects.toThrow(
      OutputIntentNotDeployedError
    );
  });
});
