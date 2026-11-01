import { NextResponse } from "next/server";
import sharp from "sharp";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import type { Grant } from "@/lib/entitlements/can";
import { getDesignObjectByUrl, isDesignsAsset, parseImageDataUrl } from "@/lib/storage/r2";
import { generateImage } from "@/lib/studio/image-provider";
import type { AspectRatio } from "@/lib/studio/model-options";
import { compositeOnFabric, isPrintBox, printCorners } from "@/lib/studio/fabric-print";
import { buildPrintOntoPhotoPrompt } from "@/lib/studio/mockup-prompt";
import { friendlyImageError } from "@/lib/studio/image-errors";

// Prints a design onto a saved plain-garment pose photo. Two engines:
//   ai   (default) -- gpt-image-2.5 edits the photo: the print follows the folds and the torso; ~NT$2, charged to
//                     studio.image like every other generated image (2026-11-01 trials: best of 5 approaches).
//   code           -- lib/studio/fabric-print.ts displacement composite inside the photo's saved print box: free,
//                     half a second, deterministic; a quick preview.
// Both images come from our own designs bucket (or the design as an upload); nothing is fetched from a caller-given host.

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_CHARS = 12_000_000; // ~9 MB base64, same as the other studio routes
const MAX_EDGE = 2048; // larger photos are scaled down first
// The code composite runs on the event loop, O(pixels under the print): a full-photo box on 2K is ~4 M px. Above this
// the photo is scaled down so one request stays well under a second (2026-11-01 review measured 8.6 s at 9 M px).
const MAX_PRINT_PIXELS = 1_500_000;
const INPUT_PIXELS = 25_000_000; // decompression-bomb ceiling, same order as lib/studio/wp-web-image.ts

// One code composite at a time per process: two parallel ones would still share the single event loop.
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function loadImage(input: unknown): Promise<Buffer | { error: string }> {
  if (typeof input !== "string") return { error: "missing" };
  if (input.startsWith("data:")) {
    if (input.length > MAX_IMAGE_CHARS) return { error: "too_large" };
    const parsed = parseImageDataUrl(input);
    return parsed ? parsed.buffer : { error: "bad_data_url" };
  }
  const r = await getDesignObjectByUrl(input, MAX_BYTES);
  return "error" in r ? { error: r.error } : r.body;
}

/** The output ratio closest to the photo's, so the edit keeps its framing. */
export function nearestAspect(width: number, height: number): AspectRatio {
  const r = width / height;
  const options: [AspectRatio, number][] = [["2:3", 2 / 3], ["3:4", 3 / 4], ["4:5", 4 / 5], ["1:1", 1], ["9:16", 9 / 16], ["3:2", 3 / 2], ["4:3", 4 / 3], ["16:9", 16 / 9]];
  return options.reduce((best, o) => (Math.abs(o[1] - r) < Math.abs(best[1] - r) ? o : best))[0];
}

interface Body {
  photo?: unknown;
  design?: unknown;
  box?: unknown;
  designScale?: unknown;
  engine?: unknown;
  placement?: unknown;
  garmentColor?: unknown;
}

type Parsed = { body: Body; scale: number };

// The grant is asked only for the AI engine: the code preview costs nothing and stays open to every operator.
const aiRoute = withFeature<Request, Parsed>("studio.image", handleAi);

export async function POST(request: Request): Promise<Response> {
  if (process.env.POD_DESIGNS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "pod_designs_disabled" }, { status: 503 });
  }
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: Body;
  try { body = (await request.json()) as Body; } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  // The pose photo is always a saved asset; the design may also be a fresh upload.
  if (!isDesignsAsset(body.photo)) {
    return NextResponse.json({ ok: false, error: "photo 須為已存的姿勢照網址" }, { status: 400 });
  }
  const scale = typeof body.designScale === "number" && Number.isFinite(body.designScale) ? body.designScale : 1;
  return body.engine === "code" ? handleCode({ body, scale }) : aiRoute(request, { body, scale });
}

