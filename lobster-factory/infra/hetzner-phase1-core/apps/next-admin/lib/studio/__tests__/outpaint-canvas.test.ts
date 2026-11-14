// 擴圖 on a model with no `outpaint` input (gpt-image-2.6) is pure geometry, so it is checked on real pixels for every
// preset. Both cases come from the Codex review of 2026-11-14, each of which would have charged for an unusable image:
//   1. the mask reached openaiMask() as alpha-only, which strips alpha and reads luminance -> nothing was editable
//   2. the API answers in one of three fixed sizes, so a 2:1 canvas came back 3:2 and could not be put back in place
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { OUTPAINT_PRESETS, outpaintFrame } from "../../../public/editor-shared/outpaint-presets.js";
import { cropOutpaintResult, outpaintCanvas } from "../generative-fill";

const BOX = { "1:1": [1024, 1024], "3:2": [1536, 1024], "2:3": [1024, 1536] } as const;
const du = (b: Buffer) => `data:image/png;base64,${b.toString("base64")}`;
const plate = (w: number, h: number, c = 60) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: c, g: c, b: c, alpha: 1 } } }).png().toBuffer();

// A square source is the case the review named: 向左擴 makes it 2:1, which matches none of the three sizes.
const SOURCES: [number, number][] = [[900, 900], [896, 1485], [1485, 896]];

describe("outpaintCanvas", () => {
  for (const [w, h] of SOURCES) {
    for (const preset of OUTPAINT_PRESETS as readonly string[]) {
      it(`${w}x${h} ${preset}: lands in an API size, masks only the new margin, crops back to the canvas`, async () => {
        const f0 = outpaintFrame(preset as never, w, h)!;
        const c = await outpaintCanvas(du(await plate(w, h)), preset as never);
        if (Math.round(f0.W) <= w && Math.round(f0.H) <= h) {
          // 補成正方形 on a square image adds no margin; the route refuses it rather than charging for a no-op.
          expect(c, "a preset that adds nothing must not build a paid request").toBeNull();
          return;
        }
        expect(c, "no canvas built").toBeTruthy();

        const [bw, bh] = BOX[c!.aspectRatio];
        const img = await sharp(Buffer.from(c!.image.split(",")[1], "base64")).metadata();
        expect([img.width, img.height], "the image must be exactly the size the API answers in").toEqual([bw, bh]);

        // openaiMask() does removeAlpha().greyscale() and sets alpha = 255 - luminance, so the mask has to be
        // opaque black (keep) and opaque white (change) -- never alpha-only, and never grey.
        const m = await sharp(Buffer.from(c!.mask.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
        let white = 0, black = 0, grey = 0;
        for (let i = 0; i < m.data.length; i += m.info.channels) {
          const v = m.data[i];
          if (v > 250) white++; else if (v < 5) black++; else grey++;
        }
        expect(grey, "a grey mask pixel becomes a half-editable pixel at OpenAI").toBe(0);
        expect(white, "nothing was marked editable: the model would return the image unchanged and still bill").toBeGreaterThan(0);
        expect(black, "the source area must be marked keep").toBeGreaterThan(0);

        // The answer comes back at the box size; cropping it must give exactly the preset's canvas.
        const f = outpaintFrame(preset as never, w, h)!;
        const out = (await cropOutpaintResult(du(await plate(bw, bh, 9)), c!))!;
        const om = await sharp(Buffer.from(out.split(",")[1], "base64")).metadata();
        expect([om.width, om.height], "the editor places this at the preset's canvas size").toEqual([Math.round(f.W), Math.round(f.H)]);
      });
    }
  }

  it("the white margin is where the preset adds canvas, not over the source", async () => {
    // 向右擴 on a square: the source stays at the left, so the right half must be white and the left half black.
    const c = (await outpaintCanvas(du(await plate(900, 900)), "Right outpaint" as never))!;
    const m = await sharp(Buffer.from(c.mask.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => m.data[(y * m.info.width + x) * m.info.channels];
    const { left, top, width, height } = c.crop;
    expect(at(left + Math.round(width * 0.25), top + Math.round(height / 2)), "source half must be keep").toBeLessThan(5);
    expect(at(left + Math.round(width * 0.75), top + Math.round(height / 2)), "new half must be editable").toBeGreaterThan(250);
  });
});
