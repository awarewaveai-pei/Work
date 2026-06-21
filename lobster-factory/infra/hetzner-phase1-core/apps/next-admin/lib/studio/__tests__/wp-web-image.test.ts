import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { toWebUnder150KB } from "../wp-web-image";

const CAP = 150 * 1024;

/** A large RGB gradient (representative illustration entropy, comfortably > the 1280px display cap). */
async function bigGradient(width: number, height: number): Promise<Buffer> {
  const buf = Buffer.allocUnsafe(width * height * 3);
  let o = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[o++] = (x * 255) / width;
      buf[o++] = (y * 255) / height;
      buf[o++] = 128;
    }
  }
  return sharp(buf, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("wp-web-image · toWebUnder150KB (real sharp encode)", () => {
  it("downscales a large image to ≤1280px, encodes WebP, and stays ≤150KB", async () => {
    const out = await toWebUnder150KB(await bigGradient(1600, 2133));
    const m = await sharp(out).metadata();
    expect(m.format).toBe("webp"); // operator rule: WebP only
    expect(Math.max(m.width ?? 0, m.height ?? 0)).toBeLessThanOrEqual(1280); // display cap
    expect(out.byteLength).toBeLessThanOrEqual(CAP); // operator rule: ≤150KB to WP
  });

  it("does not enlarge a source already smaller than the cap dimension", async () => {
    const small = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const out = await toWebUnder150KB(small);
    const m = await sharp(out).metadata();
    expect(m.format).toBe("webp");
    expect(m.width).toBe(300); // withoutEnlargement — never upscale
    expect(m.height).toBe(200);
    expect(out.byteLength).toBeLessThanOrEqual(CAP);
  });

  it("flattens source transparency onto opaque white (no transparent product holes)", async () => {
    const transparent = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const out = await toWebUnder150KB(transparent);
    const m = await sharp(out).metadata();
    expect(m.format).toBe("webp");
    // flatten() drops the alpha channel → opaque output.
    expect(m.hasAlpha).toBe(false);
  });
});
