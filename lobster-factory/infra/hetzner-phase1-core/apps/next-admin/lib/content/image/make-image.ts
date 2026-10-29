// One content image: generate (lib/tarot/image-gen.ts, billed on the grant), compress to WebP, store in R2.
// Used by the article tool's image route and by the automatic topic pipeline (topics/make.ts).
import sharp from "sharp";
import type { Grant } from "@/lib/entitlements/can";
import { generateTarotImage, type AspectRatio, type TarotModel } from "@/lib/tarot/image-gen";
import { isR2Configured, buildDesignKey, putDesignObject } from "@/lib/storage/r2";

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

/** Build SVG overlay for title text. Handles both "bottom" (gradient bar) and "center" positions. */
function buildTitleSvg(W: number, H: number, fontSize: number, fontFamily: string, escapedText: string, position: string): string {
  if (position === "center") {
    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${W}" height="${H}" fill="rgba(0,0,0,0.45)" />
  <text x="${W / 2}" y="${H / 2}"
    font-family="${fontFamily}" font-size="${fontSize}" font-weight="700"
    fill="white" text-anchor="middle" dominant-baseline="middle"
    filter="drop-shadow(0px 1px 3px rgba(0,0,0,0.6))"
  >${escapedText}</text>
</svg>`;
  }
  const barH = Math.round(H * 0.28);
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)" />
      <stop offset="100%" stop-color="rgba(0,0,0,0.72)" />
    </linearGradient>
  </defs>
  <rect x="0" y="${H - barH}" width="${W}" height="${barH}" fill="url(#g)" />
  <text x="${W / 2}" y="${H - Math.round(barH * 0.28)}"
    font-family="${fontFamily}" font-size="${fontSize}" font-weight="700"
    fill="white" text-anchor="middle" dominant-baseline="middle"
    filter="drop-shadow(0px 1px 3px rgba(0,0,0,0.6))"
  >${escapedText}</text>
</svg>`;
}

/**
 * Compress any image buffer to WebP ≤200KB @ 1200px wide.
 * Falls back gracefully: if sharp errors, returns the original PNG buffer + mime unchanged.
 * fontStyle: "sans" | "serif" | "none" — "none" skips overlay entirely.
 * titlePosition: "bottom" (gradient bar) | "center" (semi-transparent full cover).
 */
async function toWebP(
  buf: Buffer,
  titleText?: string,
  fontStyle?: string,
  titlePosition?: string,
): Promise<{ buffer: Buffer; mime: string }> {
  try {
    const showOverlay = !!(titleText && titleText.trim() && fontStyle !== "none");
    let overlayBuf: Buffer | undefined;

    if (showOverlay) {
      const meta     = await sharp(buf).resize({ width: 1200, withoutEnlargement: true }).metadata();
      const W        = meta.width  ?? 1200;
      const H        = meta.height ?? 675;
      const fontSize = Math.max(24, Math.min(48, Math.round(W / 22)));
      // CJK characters occupy ~1.0em width; Latin ~0.65em
      const hasCJK   = /[一-鿿぀-ヿ가-힯]/.test(titleText!);
      const maxChars = Math.max(1, Math.floor(W / (fontSize * (hasCJK ? 1.0 : 0.65))));
      const text     = titleText!.length > maxChars ? titleText!.slice(0, maxChars - 1) + "…" : titleText!;
      const escaped  = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const fontFamily = fontStyle === "serif"
        ? "'Noto Serif TC','Noto Serif SC','Noto Serif CJK TC',serif"
        : "'Noto Sans TC','Noto Sans SC','Noto Sans CJK TC',sans-serif";
      overlayBuf = Buffer.from(buildTitleSvg(W, H, fontSize, fontFamily, escaped, titlePosition ?? "bottom"));
    }

    const composite = (b: Buffer) => {
      const base = sharp(b).resize({ width: 1200, withoutEnlargement: true });
      return overlayBuf ? base.composite([{ input: overlayBuf, top: 0, left: 0 }]) : base;
    };

    let webp = await composite(buf).webp({ quality: 80 }).toBuffer();
    if (webp.length > 200_000) {
      webp = await composite(buf).webp({ quality: 62 }).toBuffer();
    }
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
  /** English style prompt (STYLE_CATALOG); empty = the plain social-graphic look. */
  imageStyle?: string;
  /** Title overlay on hero/featured images; font "none" skips it. */
  titleText?: string;
  featuredImageFont?: string;
  featuredImageTitlePosition?: string;
  costLog: { route: string; tool: string; jobId?: string | null };
}

/** A stable https URL when stored in R2 (stored), else a WebP data URL; ok:false carries the generator's error code. */
export async function makeContentImage(i: ContentImageInput, grant: Grant): Promise<{ ok: true; imageUrl: string; stored: boolean; seed: number | null } | { ok: false; code: string }> {
  const style = (i.imageStyle ?? "").trim().slice(0, 600);
  const prompt = style ? `${i.prompt}, ${style}` : `${i.prompt}, professional social media graphic, high quality, clean composition, no text overlay`;
  const result = await generateTarotImage({ model: i.model, prompt, aspectRatio: i.aspectRatio, seed: i.seed, referenceImages: i.referenceImages, costLog: i.costLog }, grant);
  if (!result.ok) return { ok: false, code: (result as { ok: false; error: string }).error };
  const parsed = parseDataUrl(result.image);
  let imageUrl = result.image;
  let stored = false;
  if (parsed) {
    const { buffer, mime } = await toWebP(parsed.buffer, i.titleText || undefined, i.featuredImageFont ?? "sans", i.featuredImageTitlePosition ?? "bottom");
    imageUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    const key = isR2Configured() ? buildDesignKey(mime) : null;
    if (key) {
      const put = await putDesignObject(key, buffer, mime);
      if (put.ok) { imageUrl = put.publicUrl; stored = true; }
    }
  }
  return { ok: true, imageUrl, stored, seed: result.seed };
}
