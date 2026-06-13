import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { toProductImage, toProductImageDataUrl, WEB_PRESETS } from "../to-product-image";

// build a small RGB test image (skin block) as input
async function testInput(): Promise<Buffer> {
  return sharp({
    create: { width: 120, height: 180, channels: 3, background: { r: 240, g: 180, b: 150 } },
  })
    .png()
    .toBuffer();
}

describe("to-product-image (real sharp bake)", () => {
  it("web-tarot → 667×1000 WebP sRGB (cover, no padding)", async () => {
    const out = await toProductImage(await testInput(), "web-tarot");
    const m = await sharp(out).metadata();
    expect(m.format).toBe("webp");
    expect(m.width).toBe(WEB_PRESETS["web-tarot"].width); // 667
    expect(m.height).toBe(WEB_PRESETS["web-tarot"].height); // 1000
    expect(m.space).toBe("srgb");
  });

  it("web-square → 1000×1000 WebP sRGB (contain, white bg)", async () => {
    const out = await toProductImage(await testInput(), "web-square");
    const m = await sharp(out).metadata();
    expect(m.format).toBe("webp");
    expect(m.width).toBe(1000);
    expect(m.height).toBe(1000);
    expect(m.space).toBe("srgb");
  });

  it("colorGrade applies without throwing; neutral grade is a no-op", async () => {
    const graded = await toProductImage(await testInput(), "web-square", {
      hue: 15,
      saturation: 1.5,
      brightness: 1.1,
    });
    expect((await sharp(graded).metadata()).format).toBe("webp");
    // neutral grade should still produce a valid image (modulate skipped)
    const neutral = await toProductImage(await testInput(), "web-square", {
      hue: 0,
      saturation: 1,
      brightness: 1,
    });
    expect((await sharp(neutral).metadata()).width).toBe(1000);
  });

  it("levels block actually bakes: gray-128 with black-point=64 → pixels darken [REALTEST]", async () => {
    const gray = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();
    // levels {black:64}: input 128 → (128-64)·255/(255-64) = 64·255/191 ≈ 85 (darker).
    // (white-point slider min is 191, so the brighten direction is bounded; black-point
    //  gives a clean, observable shift that proves the .linear() block runs.)
    const out = await toProductImage(gray, "web-square", {
      hue: 0, saturation: 1, brightness: 1, black: 64,
    });
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const mid = (500 * 1000 + 500) * 3; // center pixel = content (square contain, no letterbox)
    expect(data[mid]).toBeLessThan(110); // darkened from 128 by the levels block
  });

  it("sharpen block bakes without throwing and keeps a valid webp", async () => {
    const out = await toProductImage(await testInput(), "web-square", {
      hue: 0, saturation: 1, brightness: 1, sharpen: 5,
    });
    expect((await sharp(out).metadata()).format).toBe("webp");
  });

  it("garbage colorGrade (NaN/undefined) does not corrupt the bake [defense-in-depth]", async () => {
    const out = await toProductImage(await testInput(), "web-tarot", {
      hue: NaN,
      saturation: undefined,
      brightness: "x",
    } as unknown as never);
    const m = await sharp(out).metadata();
    expect(m.format).toBe("webp");
    expect(m.width).toBe(667);
  });

  it("flattens transparent (bg-removed) input to OPAQUE white — no alpha holes [critic Major]", async () => {
    // bg-remover.ts emits transparent PNG upstream; web output must be opaque white,
    // not show the page background through the subject's removed area.
    const transparent = await sharp({
      create: { width: 100, height: 150, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    for (const preset of ["web-square", "web-tarot"] as const) {
      const out = await toProductImage(transparent, preset);
      const m = await sharp(out).metadata();
      expect(m.hasAlpha).toBe(false); // alpha flattened away
      // top-left pixel must be opaque white, not transparent/black
      const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
    }
  });

  it("contain letterbox padding is white, not Sharp's default black", async () => {
    // wide input → web-square (1000×1000 contain) pads top/bottom; pad must be white
    const wide = await sharp({
      create: { width: 300, height: 60, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const out = await toProductImage(wide, "web-square");
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]); // top row = letterbox = white
  });

  it("data URL helper emits a webp base64 string", async () => {
    const url = await toProductImageDataUrl(await testInput(), "web-tarot");
    expect(url.startsWith("data:image/webp;base64,")).toBe(true);
  });

  it("WebP stays small (quality 80) — under 100KB for 1000px", async () => {
    const out = await toProductImage(await testInput(), "web-square");
    expect(out.length).toBeLessThan(100 * 1024);
  });
});
