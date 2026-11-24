// K24 cover renderer: 1200×900 WebP, markup in the title cannot break the SVG, the picture area is the photo and the
// band is bandColor (text never covers the picture).
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderCover } from "../render";
import { DEFAULT_COVER_SETTINGS } from "../settings";

const red = () => sharp({ create: { width: 800, height: 800, channels: 3, background: "#ff0000" } }).png().toBuffer();
const settings = { ...DEFAULT_COVER_SETTINGS, bandColor: "#0000ff" };

async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("renderCover", () => {
  it("outputs a 1200×900 WebP", async () => {
    const out = await renderCover(await red(), { title: "春季保養指南", subtitle: "三步驟" }, settings);
    expect(out.mime).toBe("image/webp");
    const meta = await sharp(out.buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 1200, 900]);
    expect(out.buffer.length).toBeLessThanOrEqual(200_000);
  });

  it("a title with < & and quotes still renders", async () => {
    const out = await renderCover(await red(), { title: `A <b> & "Q" 'x' 標題`, subtitle: "<script>" }, settings);
    expect((await sharp(out.buffer).metadata()).width).toBe(1200);
  });

  it("the picture area comes from the photo and the band is bandColor", async () => {
    const out = await renderCover(await red(), { title: "標題" }, settings);
    const [r1, g1, b1] = await pixel(out.buffer, 600, 300);      // picture area
    expect(r1).toBeGreaterThan(200); expect(g1).toBeLessThan(60); expect(b1).toBeLessThan(60);
    const [r2, g2, b2] = await pixel(out.buffer, 1190, 890);     // band corner, clear of text
    expect(r2).toBeLessThan(60); expect(g2).toBeLessThan(60); expect(b2).toBeGreaterThan(200);
  });

  it("no title throws", async () => {
    await expect(renderCover(await red(), { title: "  " }, settings)).rejects.toThrow("cover_title_required");
  });
});
