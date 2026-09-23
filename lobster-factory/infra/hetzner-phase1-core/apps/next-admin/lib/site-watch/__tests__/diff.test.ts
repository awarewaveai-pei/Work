// C6 visual comparison on synthesized JPEGs: the ratio the 5% threshold is applied to.
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { VISUAL_DIFF_RATIO } from "@/lib/site-watch/config";
import { compareScreenshots } from "@/lib/site-watch/diff";

const solid = (w: number, h: number, v: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: v, g: v, b: v } } }).jpeg({ quality: 80 }).toBuffer();

async function halfInverted(): Promise<Buffer> {
  const left = await sharp({ create: { width: 50, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
  return sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite([{ input: left, left: 0, top: 0 }])
    .jpeg({ quality: 80 })
    .toBuffer();
}

describe("compareScreenshots", () => {
  it("the same capture is a match, well under the threshold", async () => {
    const a = await solid(100, 100, 200);
    const { ratio, diffImage } = await compareScreenshots(a, a);
    expect(ratio).toBe(0);
    expect(diffImage.subarray(0, 2).toString("hex")).toBe("ffd8");
  });

  it("half the page changed is about half", async () => {
    const { ratio } = await compareScreenshots(await solid(100, 100, 255), await halfInverted());
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
    expect(ratio).toBeGreaterThan(VISUAL_DIFF_RATIO);
  });

  it("a page that grew counts the new rows as changed (same pixels above)", async () => {
    const { ratio } = await compareScreenshots(await solid(100, 100, 128), await solid(100, 150, 128));
    expect(ratio).toBeCloseTo(50 / 150, 2);
  });

  it("a different width means the capture changed, reported as a full change", async () => {
    const { ratio } = await compareScreenshots(await solid(100, 100, 128), await solid(120, 100, 128));
    expect(ratio).toBe(1);
  });
});
