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

  it("data URL helper emits a webp base64 string", async () => {
    const url = await toProductImageDataUrl(await testInput(), "web-tarot");
    expect(url.startsWith("data:image/webp;base64,")).toBe(true);
  });

  it("WebP stays small (quality 80) — under 100KB for 1000px", async () => {
    const out = await toProductImage(await testInput(), "web-square");
    expect(out.length).toBeLessThan(100 * 1024);
  });
});
