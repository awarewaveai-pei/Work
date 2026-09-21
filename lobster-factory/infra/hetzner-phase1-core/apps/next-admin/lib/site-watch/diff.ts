// C6 visual comparison. Screenshots are JPEG (renderer /snapshot); decoded to RGBA with sharp.
import pixelmatch from "pixelmatch";
import sharp from "sharp";
import { PIXEL_THRESHOLD } from "./config";

export interface VisualDiff {
  /** Differing pixels over the larger image's area; height growth/shrink counts as differing rows. */
  ratio: number;
  /** Diff overlay (JPEG) for the evidence view. */
  diffImage: Buffer;
}

async function rgba(img: Buffer) {
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function compareScreenshots(baseline: Buffer, current: Buffer): Promise<VisualDiff> {
  const a = await rgba(baseline);
  const b = await rgba(current);
  if (a.width !== b.width) {
    // Widths are fixed by the renderer (1366); a mismatch means the capture changed, not the page.
    // Report it as a full change so the operator re-baselines rather than trusting a skewed ratio.
    return { ratio: 1, diffImage: await sharp(current).jpeg({ quality: 70 }).toBuffer() };
  }
  const width = a.width;
  const height = Math.min(a.height, b.height);
  const bytes = width * height * 4;
  const out = Buffer.alloc(bytes);
  const differing = pixelmatch(a.data.subarray(0, bytes), b.data.subarray(0, bytes), out, width, height, {
    threshold: PIXEL_THRESHOLD,
  });
  const maxArea = width * Math.max(a.height, b.height);
  const extraRows = width * Math.abs(a.height - b.height);
  const diffImage = await sharp(out, { raw: { width, height, channels: 4 } }).jpeg({ quality: 70 }).toBuffer();
  return { ratio: maxArea === 0 ? 0 : (differing + extraRows) / maxArea, diffImage };
}