async function handleAi(_request: Request, grant: Grant, { body, scale }: Parsed): Promise<Response> {
  {
    const photo = body.photo;
    if (!isDesignsAsset(photo)) return NextResponse.json({ ok: false, error: "photo 須為已存的姿勢照網址" }, { status: 400 });
    const design = typeof body.design === "string" ? body.design : "";
    const isDataUrl = /^data:image\/(png|jpe?g|webp);base64,/.test(design);
    if (!isDataUrl && !isDesignsAsset(design)) {
      return NextResponse.json({ ok: false, error: "design 須為 png/jpeg/webp data URL 或 My Designs 的圖庫網址" }, { status: 400 });
    }
    if (isDataUrl && design.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ ok: false, error: "設計圖太大（上限 ~9MB）" }, { status: 413 });
    }
    // The photo's own ratio: a 2:3 pose photo comes back 2:3, so nothing is cropped or stretched.
    const photoBuf = await loadImage(photo);
    if ("error" in photoBuf) return NextResponse.json({ ok: false, error: `讀不到姿勢照：${photoBuf.error}` }, { status: 400 });
    const meta = await sharp(photoBuf, { limitInputPixels: INPUT_PIXELS }).rotate().metadata().catch(() => null);
    if (!meta?.width || !meta.height) return NextResponse.json({ ok: false, error: "姿勢照無法讀取" }, { status: 422 });
    const rotated = (meta.orientation ?? 1) >= 5;
    const aspectRatio = nearestAspect(rotated ? meta.height : meta.width, rotated ? meta.width : meta.height);
    const result = await generateImage({
      model: "openai-25-edit",
      prompt: buildPrintOntoPhotoPrompt({
        designScale: scale,
        placement: typeof body.placement === "string" ? body.placement : undefined,
        garmentColor: typeof body.garmentColor === "string" ? body.garmentColor : undefined,
      }),
      referenceImages: [photo, design],
      aspectRatio,
      costLog: { route: "tools/studio/fabric-print", tool: "mockup" },
    }, grant);
    if (result.ok) return NextResponse.json({ ok: true, image: result.image, engine: "ai" });
    const code = (result as { ok: false; error: string }).error;
    // HTTP 200 with ok:false so the JSON reaches the browser (same convention as /api/tools/studio/generate).
    return NextResponse.json({ ok: false, error: friendlyImageError(code), code });
  }
}

async function handleCode({ body, scale }: Parsed): Promise<Response> {
  if (!isPrintBox(body.box)) {
    return NextResponse.json({ ok: false, error: "程式印需要先框印花位置（box {x,y,w,h}，0–1）" }, { status: 400 });
  }
  const box = body.box;
  const [photoBuf, designBuf] = await Promise.all([loadImage(body.photo), loadImage(body.design)]);
  if ("error" in photoBuf) return NextResponse.json({ ok: false, error: `讀不到姿勢照：${photoBuf.error}` }, { status: 400 });
  if ("error" in designBuf) return NextResponse.json({ ok: false, error: `讀不到設計圖：${designBuf.error}` }, { status: 400 });

  try {
    const jpg = await oneAtATime(async () => {
      const opts = { limitInputPixels: INPUT_PIXELS };
      const pMeta = await sharp(photoBuf, opts).rotate().metadata();
      const rotated = (pMeta.orientation ?? 1) >= 5; // EXIF 5-8 swap width and height
      const pw = Math.max(1, (rotated ? pMeta.height : pMeta.width) ?? 1);
      const ph = Math.max(1, (rotated ? pMeta.width : pMeta.height) ?? 1);
      const fit = Math.min(1, MAX_EDGE / Math.max(pw, ph), Math.sqrt(MAX_PRINT_PIXELS / Math.max(1, box.w * pw * box.h * ph)));
      const photo = await sharp(photoBuf, opts).rotate()
        .resize(Math.max(1, Math.round(pw * fit)), Math.max(1, Math.round(ph * fit)), { fit: "fill" })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const dMeta = await sharp(designBuf, opts).rotate().metadata();
      const dRot = (dMeta.orientation ?? 1) >= 5;
      const dw = (dRot ? dMeta.height : dMeta.width) ?? 0;
      const dh = (dRot ? dMeta.width : dMeta.height) ?? 0;
      if (!dw || !dh) throw new Error("design_unreadable");
      const corners = printCorners(photo.info, { width: dw, height: dh }, box, scale);
      // Resample the design to about the outline's size once (sharp, Lanczos) so the per-pixel lookup stays sharp.
      const edge = (a: number, b: number) => Math.hypot(corners[b].x - corners[a].x, corners[b].y - corners[a].y);
      const tw = Math.max(1, Math.round(Math.max(edge(0, 1), edge(3, 2))));
      const th = Math.max(1, Math.round(Math.max(edge(0, 3), edge(1, 2))));
      const design = await sharp(designBuf, opts).rotate().resize(tw, th, { fit: "fill" }).ensureAlpha().raw().toBuffer();
      const out = compositeOnFabric(
        { width: photo.info.width, height: photo.info.height, data: photo.data },
        { width: tw, height: th, data: design },
        corners,
      );
      return sharp(Buffer.from(out.data.buffer, out.data.byteOffset, out.data.byteLength), {
        raw: { width: out.width, height: out.height, channels: 4 },
      }).removeAlpha().jpeg({ quality: 92 }).toBuffer();
    });
    return NextResponse.json({ ok: true, image: `data:image/jpeg;base64,${jpg.toString("base64")}`, engine: "code" });
  } catch (e) {
    console.error("[fabric-print] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "合成失敗：圖片無法處理" }, { status: 422 });
  }
}
