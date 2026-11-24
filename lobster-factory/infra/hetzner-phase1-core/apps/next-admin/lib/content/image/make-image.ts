// One content image: generate (lib/tarot/image-gen.ts, billed on the grant), compress to WebP, store in R2.
// Used by the article tool's image route and by the automatic topic pipeline (topics/make.ts).
import sharp from "sharp";
import type { Grant } from "@/lib/entitlements/can";
import { generateTarotImage, type AspectRatio, type TarotModel } from "@/lib/tarot/image-gen";
import { isR2Configured, buildDesignKey, putDesignObject } from "@/lib/storage/r2";
import { articleImagePrompt, articleStylePrompt } from "./article-image";

/** Parse a data URL → { buffer, mime }. Returns null on malformed input. */
function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-z0-9+.\-]+);base64,([\s\S]+)$/);
  if (!m) return null;
  try {
    return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

/** Compress any image buffer to WebP ≤200KB @ 1200px wide. If sharp errors, the original PNG is returned unchanged.
 *  No text is ever drawn here: an article's cover title is the cover layout's (lib/content/cover, K25). */
async function toWebP(buf: Buffer): Promise<{ buffer: Buffer; mime: string }> {
  try {
    const resized = () => sharp(buf).resize({ width: 1200, withoutEnlargement: true });
    let webp = await resized().webp({ quality: 80 }).toBuffer();
    if (webp.length > 200_000) webp = await resized().webp({ quality: 62 }).toBuffer();
    return { buffer: webp, mime: "image/webp" };
  } catch (err) {
    console.warn("[image/route] sharp compression failed, returning original:", err);
    return { buffer: buf, mime: "image/png" };
  }
}

export interface ContentImageInput {
  model: TarotModel;
  prompt: string;
  aspectRatio: AspectRatio;
  seed: number | null;
  referenceImages?: string[];
  /** English style prompt (STYLE_CATALOG); empty = the plain social-graphic look (an article image: the photo look). */
  imageStyle?: string;
  /** "article" (K10): prompt = the picture's scene, and the result = scene + style + the no-text tail (article-image.ts). */
  purpose?: "article";
  costLog: { route: string; tool: string; jobId?: string | null };
}

/** A stable https URL when stored in R2 (stored), else a WebP data URL; ok:false carries the generator's error code. */
export async function makeContentImage(i: ContentImageInput, grant: Grant): Promise<{ ok: true; imageUrl: string; stored: boolean; seed: number | null } | { ok: false; code: string }> {
  // a size guard for a client-sent style, above the catalog's longest prompt (659 chars, 2026-11-24): 600 cut 5 styles mid-word
  const style = (i.imageStyle ?? "").trim().slice(0, 1000);
  const prompt = i.purpose === "article" ? articleImagePrompt(i.prompt, style || articleStylePrompt(undefined))
    : style ? `${i.prompt}, ${style}` : `${i.prompt}, professional social media graphic, high quality, clean composition, no text overlay`;
  const result = await generateTarotImage({ model: i.model, prompt, aspectRatio: i.aspectRatio, seed: i.seed, referenceImages: i.referenceImages, costLog: i.costLog }, grant);
  if (!result.ok) return { ok: false, code: (result as { ok: false; error: string }).error };
  const parsed = parseDataUrl(result.image);
  let imageUrl = result.image;
  let stored = false;
  if (parsed) {
    const { buffer, mime } = await toWebP(parsed.buffer);
    imageUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    const key = isR2Configured() ? buildDesignKey(mime) : null;
    if (key) {
      const put = await putDesignObject(key, buffer, mime);
      if (put.ok) { imageUrl = put.publicUrl; stored = true; }
    }
  }
  return { ok: true, imageUrl, stored, seed: result.seed };
}
